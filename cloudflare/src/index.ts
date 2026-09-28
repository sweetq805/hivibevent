import type { D1Database, R2Bucket } from "@cloudflare/workers-types";

type Env = {
  ACCOUNTING_DB: D1Database;
  RECEIPTS: R2Bucket;
  ASSETS?: Fetcher;
};

type JsonRecord = Record<string, unknown>;
type CostModule = "activity" | "fragrance";
type ReportType = "activity_cost" | "fragrance_cost" | "activity_advance" | "fragrance_advance" | "receipts";

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

function json(data: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...extra },
  });
}

function errorResponse(message: string, status = 400, code = "BAD_REQUEST") {
  return json({ success: false, error: { code, message } }, status);
}

function now() {
  return Date.now();
}

function makeId() {
  return crypto.randomUUID();
}

function asString(value: unknown, fallback = "") {
  return String(value ?? fallback).trim();
}

function asMoney(value: unknown) {
  const parsed = Number(String(value ?? 0).replace(/[NT$,$\s]/g, ""));
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

function asDate(value: unknown) {
  const raw = asString(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const slash = raw.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
  if (slash) return `${slash[1]}-${slash[2].padStart(2, "0")}-${slash[3].padStart(2, "0")}`;
  return "";
}

function parseDiscount(value: unknown) {
  const source = asString(value, "1").replace(/％/g, "%");
  if (!source) return 1;
  if (source.endsWith("折")) {
    const n = Number(source.slice(0, -1));
    return Number.isFinite(n) ? Math.max(0, n > 10 ? n / 100 : n / 10) : 1;
  }
  if (source.endsWith("%")) {
    const n = Number(source.slice(0, -1));
    return Number.isFinite(n) ? Math.max(0, n / 100) : 1;
  }
  const n = Number(source);
  return Number.isFinite(n) ? Math.max(0, n > 1 ? n / 100 : n) : 1;
}

async function bodyJson(request: Request): Promise<JsonRecord> {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? body as JsonRecord : {};
  } catch {
    throw new Error("請提供有效的 JSON 資料");
  }
}

async function one<T extends JsonRecord>(db: D1Database, sql: string, ...params: unknown[]) {
  const result = await db.prepare(sql).bind(...params).first<T>();
  return result ?? null;
}

async function all<T extends JsonRecord>(db: D1Database, sql: string, ...params: unknown[]) {
  const result = await db.prepare(sql).bind(...params).all<T>();
  return result.results ?? [];
}

async function alreadyProcessed(db: D1Database, mutationId: string) {
  if (!mutationId) return null;
  return one(db, "SELECT id, entity_type, entity_id, operation, after_json FROM audit_events WHERE client_mutation_id = ? LIMIT 1", mutationId);
}

function reportTypeForCost(module: CostModule): ReportType {
  return module === "activity" ? "activity_cost" : "fragrance_cost";
}

async function ensureMonth(db: D1Database, reportType: ReportType, monthKey: string) {
  const normalized = monthKey.slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(normalized)) throw new Error("月份格式必須為 YYYY-MM");
  await db.prepare(
    "INSERT OR IGNORE INTO report_months (id, report_type, month_key, created_at, updated_at, version) VALUES (?, ?, ?, ?, ?, 1)",
  ).bind(makeId(), reportType, normalized, now(), now()).run();
  const month = await one<{ id: string; month_key: string; version: number }>(db, "SELECT id, month_key, version FROM report_months WHERE report_type = ? AND month_key = ? AND deleted_at IS NULL LIMIT 1", reportType, normalized);
  if (!month) throw new Error("月份建立後無法讀回，資料尚未保存");
  return month;
}

async function classifyCategory(db: D1Database, vendorName: string, sellerTaxId: string, fallback: string) {
  const byName = vendorName
    ? await one<{ category_name: string }>(db, "SELECT category_name FROM category_memory WHERE match_type = 'vendor_name' AND match_key = ? AND deleted_at IS NULL LIMIT 1", vendorName)
    : null;
  if (byName?.category_name) return byName.category_name;
  const byTaxId = sellerTaxId
    ? await one<{ category_name: string }>(db, "SELECT category_name FROM category_memory WHERE match_type = 'seller_tax_id' AND match_key = ? AND deleted_at IS NULL LIMIT 1", sellerTaxId)
    : null;
  return byTaxId?.category_name || fallback;
}

async function createCost(env: Env, module: CostModule, input: JsonRecord) {
  const date = asDate(input.date);
  const vendorName = asString(input.vendor_name ?? input.vendor ?? input.sellerName);
  const sellerTaxId = asString(input.seller_tax_id ?? input.sellerTaxId);
  const categoryInput = asString(input.category_name ?? input.category);
  const amount = asMoney(input.amount_ntd ?? input.amount);
  if (!date) throw new Error("日期格式不正確");
  if (amount < 0) throw new Error("金額不可小於 0");
  const month = await ensureMonth(env.ACCOUNTING_DB, reportTypeForCost(module), date.slice(0, 7));
  const categoryName = await classifyCategory(env.ACCOUNTING_DB, vendorName, sellerTaxId, categoryInput);
  const id = makeId();
  const timestamp = now();
  const mutationId = asString(input.client_mutation_id ?? input.clientMutationId);
  const existing = await alreadyProcessed(env.ACCOUNTING_DB, mutationId);
  if (existing) return { replay: true, row: JSON.parse(asString(existing.after_json, "{}")) };
  const row = {
    id,
    module,
    report_month_id: month.id,
    invoice_type: asString(input.invoice_type ?? input.invoiceType, "電子發票"),
    invoice_no: asString(input.invoice_no ?? input.invoiceNo),
    date,
    buyer_tax_id: asString(input.buyer_tax_id ?? input.buyerTaxId),
    seller_tax_id: sellerTaxId,
    category_name: categoryName,
    vendor_name: vendorName,
    amount_ntd: amount,
    created_at: timestamp,
    updated_at: timestamp,
    version: 1,
    deleted_at: null,
  };
  const audit = { id: makeId(), operation: "create", entity_type: "cost_entry", entity_id: id, before_json: null, after_json: JSON.stringify(row), actor_id: null, client_mutation_id: mutationId || null, created_at: timestamp };
  const statements: D1PreparedStatement[] = [
    env.ACCOUNTING_DB.prepare("INSERT INTO cost_entries (id, module, report_month_id, invoice_type, invoice_no, date, buyer_tax_id, seller_tax_id, category_name, vendor_name, amount_ntd, created_at, updated_at, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)").bind(row.id, row.module, row.report_month_id, row.invoice_type, row.invoice_no, row.date, row.buyer_tax_id, row.seller_tax_id, row.category_name, row.vendor_name, row.amount_ntd, row.created_at, row.updated_at),
    env.ACCOUNTING_DB.prepare("INSERT INTO audit_events (id, operation, entity_type, entity_id, before_json, after_json, actor_id, client_mutation_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(audit.id, audit.operation, audit.entity_type, audit.entity_id, audit.before_json, audit.after_json, audit.actor_id, audit.client_mutation_id, audit.created_at),
  ];
  const memorySql = "INSERT INTO category_memory (id, match_type, match_key, display_value, category_name, note, created_at, updated_at, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1) ON CONFLICT(match_type, match_key) DO UPDATE SET display_value = excluded.display_value, category_name = excluded.category_name, note = excluded.note, updated_at = excluded.updated_at, version = category_memory.version + 1";
  if (vendorName) statements.push(env.ACCOUNTING_DB.prepare(memorySql).bind(makeId(), "vendor_name", vendorName, vendorName, categoryName, "由成本明細自動記憶", timestamp, timestamp));
  if (sellerTaxId) statements.push(env.ACCOUNTING_DB.prepare(memorySql).bind(makeId(), "seller_tax_id", sellerTaxId, sellerTaxId, categoryName, "由成本明細自動記憶", timestamp, timestamp));
  await env.ACCOUNTING_DB.batch(statements);
  const saved = await one(env.ACCOUNTING_DB, "SELECT * FROM cost_entries WHERE id = ? AND deleted_at IS NULL", id);
  if (!saved) throw new Error("D1 寫入後無法讀回成本資料，資料尚未保存");
  return { replay: false, row: saved };
}

async function updateCost(env: Env, id: string, input: JsonRecord) {
  const expectedVersion = Number(input.expected_version ?? input.expectedVersion);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) throw new Error("缺少有效的資料版本");
  const before = await one<JsonRecord>(env.ACCOUNTING_DB, "SELECT * FROM cost_entries WHERE id = ? AND deleted_at IS NULL LIMIT 1", id);
  if (!before) return errorResponse("找不到要修改的資料", 404, "NOT_FOUND");
  const vendorName = asString(input.vendor_name ?? input.vendor ?? input.sellerName ?? before.vendor_name);
  const sellerTaxId = asString(input.seller_tax_id ?? input.sellerTaxId ?? before.seller_tax_id);
  const categoryName = await classifyCategory(env.ACCOUNTING_DB, vendorName, sellerTaxId, asString(input.category_name ?? input.category ?? before.category_name));
  const date = asDate(input.date ?? before.date);
  const timestamp = now();
  const after = { ...before, invoice_type: asString(input.invoice_type ?? input.invoiceType ?? before.invoice_type), invoice_no: asString(input.invoice_no ?? input.invoiceNo ?? before.invoice_no), date, buyer_tax_id: asString(input.buyer_tax_id ?? input.buyerTaxId ?? before.buyer_tax_id), seller_tax_id: sellerTaxId, category_name: categoryName, vendor_name: vendorName, amount_ntd: asMoney(input.amount_ntd ?? input.amount ?? before.amount_ntd), updated_at: timestamp, version: expectedVersion + 1 };
  const mutationId = asString(input.client_mutation_id ?? input.clientMutationId);
  const existing = await alreadyProcessed(env.ACCOUNTING_DB, mutationId);
  if (existing) return json({ success: true, replay: true, row: JSON.parse(asString(existing.after_json, "{}")) });
  const auditId = makeId();
  const update = env.ACCOUNTING_DB.prepare("UPDATE cost_entries SET invoice_type = ?, invoice_no = ?, date = ?, buyer_tax_id = ?, seller_tax_id = ?, category_name = ?, vendor_name = ?, amount_ntd = ?, updated_at = ?, version = version + 1 WHERE id = ? AND version = ? AND deleted_at IS NULL").bind(after.invoice_type, after.invoice_no, after.date, after.buyer_tax_id, after.seller_tax_id, after.category_name, after.vendor_name, after.amount_ntd, after.updated_at, id, expectedVersion);
  const audit = env.ACCOUNTING_DB.prepare("INSERT INTO audit_events (id, operation, entity_type, entity_id, before_json, after_json, actor_id, client_mutation_id, created_at) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE changes() = 1").bind(auditId, "update", "cost_entry", id, JSON.stringify(before), JSON.stringify(after), null, mutationId || null, timestamp);
  const result = await env.ACCOUNTING_DB.batch([update, audit]);
  if (!result[0]?.success || Number(result[0]?.meta?.changes || 0) !== 1) return errorResponse("這筆資料已在其他裝置更新，請重新取得最新版", 409, "VERSION_CONFLICT");
  const saved = await one(env.ACCOUNTING_DB, "SELECT * FROM cost_entries WHERE id = ? AND deleted_at IS NULL", id);
  if (!saved) throw new Error("D1 修改後無法讀回資料，資料尚未保存");
  return json({ success: true, replay: false, row: saved });
}

async function deleteCost(env: Env, id: string, input: JsonRecord) {
  const expectedVersion = Number(input.expected_version ?? input.expectedVersion);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) throw new Error("缺少有效的資料版本");
  const before = await one<JsonRecord>(env.ACCOUNTING_DB, "SELECT * FROM cost_entries WHERE id = ? AND deleted_at IS NULL LIMIT 1", id);
  if (!before) return errorResponse("資料已不存在", 404, "NOT_FOUND");
  const timestamp = now();
  const after = { ...before, deleted_at: timestamp, updated_at: timestamp, version: expectedVersion + 1 };
  const mutationId = asString(input.client_mutation_id ?? input.clientMutationId);
  const update = env.ACCOUNTING_DB.prepare("UPDATE cost_entries SET deleted_at = ?, updated_at = ?, version = version + 1 WHERE id = ? AND version = ? AND deleted_at IS NULL").bind(timestamp, timestamp, id, expectedVersion);
  const audit = env.ACCOUNTING_DB.prepare("INSERT INTO audit_events (id, operation, entity_type, entity_id, before_json, after_json, actor_id, client_mutation_id, created_at) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE changes() = 1").bind(makeId(), "delete", "cost_entry", id, JSON.stringify(before), JSON.stringify(after), null, mutationId || null, timestamp);
  const result = await env.ACCOUNTING_DB.batch([update, audit]);
  if (!result[0]?.success || Number(result[0]?.meta?.changes || 0) !== 1) return errorResponse("這筆資料已在其他裝置更新，刪除未執行", 409, "VERSION_CONFLICT");
  const remaining = await one(env.ACCOUNTING_DB, "SELECT id FROM cost_entries WHERE id = ? AND deleted_at IS NULL", id);
  if (remaining) throw new Error("刪除後 read-back 仍找到資料，資料尚未刪除");
  return json({ success: true, deleted_id: id });
}

async function listCost(env: Env, module: CostModule, url: URL) {
  const month = url.searchParams.get("month");
  const rows = month
    ? await all(env.ACCOUNTING_DB, "SELECT c.*, m.month_key FROM cost_entries c JOIN report_months m ON m.id = c.report_month_id WHERE c.module = ? AND m.month_key = ? AND c.deleted_at IS NULL ORDER BY c.date ASC, c.created_at ASC", module, month)
    : await all(env.ACCOUNTING_DB, "SELECT c.*, m.month_key FROM cost_entries c JOIN report_months m ON m.id = c.report_month_id WHERE c.module = ? AND c.deleted_at IS NULL ORDER BY c.date ASC, c.created_at ASC", module);
  return json({ success: true, rows });
}

async function listMonths(env: Env, type: ReportType) {
  const rows = await all(env.ACCOUNTING_DB, "SELECT id, report_type, month_key, created_at, updated_at, version FROM report_months WHERE report_type = ? AND deleted_at IS NULL ORDER BY month_key DESC", type);
  return json({ success: true, rows });
}

async function createMonth(env: Env, type: ReportType, input: JsonRecord) {
  const monthKey = asString(input.month_key ?? input.monthKey).slice(0, 7);
  const month = await ensureMonth(env.ACCOUNTING_DB, type, monthKey);
  const saved = await one(env.ACCOUNTING_DB, "SELECT id, report_type, month_key, created_at, updated_at, version FROM report_months WHERE id = ? AND deleted_at IS NULL", month.id);
  if (!saved) throw new Error("月份建立後無法讀回，資料尚未保存");
  return json({ success: true, created: saved });
}

async function getStore(env: Env) {
  const saved = await one<{ store_json: string; updated_at: number; version: number }>(env.ACCOUNTING_DB, "SELECT store_json, updated_at, version FROM app_store WHERE id = 1");
  if (!saved) throw new Error("D1 找不到 Store 快照，資料尚未保存");
  try {
    return json({ success: true, store: JSON.parse(saved.store_json), version: Number(saved.version), updated_at: Number(saved.updated_at) });
  } catch {
    throw new Error("D1 Store 快照格式損壞，資料尚未保存");
  }
}

async function putStore(env: Env, input: JsonRecord) {
  const expectedVersion = Number(input.expected_version ?? input.expectedVersion);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) throw new Error("缺少有效的 Store 版本");
  const store = input.store;
  if (!store || typeof store !== "object" || Array.isArray(store)) throw new Error("Store 資料格式不正確");
  const deletedEntries = Array.isArray(input.deleted_entries) ? input.deleted_entries.filter(item => item && typeof item === "object") as Array<{ page: string; id: string }> : [];
  for (const entry of deletedEntries) {
    if (!asString(entry.page) || !asString(entry.id)) throw new Error("刪除驗證資料格式不正確");
  }
  const storeJson = JSON.stringify(store);
  if (storeJson.length > 8_000_000) throw new Error("Store 資料超過 Cloudflare D1 單筆大小限制");
  const mutationId = asString(input.client_mutation_id ?? input.clientMutationId);
  const existing = await alreadyProcessed(env.ACCOUNTING_DB, mutationId);
  if (existing) {
    const replay = JSON.parse(asString(existing.after_json, "{}")) as JsonRecord;
    return json({ success: true, replay: true, store: replay.store, version: replay.version, updated_at: replay.updated_at });
  }
  const timestamp = now();
  const nextVersion = expectedVersion + 1;
  const after = { store, version: nextVersion, updated_at: timestamp };
  const update = env.ACCOUNTING_DB.prepare("UPDATE app_store SET store_json = ?, updated_at = ?, version = version + 1 WHERE id = 1 AND version = ?").bind(storeJson, timestamp, expectedVersion);
  const audit = env.ACCOUNTING_DB.prepare("INSERT INTO audit_events (id, operation, entity_type, entity_id, before_json, after_json, actor_id, client_mutation_id, created_at) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE changes() = 1").bind(makeId(), "update", "app_store", "1", null, JSON.stringify(after), null, mutationId || null, timestamp);
  const result = await env.ACCOUNTING_DB.batch([update, audit]);
  if (!result[0]?.success || Number(result[0]?.meta?.changes || 0) !== 1) return errorResponse("資料已在其他裝置更新，尚未覆蓋最新版；請重新取得資料後再儲存", 409, "VERSION_CONFLICT");
  const saved = await one<{ store_json: string; updated_at: number; version: number }>(env.ACCOUNTING_DB, "SELECT store_json, updated_at, version FROM app_store WHERE id = 1 AND version = ?", nextVersion);
  if (!saved) throw new Error("D1 Store 寫入後無法 read-back，資料尚未保存");
  let readBackStore: JsonRecord;
  try { readBackStore = JSON.parse(saved.store_json) as JsonRecord; } catch { throw new Error("D1 Store read-back 格式損壞，資料尚未保存"); }
  const missingAfterDelete = deletedEntries.filter(entry => {
    const rows = readBackStore[entry.page];
    return Array.isArray(rows) && rows.some(row => row && typeof row === "object" && String((row as JsonRecord).id) === String(entry.id));
  });
  if (missingAfterDelete.length) throw new Error("D1 read-back 仍找到要刪除的資料，刪除未完成");
  return json({ success: true, replay: false, store: readBackStore, version: Number(saved.version), updated_at: Number(saved.updated_at), verification: { deleted: deletedEntries, missing_after_delete: missingAfterDelete } });
}

async function bootstrap(env: Env) {
  const [categories, memory, settings] = await Promise.all([
    all(env.ACCOUNTING_DB, "SELECT id, name, is_system, is_active, sort_order, version FROM categories WHERE is_active = 1 AND deleted_at IS NULL ORDER BY sort_order, name"),
    all(env.ACCOUNTING_DB, "SELECT id, match_type, match_key, display_value, category_name, note, version FROM category_memory WHERE deleted_at IS NULL ORDER BY updated_at DESC"),
    all(env.ACCOUNTING_DB, "SELECT key, value_json, version, updated_at FROM app_settings"),
  ]);
  return json({ success: true, categories, memory, settings });
}

async function dashboard(env: Env, url: URL) {
  const period = url.searchParams.get("period") || "all";
  const dateClause = period === "all" ? "" : " AND date LIKE ?";
  const dateParam = period === "all" ? [] : [`${period}%`];
  const cost = await all<{ module: string; total: number }>(env.ACCOUNTING_DB, `SELECT module, COALESCE(SUM(amount_ntd), 0) AS total FROM cost_entries WHERE deleted_at IS NULL${dateClause} GROUP BY module`, ...dateParam);
  const revenue = await all<{ module: string; total: number }>(env.ACCOUNTING_DB, `SELECT module, COALESCE(SUM(final_amount_ntd), 0) AS total FROM revenue_entries WHERE deleted_at IS NULL${dateClause} GROUP BY module`, ...dateParam);
  const eligible = await one<{ total: number }>(env.ACCOUNTING_DB, `SELECT COALESCE(SUM(amount_ntd), 0) AS total FROM cost_entries WHERE deleted_at IS NULL AND invoice_type != '紙本收據' AND category_name != '餐飲膳食費'${dateClause}`, ...dateParam);
  const advances = await one<{ total: number }>(env.ACCOUNTING_DB, `SELECT COALESCE(SUM(amount_ntd), 0) AS total FROM advance_entries WHERE deleted_at IS NULL${dateClause}`, ...dateParam);
  const stocks = await one<{ total: number }>(env.ACCOUNTING_DB, `SELECT COALESCE(SUM(realized_profit_ntd + dividend_ntd), 0) AS total FROM stock_trades WHERE deleted_at IS NULL${dateClause}`, ...dateParam);
  return json({ success: true, period, activityCost: Number(cost.find(item => item.module === "activity")?.total || 0), fragranceCost: Number(cost.find(item => item.module === "fragrance")?.total || 0), activityRevenue: Number(revenue.find(item => item.module === "activity")?.total || 0), fragranceRevenue: Number(revenue.find(item => item.module === "fragrance")?.total || 0), vat: Math.round(Number(eligible?.total || 0) * 0.05), advances: Number(advances?.total || 0), stockProfit: Number(stocks?.total || 0) });
}

async function sync(env: Env, url: URL) {
  const after = Math.max(0, Number(url.searchParams.get("after") || 0));
  const events = await all(env.ACCOUNTING_DB, "SELECT sequence, id, operation, entity_type, entity_id, group_id, created_at FROM audit_events WHERE sequence > ? ORDER BY sequence ASC LIMIT 500", after);
  const cursor = events.length ? Number(events[events.length - 1].sequence) : after;
  return json({ success: true, cursor, events });
}


const RECEIPT_MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", pdf: "application/pdf", heic: "image/heic", heif: "image/heif",
};
function receiptExtension(filename: string) { return filename.toLowerCase().split(".").pop() || ""; }
function receiptMime(filename: string, supplied: string) {
  const ext = receiptExtension(filename);
  const expected = RECEIPT_MIME_BY_EXTENSION[ext];
  if (!expected) throw new Error("只支援 JPG、JPEG、PNG、HEIC、HEIF 或 PDF");
  if (supplied && supplied !== "application/octet-stream" && supplied !== expected) throw new Error("檔案 MIME type 與副檔名不一致");
  return expected;
}
async function validateReceiptBytes(file: File, mime: string) {
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const text = new TextDecoder().decode(bytes);
  const jpeg = mime === "image/jpeg" && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = mime === "image/png" && bytes.slice(0, 8).every((value, index) => value === [137, 80, 78, 71, 13, 10, 26, 10][index]);
  const pdf = mime === "application/pdf" && text.startsWith("%PDF-");
  const heif = (mime === "image/heic" || mime === "image/heif") && text.slice(4, 12).includes("ftyp");
  if (!(jpeg || png || pdf || heif)) throw new Error("檔案內容與宣告的檔案類型不符");
}
async function receiptObject(request: Request, env: Env, key = "") {
  if (request.method === "POST") {
    const form = await request.formData();
    const entry = form.get("file");
    if (!(entry instanceof File)) return errorResponse("缺少憑證檔案", 400, "FILE_REQUIRED");
    if (entry.size <= 0 || entry.size > 25 * 1024 * 1024) return errorResponse("憑證檔案大小必須介於 1 byte 與 25 MB", 400, "FILE_SIZE_INVALID");
    const mime = receiptMime(entry.name, entry.type);
    await validateReceiptBytes(entry, mime);
    const extension = receiptExtension(entry.name);
    const objectKey = `receipt-${crypto.randomUUID()}.${extension}`;
    await env.RECEIPTS.put(objectKey, await entry.arrayBuffer(), { httpMetadata: { contentType: mime, contentDisposition: `inline; filename*=UTF-8''${encodeURIComponent(entry.name)}` }, customMetadata: { filename: entry.name, mime_type: mime } });
    const saved = await env.RECEIPTS.head(objectKey);
    if (!saved) throw new Error("R2 寫入後無法確認檔案存在");
    return json({ success: true, key: objectKey, filename: entry.name, mime_type: mime, size_bytes: entry.size });
  }
  if (request.method === "GET") {
    if (!key || !/^receipt-[a-f0-9-]+\.(jpg|jpeg|png|pdf|heic|heif)$/i.test(key)) return errorResponse("憑證檔案 key 不正確", 400, "INVALID_FILE_KEY");
    const object = await env.RECEIPTS.get(key);
    if (!object) return errorResponse("R2 找不到憑證檔案", 404, "OBJECT_NOT_FOUND");
    const mime = object.httpMetadata?.contentType || RECEIPT_MIME_BY_EXTENSION[receiptExtension(key)] || "application/octet-stream";
    return new Response(object.body as unknown as BodyInit, { headers: { "Content-Type": mime, "Content-Disposition": object.httpMetadata?.contentDisposition || "inline", "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff" } });
  }
  if (request.method === "DELETE") {
    if (!key) return errorResponse("缺少憑證檔案 key", 400, "INVALID_FILE_KEY");
    await env.RECEIPTS.delete(key);
    const remaining = await env.RECEIPTS.head(key);
    if (remaining) throw new Error("R2 刪除後檔案仍存在");
    return json({ success: true, deleted_key: key });
  }
  return errorResponse("不支援的憑證檔案操作", 405, "METHOD_NOT_ALLOWED");
}

async function receiptsContent(env: Env, request: Request, id: string) {
  const row = await one<{ r2_object_key: string; mime_type: string; filename: string; upload_status: string }>(env.ACCOUNTING_DB, "SELECT r2_object_key, mime_type, filename, upload_status FROM receipt_files WHERE id = ? AND deleted_at IS NULL LIMIT 1", id);
  if (!row) return errorResponse("找不到憑證", 404, "NOT_FOUND");
  if (row.upload_status !== "ready") return errorResponse("憑證尚未完成上傳", 409, "FILE_NOT_READY");
  if (request.method === "GET") {
    const object = await env.RECEIPTS.get(row.r2_object_key);
    if (!object) return errorResponse("R2 找不到憑證檔案", 404, "OBJECT_NOT_FOUND");
    return new Response(object.body as unknown as BodyInit, { headers: { "Content-Type": row.mime_type, "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(row.filename)}`, "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff" } });
  }
  if (request.method === "DELETE") {
    await env.RECEIPTS.delete(row.r2_object_key);
    const timestamp = now();
    await env.ACCOUNTING_DB.prepare("UPDATE receipt_files SET deleted_at = ?, updated_at = ?, version = version + 1 WHERE id = ? AND deleted_at IS NULL").bind(timestamp, timestamp, id).run();
    const deleted = await one(env.ACCOUNTING_DB, "SELECT id FROM receipt_files WHERE id = ? AND deleted_at IS NULL", id);
    if (deleted) throw new Error("憑證刪除後 read-back 仍存在");
    return json({ success: true, deleted_id: id });
  }
  return errorResponse("不支援的憑證操作", 405, "METHOD_NOT_ALLOWED");
}

async function route(request: Request, env: Env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  if (path === "/api/health" && request.method === "GET") return json({ success: true, service: "hivibevent-accounting-preview", sourceOfTruth: "cloudflare-d1" });
  if (path === "/api/store" && request.method === "GET") return getStore(env);
  if (path === "/api/store" && request.method === "PUT") return putStore(env, await bodyJson(request));
  if (path === "/api/receipt-objects" && request.method === "POST") return receiptObject(request, env);
  const receiptObjectMatch = path.match(/^\/api\/receipt-objects\/([^/]+)$/);
  if (receiptObjectMatch && (request.method === "GET" || request.method === "DELETE")) return receiptObject(request, env, decodeURIComponent(receiptObjectMatch[1]));
  if (path === "/api/bootstrap" && request.method === "GET") return bootstrap(env);
  if (path === "/api/dashboard" && request.method === "GET") return dashboard(env, url);
  if (path === "/api/sync" && request.method === "GET") return sync(env, url);
  const monthMatch = path.match(/^\/api\/report-months\/([a-z_]+)$/);
  if (monthMatch && request.method === "GET") return listMonths(env, monthMatch[1] as ReportType);
  if (monthMatch && request.method === "POST") return createMonth(env, monthMatch[1] as ReportType, await bodyJson(request));
  const costMatch = path.match(/^\/api\/costs\/(activity|fragrance)(?:\/([^/]+))?$/);
  if (costMatch && request.method === "GET" && !costMatch[2]) return listCost(env, costMatch[1] as CostModule, url);
  if (costMatch && request.method === "POST" && !costMatch[2]) {
    const input = await bodyJson(request);
    const result = await createCost(env, costMatch[1] as CostModule, input);
    return json({ success: true, ...result });
  }
  if (costMatch && request.method === "PATCH" && costMatch[2]) return updateCost(env, costMatch[2], await bodyJson(request));
  if (costMatch && request.method === "DELETE" && costMatch[2]) return deleteCost(env, costMatch[2], await bodyJson(request));
  const receiptMatch = path.match(/^\/api\/receipts\/([^/]+)\/content$/);
  if (receiptMatch && (request.method === "GET" || request.method === "DELETE")) return receiptsContent(env, request, receiptMatch[1]);
  return null;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      if (new URL(request.url).pathname.startsWith("/api/")) {
        const response = await route(request, env);
        return response || errorResponse("找不到 API 路由", 404, "NOT_FOUND");
      }
      if (!env.ASSETS) return new Response("hivibevent accounting preview API", { headers: { "Content-Type": "text/plain; charset=utf-8" } });
      return env.ASSETS.fetch(request);
    } catch (error) {
      console.error("[Worker] request failed", error);
      return errorResponse("儲存失敗，資料尚未保存", 500, "STORAGE_FAILED");
    }
  },
};
