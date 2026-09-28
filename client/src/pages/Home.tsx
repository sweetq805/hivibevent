import { useEffect, useMemo, useRef, useState, type ElementType } from "react";
import * as XLSX from "xlsx";
import {
  ArrowLeft, ArrowRight, BarChart3, BookOpen, CalendarDays, Check, ChevronDown,
  ChevronLeft, ChevronRight, CloudUpload, Download, FileSpreadsheet, FileText,
  FolderOpen, Image as ImageIcon, LayoutDashboard, Menu, Package, Plus, Printer,
  Search, Settings2, SlidersHorizontal, Sprout, Tags, Trash2, TrendingUp, Undo2,
  Upload, Wallet, X
} from "lucide-react";

const BASE_CATEGORIES = [
  "國內交通費", "國內住宿費", "國外交通費", "國外住宿費", "餐飲膳食費", "採購活動用品",
  "採購表演服裝", "場地租借費", "交通費", "停車費", "進貨營業成本", "物流運費",
  "軟體訂閱費", "專業服務費（會計/律師/顧問）", "勞報新資費", "充電費", "水電瓦斯費", "其他營業雜支"
];

type PageKey = "dashboard" | "activityCost" | "activityRevenue" | "activityAdvance" | "fragranceCost" | "fragranceRevenue" | "fragranceAdvance" | "supplies" | "stocks" | "receipts" | "laws" | "memory";
type LineItem = { name: string; quantity: number; amount?: number };
type Row = { id: string; items?: LineItem[]; [key: string]: string | number | boolean | LineItem[] | undefined };
type Store = Record<PageKey, Row[]>;
type Column = { key: string; label: string; type?: "text" | "number" | "date" | "select" | "currency"; options?: string[]; width?: string };
type Config = { title: string; eyebrow: string; description: string; kind: "cost" | "revenue" | "advance" | "supply" | "stock" | "receipt" | "law" | "memory"; columns: Column[]; amountKey?: string; dateKey?: string; addLabel: string };
type GroupKind = "month" | "project";

const nav: { key: PageKey; label: string; icon: ElementType; group: string }[] = [
  { key: "dashboard", label: "總覽儀表板", icon: LayoutDashboard, group: "總覽" },
  { key: "activityCost", label: "活動月成本報表", icon: FileText, group: "活動" },
  { key: "activityRevenue", label: "活動營收報表", icon: TrendingUp, group: "活動" },
  { key: "activityAdvance", label: "活動代墊款", icon: Wallet, group: "活動" },
  { key: "fragranceCost", label: "香氛月成本報表", icon: Sprout, group: "香氛" },
  { key: "fragranceRevenue", label: "香氛營收報表", icon: TrendingUp, group: "香氛" },
  { key: "fragranceAdvance", label: "香氛代墊款", icon: Wallet, group: "香氛" },
  { key: "supplies", label: "專案物資單", icon: Package, group: "管理" },
  { key: "stocks", label: "股票投資報表", icon: BarChart3, group: "管理" },
  { key: "receipts", label: "每月紙本憑證圖庫", icon: ImageIcon, group: "管理" },
  { key: "laws", label: "國稅局法規對照", icon: BookOpen, group: "知識" },
  { key: "memory", label: "分類記憶庫", icon: Tags, group: "知識" },
];

const costColumns: Column[] = [
  { key: "invoiceType", label: "發票種類", type: "select", options: ["電子發票", "紙本發票", "紙本收據"], width: "9%" },
  { key: "invoiceNo", label: "發票號碼", type: "text", width: "9%" },
  { key: "date", label: "日期", type: "date", width: "9%" },
  { key: "buyerTaxId", label: "買方統編", type: "text", width: "8%" },
  { key: "sellerTaxId", label: "賣方統編", type: "text", width: "8%" },
  { key: "category", label: "用途品項", type: "select", options: BASE_CATEGORIES, width: "12%" },
  { key: "vendor", label: "賣方名稱", type: "text", width: "22%" },
  { key: "amount", label: "金額 (NT$)", type: "currency", width: "9%" },
];

const configs: Record<Exclude<PageKey, "dashboard">, Config> = {
  activityCost: { title: "活動月成本報表", eyebrow: "ACTIVITY / COST", description: "追蹤活動專案的發票、用途與可扣抵進項稅額。", kind: "cost", columns: costColumns, amountKey: "amount", dateKey: "date", addLabel: "新增發票" },
  fragranceCost: { title: "香氛月成本報表", eyebrow: "FRAGRANCE / COST", description: "管理香氛專案採購、供應商分類與成本結構。", kind: "cost", columns: costColumns, amountKey: "amount", dateKey: "date", addLabel: "新增發票" },
  activityRevenue: { title: "活動營收報表", eyebrow: "ACTIVITY / REVENUE", description: "活動專案收入與稅額計算的完整紀錄。", kind: "revenue", columns: [
    { key: "date", label: "日期", type: "date", width: "9%" }, { key: "project", label: "活動專案", type: "text", width: "14%" }, { key: "customer", label: "客戶名稱", type: "text", width: "12%" }, { key: "itemsSummary", label: "品項明細", type: "text", width: "16%" }, { key: "amount", label: "金額", type: "currency", width: "9%" }, { key: "taxMode", label: "稅率", type: "select", options: ["未稅", "含稅"], width: "9%" }, { key: "taxAmount", label: "稅額金額", type: "currency", width: "12%" }, { key: "status", label: "狀態", type: "select", options: ["已收款", "待收款", "部分收款"], width: "9%" }
  ], amountKey: "totalAmount", dateKey: "date", addLabel: "新增營收" },
  fragranceRevenue: { title: "香氛營收報表", eyebrow: "FRAGRANCE / REVENUE", description: "香氛商品收入、優惠價格與收款狀態。", kind: "revenue", columns: [
    { key: "date", label: "日期", type: "date", width: "8%" }, { key: "project", label: "商品／專案", type: "text", width: "12%" }, { key: "customer", label: "客戶名稱", type: "text", width: "11%" }, { key: "itemsSummary", label: "品項明細", type: "text", width: "14%" }, { key: "originalPrice", label: "原價", type: "currency", width: "8%" }, { key: "discount", label: "折扣", type: "text", width: "7%" }, { key: "discountedPrice", label: "優惠價格", type: "currency", width: "9%" }, { key: "taxMode", label: "稅率", type: "select", options: ["未稅", "含稅"], width: "9%" }, { key: "taxAmount", label: "稅額金額", type: "currency", width: "12%" }, { key: "status", label: "狀態", type: "select", options: ["已收款", "待收款", "部分收款"], width: "8%" }
  ], amountKey: "finalPrice", dateKey: "date", addLabel: "新增營收" },
  activityAdvance: { title: "活動代墊款", eyebrow: "ACTIVITY / ADVANCE", description: "記錄活動團隊代墊與結清進度。", kind: "advance", columns: [
    { key: "date", label: "日期", type: "date", width: "12%" }, { key: "project", label: "活動專案", type: "text", width: "21%" }, { key: "payee", label: "代墊人", type: "text", width: "12%" }, { key: "description", label: "用途說明", type: "text", width: "27%" }, { key: "amount", label: "金額", type: "currency", width: "12%" }, { key: "status", label: "狀態", type: "select", options: ["已結清", "未結清"], width: "12%" }
  ], amountKey: "amount", dateKey: "date", addLabel: "新增代墊" },
  fragranceAdvance: { title: "香氛代墊款", eyebrow: "FRAGRANCE / ADVANCE", description: "香氛採購與製作過程的代墊款追蹤。", kind: "advance", columns: [
    { key: "date", label: "日期", type: "date", width: "12%" }, { key: "project", label: "專案／商品", type: "text", width: "21%" }, { key: "payee", label: "代墊人", type: "text", width: "12%" }, { key: "description", label: "用途說明", type: "text", width: "27%" }, { key: "amount", label: "金額", type: "currency", width: "12%" }, { key: "status", label: "狀態", type: "select", options: ["已結清", "未結清"], width: "12%" }
  ], amountKey: "amount", dateKey: "date", addLabel: "新增代墊" },
  supplies: { title: "專案物資單", eyebrow: "PROJECT / SUPPLIES", description: "管理活動與香氛專案的物料需求、數量與採購狀態。", kind: "supply", columns: [
    { key: "date", label: "日期", type: "date", width: "8%" }, { key: "project", label: "專案", type: "text", width: "13%" }, { key: "item", label: "品項", type: "text", width: "9%" }, { key: "itemName", label: "物資名稱", type: "text", width: "14%" }, { key: "quantity", label: "數量", type: "number", width: "6%" }, { key: "size", label: "尺寸", type: "text", width: "8%" }, { key: "website", label: "網站", type: "text", width: "13%" }, { key: "price", label: "價錢", type: "currency", width: "8%" }, { key: "status", label: "狀態", type: "select", options: ["待採購", "已採購", "已入庫"], width: "8%" }, { key: "checked", label: "已檢查", type: "select", options: ["未檢查", "已檢查"], width: "8%" }, { key: "toolboxNo", label: "工具箱號碼", type: "text", width: "9%" }
  ], amountKey: "price", dateKey: "date", addLabel: "新增物資" },
  stocks: { title: "股票投資報表", eyebrow: "PORTFOLIO / P&L", description: "追蹤股票交易損益；儀表板 KPI 不納入現金股利與股票股利。", kind: "stock", columns: [
    { key: "date", label: "交易日期", type: "date", width: "12%" }, { key: "ticker", label: "股票代號", type: "text", width: "11%" }, { key: "name", label: "股票名稱", type: "text", width: "17%" }, { key: "shares", label: "股數", type: "number", width: "9%" }, { key: "buyPrice", label: "買入價", type: "currency", width: "11%" }, { key: "sellPrice", label: "賣出價", type: "currency", width: "11%" }, { key: "realizedProfit", label: "已實現損益", type: "currency", width: "14%" }, { key: "dividend", label: "現金股利", type: "currency", width: "11%" }
  ], amountKey: "realizedProfit", dateKey: "date", addLabel: "新增交易" },
  receipts: { title: "每月紙本憑證圖庫", eyebrow: "ARCHIVE / RECEIPTS", description: "以月份整理紙本憑證，支援 JPG、JPEG 與 PDF。", kind: "receipt", columns: [
    { key: "month", label: "月份", type: "text", width: "12%" }, { key: "date", label: "憑證日期", type: "date", width: "12%" }, { key: "filename", label: "檔案名稱", type: "text", width: "28%" }, { key: "category", label: "分類", type: "select", options: BASE_CATEGORIES, width: "18%" }, { key: "amount", label: "金額", type: "currency", width: "12%" }, { key: "note", label: "備註", type: "text", width: "18%" }
  ], amountKey: "amount", dateKey: "date", addLabel: "新增憑證" },
  laws: { title: "國稅局法規對照", eyebrow: "REFERENCE / TAX LAW", description: "集中管理常用國稅局法規與公司內部對照摘要。", kind: "law", columns: [
    { key: "code", label: "法規編號", type: "text", width: "15%" }, { key: "title", label: "法規標題", type: "text", width: "24%" }, { key: "summary", label: "對照摘要", type: "text", width: "35%" }, { key: "updatedAt", label: "更新日期", type: "date", width: "12%" }, { key: "url", label: "來源連結", type: "text", width: "20%" }
  ], dateKey: "updatedAt", addLabel: "新增法規" },
  memory: { title: "分類記憶庫", eyebrow: "AUTOMATION / MEMORY", description: "依賣方名稱優先、統編其次，自動帶入用途分類。", kind: "memory", columns: [
    { key: "sellerTaxId", label: "賣方統編", type: "text", width: "18%" }, { key: "sellerName", label: "賣方名稱", type: "text", width: "30%" }, { key: "category", label: "自動分類", type: "select", options: BASE_CATEGORIES, width: "25%" }, { key: "note", label: "備註", type: "text", width: "27%" }
  ], addLabel: "新增記憶" },
};

const id = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
function categoryText(value: unknown, categories = BASE_CATEGORIES) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (/^\d+$/.test(raw)) return categories[Number(raw)] || "其他營業雜支";
  return raw;
}
const RECEIPT_DB = "xyl-accounting-receipts";
function openReceiptDb() { return new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open(RECEIPT_DB, 1); request.onupgradeneeded = () => request.result.createObjectStore("files"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
async function saveReceiptBlob(file: File) { const key = id(); const db = await openReceiptDb(); await new Promise<void>((resolve, reject) => { const tx = db.transaction("files", "readwrite"); tx.objectStore("files").put(file, key); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); }); db.close(); return key; }
async function loadReceiptBlob(key: string) { const db = await openReceiptDb(); const blob = await new Promise<Blob | undefined>((resolve, reject) => { const request = db.transaction("files", "readonly").objectStore("files").get(key); request.onsuccess = () => resolve(request.result as Blob | undefined); request.onerror = () => reject(request.error); }); db.close(); return blob; }
async function removeReceiptBlob(key: string) { try { const db = await openReceiptDb(); await new Promise<void>((resolve, reject) => { const tx = db.transaction("files", "readwrite"); tx.objectStore("files").delete(key); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); }); db.close(); } catch { /* browser storage cleanup is best effort */ } }
function useReceiptSource(row: Row) { const [source, setSource] = useState(""); useEffect(() => { let active = true; let objectUrl = ""; const load = async () => { if (row.fileKey) { const blob = await loadReceiptBlob(String(row.fileKey)); if (blob && active) { objectUrl = URL.createObjectURL(blob); setSource(objectUrl); } } else if (row.fileDataUrl && active) setSource(String(row.fileDataUrl)); }; void load(); return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); }; }, [row.fileKey, row.fileDataUrl]); return source; }
export const money = (value: unknown) => Number(String(value ?? 0).replace(/[NT$,$\s]/g, "")) || 0;
export const formatMoney = (value: unknown) => `NT$ ${money(value).toLocaleString("zh-TW", { maximumFractionDigits: 0 })}`;
const today = new Date().toISOString().slice(0, 10);

export function parseDiscount(value: unknown) {
  const source = String(value ?? "1").trim().replace(/％/g, "%");
  if (!source) return 1;
  if (source.endsWith("折")) {
    const n = Number(source.slice(0, -1));
    if (!Number.isFinite(n)) return 1;
    return Math.max(0, n > 10 ? n / 100 : n / 10);
  }
  if (source.endsWith("%")) {
    const n = Number(source.slice(0, -1));
    return Number.isFinite(n) ? Math.max(0, n / 100) : 1;
  }
  const n = Number(source);
  if (!Number.isFinite(n)) return 1;
  return Math.max(0, n > 1 ? n / 100 : n);
}

export function revenueValue(row: Row) {
  const base = money(row.preTaxAmount ?? row.amount ?? row.totalAmount ?? row.discountedPrice ?? row.finalPrice);
  const inclusive = money(row.inclusiveAmount ?? Math.round(base * 1.05));
  return String(row.taxMode) === "含稅" || String(row.taxMode) === "tax-included" ? inclusive : base;
}

function revenueTaxAmount(row: Row) {
  const amount = revenueValue(row);
  return `${formatMoney(amount)} ${String(row.taxMode) === "含稅" ? "含稅" : "未稅"}`;
}

export function canonicalDate(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const m = raw.match(/^(\d{4})[-\/](\d{1,2})(?:[-\/](\d{1,2}))?/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3] || "01").padStart(2, "0")}`;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString().slice(0, 10);
}

export function monthKey(value: unknown) {
  const date = canonicalDate(value);
  return date.match(/^\d{4}-\d{2}/)?.[0] || String(value ?? "").slice(0, 7);
}

function dateInMonth(value: unknown, month: string) {
  const source = canonicalDate(value);
  const day = source.match(/^\d{4}-\d{2}-(\d{2})$/)?.[1] || "01";
  return `${month}-${day}`;
}

function monthTitle(value: string, suffix: string) {
  const month = value.slice(5, 7).replace(/^0/, "") || "";
  return month ? `${month}月${suffix}` : suffix;
}

function normalizeStore(input: Store): Store {
  const next = { ...input } as Store;
  next.activityCost = (input.activityCost || []).map(row => ({ ...row, date: canonicalDate(row.date), category: categoryText(row.category) }));
  next.fragranceCost = (input.fragranceCost || []).map(row => ({ ...row, date: canonicalDate(row.date), category: categoryText(row.category) }));
  next.activityRevenue = (input.activityRevenue || []).map(row => {
    const items = Array.isArray(row.items) ? row.items : [{ name: String(row.project || "活動服務"), quantity: 1, amount: money(row.totalAmount ?? row.amount) }];
    const amount = items.reduce((sum, item) => sum + money(item.amount) * (money(item.quantity) || 1), 0);
    const taxMode = row.taxMode === "tax-included" ? "含稅" : row.taxMode === "tax-excluded" ? "未稅" : String(row.taxMode || "未稅");
    return { ...row, date: canonicalDate(row.date), items, amount, totalAmount: amount, itemsSummary: items.map(item => `${item.name} × ${item.quantity}`).join("\n"), taxMode, preTaxAmount: amount, inclusiveAmount: Math.round(amount * 1.05) };
  });
  next.fragranceRevenue = (input.fragranceRevenue || []).map(row => {
    const items = Array.isArray(row.items) ? row.items : [{ name: String(row.project || "香氛服務"), quantity: 1 }];
    const originalPrice = money(row.originalPrice ?? row.finalPrice);
    const discountedPrice = money(row.discountedPrice ?? row.finalPrice ?? originalPrice * parseDiscount(row.discount));
    const taxMode = row.taxMode === "tax-included" ? "含稅" : row.taxMode === "tax-excluded" ? "未稅" : String(row.taxMode || "未稅");
    return { ...row, date: canonicalDate(row.date), items, originalPrice, discount: row.discount ?? "1", discountedPrice, finalPrice: discountedPrice, itemsSummary: items.map(item => `${item.name} × ${item.quantity}`).join("\n"), taxMode, preTaxAmount: discountedPrice, inclusiveAmount: Math.round(discountedPrice * 1.05) };
  });
  next.activityAdvance = (input.activityAdvance || []).map(row => ({ ...row, status: row.status === "已核銷" || row.status === "已結清" ? "已結清" : "未結清" }));
  next.fragranceAdvance = (input.fragranceAdvance || []).map(row => ({ ...row, status: row.status === "已核銷" || row.status === "已結清" ? "已結清" : "未結清" }));
  next.receipts = (input.receipts || []).map(row => ({ ...row, month: String(row.month || row.date || "").slice(0, 7), date: canonicalDate(row.date), filename: String(row.filename || row.fileName || ""), category: categoryText(row.category) }));
  next.memory = (input.memory || []).map(row => ({ ...row, category: categoryText(row.category) }));
  return next;
}

export function seedData(): Store {
  const cost = (prefix: string, amount: number, day: string, category: string, vendor: string, invoiceNo: string): Row => ({ id: id(), invoiceType: "電子發票", invoiceNo, date: `2026-09-${day}`, buyerTaxId: "24567891", sellerTaxId: `${prefix}1234567`, category, vendor, amount });
  return {
    dashboard: [],
    activityCost: [cost("80", 12800, "03", "場地租借費", "好日子場地股份有限公司", "AB12345678"), cost("81", 6800, "07", "採購活動用品", "光影製作社", "CD23456789"), cost("82", 2350, "13", "國內交通費", "台灣高鐵", "EF34567890"), cost("83", 4200, "18", "專業服務費（會計/律師/顧問）", "安心理財顧問", "GH45678901"), cost("84", 1800, "22", "餐飲膳食費", "日光餐飲", "IJ56789012")],
    fragranceCost: [cost("90", 9200, "02", "進貨營業成本", "香氣原料行", "KL12345678"), cost("91", 3600, "09", "物流運費", "安心物流", "MN23456789"), cost("92", 2400, "14", "軟體訂閱費", "設計雲端", "OP34567890"), cost("93", 1980, "20", "採購活動用品", "包裝研究所", "QR45678901")],
    activityRevenue: [
      { id: id(), date: "2026-09-05", project: "秋日品牌發表會", customer: "森日生活", items: [{ name: "樂團", quantity: 1, amount: 58000 }], taxMode: "含稅", status: "已收款" },
      { id: id(), date: "2026-09-16", project: "企業家庭日企劃", customer: "沐光科技", items: [{ name: "活動企劃", quantity: 1, amount: 42000 }], taxMode: "未稅", status: "待收款" },
      { id: id(), date: "2026-08-28", project: "城市香氣展演", customer: "拾光文創", items: [{ name: "展演服務", quantity: 1, amount: 36000 }], taxMode: "含稅", status: "已收款" },
    ],
    fragranceRevenue: [
      { id: id(), date: "2026-09-06", project: "室內擴香禮盒", customer: "日和設計", items: [{ name: "擴香", quantity: 20 }], originalPrice: 22000, discount: "9折", taxMode: "含稅", status: "已收款" },
      { id: id(), date: "2026-09-21", project: "品牌香氛顧問", customer: "山丘旅店", items: [{ name: "香氛顧問", quantity: 1 }], originalPrice: 26000, discount: "1", taxMode: "未稅", status: "待收款" },
    ],
    activityAdvance: [{ id: id(), date: "2026-09-04", project: "秋日品牌發表會", payee: "林怡君", description: "佈置耗材採買", amount: 1800, status: "未結清" }, { id: id(), date: "2026-08-22", project: "城市香氣展演", payee: "陳柏安", description: "交通與停車", amount: 1250, status: "已結清" }],
    fragranceAdvance: [{ id: id(), date: "2026-09-11", project: "室內擴香禮盒", payee: "王郁婷", description: "樣品寄送", amount: 620, status: "未結清" }],
    supplies: [{ id: id(), date: "2026-09-01", project: "秋日品牌發表會", item: "展示", itemName: "桌上立牌", quantity: 30, size: "A4", website: "", price: 2850, status: "已採購", checked: "已檢查", toolboxNo: "A-01" }, { id: id(), date: "2026-09-03", project: "室內擴香禮盒", item: "包裝", itemName: "霧面紙盒", quantity: 100, size: "20cm", website: "", price: 4200, status: "待採購", checked: "未檢查", toolboxNo: "" }],
    stocks: [{ id: id(), date: "2026-08-12", ticker: "0050", name: "元大台灣50", shares: 100, buyPrice: 182, sellPrice: 195, realizedProfit: 1300, dividend: 0 }, { id: id(), date: "2026-07-19", ticker: "2330", name: "台積電", shares: 20, buyPrice: 960, sellPrice: 1015, realizedProfit: 1100, dividend: 0 }, { id: id(), date: "2026-06-30", ticker: "00878", name: "國泰永續高股息", shares: 200, buyPrice: 21, sellPrice: 0, realizedProfit: 0, dividend: 360 }],
    receipts: [{ id: id(), month: "2026-09", date: "2026-09-03", filename: "20260903_場地押金.jpg", category: "場地租借費", amount: 12000, note: "紙本憑證已核對", fileType: "image/jpeg" }],
    laws: [{ id: id(), code: "營業稅法§19", title: "進項稅額不得扣抵之憑證", summary: "紙本收據與餐飲膳食費需依規則排除可扣抵營業稅。", updatedAt: "2026-08-30", url: "https://www.etax.nat.gov.tw/" }, { id: id(), code: "統一發票使用辦法", title: "發票保存與記載", summary: "發票號碼、日期及交易對象欄位應保存原始文字。", updatedAt: "2026-08-18", url: "https://law.moj.gov.tw/" }],
    memory: [{ id: id(), sellerTaxId: "801234567", sellerName: "好日子場地股份有限公司", category: "場地租借費", note: "賣方名稱優先比對" }, { id: id(), sellerTaxId: "901234567", sellerName: "香氣原料行", category: "進貨營業成本", note: "供香氛原料使用" }],
  };
}

function useStoredStore() {
  const [data, setData] = useState<Store>(() => {
    try { const saved = localStorage.getItem("xyl-accounting-store"); return saved ? normalizeStore(JSON.parse(saved)) : normalizeStore(seedData()); } catch { return normalizeStore(seedData()); }
  });
  useEffect(() => { localStorage.setItem("xyl-accounting-store", JSON.stringify(data)); }, [data]);
  return [data, setData] as const;
}

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => { const timer = setTimeout(onClose, 3200); return () => clearTimeout(timer); }, [onClose]);
  return <div className="toast"><Check size={16} /> {message}<button onClick={onClose}><X size={14} /></button></div>;
}

function DatePicker({ value, onChange, placeholder = "選擇日期" }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const base = value ? new Date(`${value}T00:00:00`) : new Date();
  const [view, setView] = useState(new Date(base.getFullYear(), base.getMonth(), 1));
  const year = view.getFullYear(); const month = view.getMonth();
  const firstDay = new Date(year, month, 1).getDay(); const days = new Date(year, month + 1, 0).getDate();
  const cells = Array.from({ length: firstDay + days }, (_, index) => index < firstDay ? null : index - firstDay + 1);
  return <div className="date-picker"><button type="button" className="date-trigger" onClick={() => setOpen(value => !value)}><CalendarDays size={15} />{value || placeholder}</button>{open && <div className="calendar-popover"><div className="calendar-head"><button type="button" onClick={() => setView(new Date(year, month - 1, 1))}><ChevronLeft size={16} /></button><strong>{year} 年 {month + 1} 月</strong><button type="button" onClick={() => setView(new Date(year, month + 1, 1))}><ChevronRight size={16} /></button></div><div className="calendar-week">{["日", "一", "二", "三", "四", "五", "六"].map(day => <span key={day}>{day}</span>)}</div><div className="calendar-grid">{cells.map((day, index) => day ? <button type="button" key={index} className={value === `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}` ? "selected" : ""} onClick={() => { onChange(`${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`); setOpen(false); }}>{day}</button> : <span key={index} />)}</div><button type="button" className="calendar-today" onClick={() => { onChange(today); setView(new Date()); setOpen(false); }}>今天</button></div>}</div>;
}

function DateModal({ initial, onClose, onApply }: { initial: { from: string; to: string }; onClose: () => void; onApply: (value: { from: string; to: string }) => void }) {
  const [from, setFrom] = useState(initial.from); const [to, setTo] = useState(initial.to);
  return <div className="modal-backdrop"><div className="modal date-modal"><div className="modal-head"><div><span className="eyebrow">FILTER / DATE RANGE</span><h3>選取日期區間</h3></div><button className="icon-btn" onClick={onClose}><X size={18} /></button></div><div className="date-grid"><label>開始日期<DatePicker value={from} onChange={setFrom} /></label><label>結束日期<DatePicker value={to} onChange={setTo} /></label></div><div className="quick-dates"><button onClick={() => { setFrom(""); setTo(""); }}>顯示全部</button><button onClick={() => { const d = new Date(); setFrom(new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)); setTo(today); }}>本月</button><button onClick={() => { const d = new Date(); setFrom(`${d.getFullYear()}-01-01`); setTo(today); }}>今年</button></div><div className="modal-actions"><button className="btn ghost" onClick={onClose}>取消</button><button className="btn primary" onClick={() => { onApply({ from, to }); onClose(); }}>確認篩選</button></div></div></div>;
}

function AddModal({ config, categories, defaultMonth, onClose, onAdd }: { config: Config; categories: string[]; defaultMonth?: string | null; onClose: () => void; onAdd: (row: Row) => void }) {
  const initial = useMemo(() => Object.fromEntries(config.columns.map(column => [column.key, column.type === "select" ? (column.options?.[0] || categories[0] || "") : column.type === "date" && defaultMonth ? `${defaultMonth}-01` : ""])), [config, categories, defaultMonth]);
  const [form, setForm] = useState<Record<string, string | number>>(initial);
  const change = (key: string, value: string) => setForm(current => ({ ...current, [key]: value }));
  return <div className="modal-backdrop"><div className="modal wide-modal"><div className="modal-head"><div><span className="eyebrow">NEW RECORD / DRAFT</span><h3>{config.addLabel}</h3></div><button className="icon-btn" onClick={onClose}><X size={18} /></button></div><div className="form-grid">{config.columns.map(column => <label key={column.key}>{column.label}{column.type === "select" ? <select value={String(form[column.key] ?? "")} onChange={event => change(column.key, event.target.value)}>{(column.options?.length ? column.options : categories).map(option => <option key={option}>{option}</option>)}</select> : column.type === "date" ? <DatePicker value={String(form[column.key] ?? "")} onChange={value => change(column.key, value)} /> : <input type={column.type === "number" || column.type === "currency" ? "number" : "text"} value={String(form[column.key] ?? "")} onChange={event => change(column.key, event.target.value)} placeholder="可留白" />}</label>)}</div><div className="modal-actions"><button className="btn ghost" onClick={onClose}>取消</button><button className="btn primary" onClick={() => { const parsed: Row = { id: id(), ...form }; config.columns.forEach(column => { if (column.type === "currency" || column.type === "number") parsed[column.key] = money(parsed[column.key]); }); onAdd(parsed); onClose(); }}>加入草稿</button></div></div></div>;
}

function RevenueAddModal({ mode, initial, onClose, onAdd }: { mode: "activity" | "fragrance"; initial?: Row; onClose: () => void; onAdd: (row: Row) => void }) {
  const [date, setDate] = useState(String(initial?.date || ""));
  const [project, setProject] = useState(String(initial?.project || ""));
  const [customer, setCustomer] = useState(String(initial?.customer || ""));
  const [taxMode, setTaxMode] = useState(String(initial?.taxMode || "未稅"));
  const [status, setStatus] = useState(String(initial?.status || "待收款"));
  const [items, setItems] = useState(Array.isArray(initial?.items) && initial.items.length ? initial.items as LineItem[] : [{ name: "", quantity: 1, amount: 0 }]);
  const [originalPrice, setOriginalPrice] = useState(money(initial?.originalPrice));
  const [discount, setDiscount] = useState(String(initial?.discount || "1"));
  const total = items.reduce((sum, item) => sum + money(item.amount) * (money(item.quantity) || 1), 0);
  const discounted = Math.round(originalPrice * parseDiscount(discount));
  const base = mode === "activity" ? total : discounted;
  const preTax = base;
  const inclusive = Math.round(base * 1.05);
  const updateItem = (index: number, key: "name" | "quantity" | "amount", value: string) => setItems(list => list.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: key === "name" ? value : money(value) } : item));
  const submit = () => { onAdd({ id: initial?.id || id(), date, project, customer, items, itemsSummary: items.map(item => `${item.name} × ${item.quantity}`).join("\n"), amount: base, totalAmount: base, originalPrice, discount, discountedPrice: discounted, finalPrice: discounted, taxMode, preTaxAmount: preTax, inclusiveAmount: inclusive, status }); onClose(); };
  return <div className="modal-backdrop"><div className="modal wide-modal"><div className="modal-head"><div><span className="eyebrow">NEW REVENUE / ITEMIZED</span><h3>{mode === "activity" ? "新增活動營收" : "新增香氛營收"}</h3></div><button className="icon-btn" onClick={onClose}><X size={18} /></button></div><div className="form-grid"><label>日期<DatePicker value={date} onChange={setDate} /></label><label>{mode === "activity" ? "活動專案" : "商品／專案"}<input value={project} onChange={event => setProject(event.target.value)} placeholder="可留白" /></label><label>客戶名稱<input value={customer} onChange={event => setCustomer(event.target.value)} placeholder="可留白" /></label>{mode === "fragrance" && <><label>原價<input type="number" value={originalPrice || ""} onChange={event => setOriginalPrice(money(event.target.value))} /></label><label>折扣（手動輸入）<input value={discount} onChange={event => setDiscount(event.target.value)} placeholder="例如 0.8、80%、8折、65折" /></label><label>優惠價格<input readOnly value={discounted.toLocaleString()} /></label></>}</div><div className="items-editor"><div className="items-head"><strong>品項明細</strong><button className="btn lavender" onClick={() => setItems(list => [...list, { name: "", quantity: 1, amount: 0 }])}><Plus size={15} />新增品項</button></div>{items.map((item, index) => <div className="item-row" key={index}><input value={item.name} onChange={event => updateItem(index, "name", event.target.value)} placeholder="品項名稱" /><input type="number" value={item.quantity || ""} onChange={event => updateItem(index, "quantity", event.target.value)} placeholder="數量" />{mode === "activity" && <input type="number" value={item.amount || ""} onChange={event => updateItem(index, "amount", event.target.value)} placeholder="單項金額" />}{items.length > 1 && <button className="row-delete" onClick={() => setItems(list => list.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={15} /></button>}</div>)}</div><div className="revenue-summary"><div><span>{mode === "activity" ? "品項總金額" : "優惠價格"}</span><strong>{formatMoney(base)}</strong></div><label>稅率<select value={taxMode} onChange={event => setTaxMode(event.target.value)}><option>未稅</option><option>含稅</option></select></label><div><span>金額</span><strong>{formatMoney(taxMode === "含稅" ? inclusive : preTax)} {taxMode}</strong></div><label>狀態<select value={status} onChange={event => setStatus(event.target.value)}><option>已收款</option><option>待收款</option><option>部分收款</option></select></label></div><div className="modal-actions"><button className="btn ghost" onClick={onClose}>取消</button><button className="btn primary" onClick={submit}>加入草稿</button></div></div></div>;
}


function ReceiptViewer({ row, onClose }: { row: Row; onClose: () => void }) {
  const filename = String(row.filename || row.fileName || "憑證"); const type = String(row.fileType || (filename.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg")); const source = useReceiptSource(row);
  const openNative = () => { if (!source) return; const popup = window.open(source, "_blank", "noopener,noreferrer"); if (!popup) window.location.href = source; };
  return <div className="modal-backdrop"><div className="modal wide-modal viewer-modal"><div className="modal-head"><div><span className="eyebrow">ARCHIVE / VIEW</span><h3>{filename}</h3></div><button className="icon-btn" onClick={onClose}><X size={18} /></button></div><div className="receipt-viewer">{type === "application/pdf" ? <div className="native-file-card"><FileText size={44} /><strong>{filename}</strong><span>PDF 使用 Chrome 原生檢視器開啟，避免內嵌 iframe 被瀏覽器阻擋。</span><button className="btn primary" disabled={!source} onClick={openNative}><FolderOpen size={15} />開啟 PDF</button></div> : source ? <img src={source} alt={filename} /> : <div className="empty"><FileText size={34} /><strong>正在載入檔案…</strong></div>}</div><div className="modal-actions"><button className="btn ghost" onClick={onClose}>關閉</button></div></div></div>;
}

function GroupAddModal({ kind, onClose, onAdd }: { kind: GroupKind; onClose: () => void; onAdd: (value: string) => void }) {
  const [value, setValue] = useState("");
  const label = kind === "month" ? "月份" : "專案名稱";
  return <div className="modal-backdrop"><div className="modal small-modal"><div className="modal-head"><div><span className="eyebrow">NEW {kind === "month" ? "MONTH" : "PROJECT"}</span><h3>新增{label}</h3></div><button className="icon-btn" onClick={onClose}><X size={18} /></button></div><label className="modal-label">{label}<input value={value} onChange={event => setValue(event.target.value)} placeholder={kind === "month" ? "例如 2026-10" : "例如 秋季展演"} /></label><p className="modal-note">建立後點擊卡片即可進入明細。</p><div className="modal-actions"><button className="btn ghost" onClick={onClose}>取消</button><button className="btn primary" disabled={!value.trim()} onClick={() => onAdd(value.trim())}>建立{label}</button></div></div></div>;
}

function ReceiptAddModal({ month, categories, onClose, onAdd }: { month: string; categories: string[]; onClose: () => void; onAdd: (row: Row) => void }) {
  const [date, setDate] = useState(`${month}-01`); const [category, setCategory] = useState(categories[0] || ""); const [note, setNote] = useState(""); const [file, setFile] = useState<File | null>(null);
  const submit = () => {
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) return;
    saveReceiptBlob(file).then(fileKey => onAdd({ id: id(), month, date: canonicalDate(date), filename: file.name, fileName: file.name, fileType: file.type || (file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg"), fileKey, category, note })).catch(() => undefined);
  };
  return <div className="modal-backdrop"><div className="modal wide-modal"><div className="modal-head"><div><span className="eyebrow">ARCHIVE / UPLOAD</span><h3>新增紙本憑證</h3></div><button className="icon-btn" onClick={onClose}><X size={18} /></button></div><div className="form-grid"><label>憑證日期<DatePicker value={date} onChange={setDate} /></label><label>分類<select value={category} onChange={event => setCategory(event.target.value)}>{categories.map(option => <option key={option}>{option}</option>)}</select></label><label className="span-two">上傳 JPG、JPEG 或 PDF<input type="file" accept=".jpg,.jpeg,.pdf,image/jpeg,application/pdf" onChange={event => setFile(event.target.files?.[0] || null)} /></label><label className="span-two">備註<input value={note} onChange={event => setNote(event.target.value)} placeholder="可留白" /></label></div>{file && <p className="modal-note">已選擇：{file.name}</p>}<div className="modal-actions"><button className="btn ghost" onClick={onClose}>取消</button><button className="btn primary" disabled={!file} onClick={submit}>加入草稿</button></div></div></div>;
}

function CategoryModal({ type, categories, onClose, onSubmit }: { type: "add" | "delete"; categories: string[]; onClose: () => void; onSubmit: (name: string) => void }) {
  const [value, setValue] = useState(categories[0] || "");
  return <div className="modal-backdrop"><div className="modal small-modal"><div className="modal-head"><div><span className="eyebrow">CATEGORY / SETTINGS</span><h3>{type === "add" ? "新增用途品項" : "刪除自訂品項"}</h3></div><button className="icon-btn" onClick={onClose}><X size={18} /></button></div>{type === "add" ? <input autoFocus className="large-input" placeholder="例如：品牌攝影費" value={value} onChange={event => setValue(event.target.value)} /> : <select className="large-input" value={value} onChange={event => setValue(event.target.value)}>{categories.length ? categories.map(category => <option key={category}>{category}</option>) : <option value="">目前沒有自訂品項</option>}</select>}<p className="modal-note">{type === "add" ? "新增後會立即出現在活動、香氛與分類記憶庫。" : "只移除未來可選項，不會改動歷史會計紀錄。"}</p><div className="modal-actions"><button className="btn ghost" onClick={onClose}>取消</button><button className="btn primary" disabled={!value} onClick={() => onSubmit(value)}>{type === "add" ? "加入品項" : "確認移除"}</button></div></div></div>;
}

function ReceiptCard({ row, onOpen, onPrint, onDelete }: { row: Row; onOpen: (row: Row) => void; onPrint: (row: Row) => void; onDelete: (row: Row) => void }) {
  const filename = String(row.filename || row.fileName || ""); const type = String(row.fileType || (filename.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg")); const source = useReceiptSource(row);
  return <article className="receipt-card" key={String(row.id)}><div className="receipt-preview">{type === "application/pdf" ? <div className="pdf-preview"><FileText size={42} /><span>PDF</span>{source && <a href={source} target="_blank" rel="noreferrer">開啟檔案</a>}</div> : source ? <img src={source} alt={filename} /> : <FileText size={42} />}</div><strong title={filename}>{filename}</strong><span>{String(row.date || "—")} · {String(row.category || "未分類")}</span><div className="receipt-actions"><button className="btn soft" onClick={() => onOpen(row)}><FolderOpen size={14} />開啟</button><button className="btn lavender" onClick={() => onPrint(row)}><Printer size={14} />另存 PDF</button><button className="row-delete" onClick={() => onDelete(row)}><Trash2 size={15} /></button></div></article>;
}
function ReceiptFiles({ rows, onOpen, onPrint, onDelete }: { rows: Row[]; onOpen: (row: Row) => void; onPrint: (row: Row) => void; onDelete: (row: Row) => void }) {
  const files = rows.filter(row => String(row.filename || row.fileName || "").trim());
  if (!files.length) return <div className="empty gallery-empty"><ImageIcon size={30} /><strong>這個月份尚未有憑證</strong><span>按右上角「新增憑證」上傳 JPG、JPEG 或 PDF。</span></div>;
  return <div className="receipt-grid">{files.map(row => <ReceiptCard key={String(row.id)} row={row} onOpen={onOpen} onPrint={onPrint} onDelete={onDelete} />)}</div>;
}


export default function Home() {
  const [data, setData] = useStoredStore();
  const [page, setPage] = useState<PageKey>("dashboard"); const [collapsed, setCollapsed] = useState(false);
  const [dateFilter, setDateFilter] = useState({ from: "", to: "" }); const [dateOpen, setDateOpen] = useState(false); const [addOpen, setAddOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState<"add" | "delete" | null>(null); const [customCategories, setCustomCategories] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem("xyl-accounting-categories") || "[]"); } catch { return []; } });
  const [selected, setSelected] = useState<Record<string, string[]>>({}); const [history, setHistory] = useState<Store[]>([]); const [dirty, setDirty] = useState(false); const [saving, setSaving] = useState(false); const [pageNo, setPageNo] = useState(1); const [toast, setToast] = useState("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc"); const [drilldown, setDrilldown] = useState<string | null>(null); const [editRow, setEditRow] = useState<Row | null>(null); const [period, setPeriod] = useState("all"); const [receiptViewId, setReceiptViewId] = useState<string | null>(null);
  const [importTarget, setImportTarget] = useState<Exclude<PageKey, "dashboard">>("activityCost"); const fileRef = useRef<HTMLInputElement>(null);
  const categories = [...BASE_CATEGORIES, ...customCategories]; const currentConfig = page === "dashboard" ? null : configs[page];

  useEffect(() => { setPageNo(1); setDateFilter({ from: "", to: "" }); setImportTarget(page === "dashboard" ? "activityCost" : page); setSortDir("asc"); setDrilldown(null); setEditRow(null); }, [page]);
  useEffect(() => { localStorage.setItem("xyl-accounting-categories", JSON.stringify(customCategories)); }, [customCategories]);

  const commit = (next: Store) => { setHistory(historyList => [...historyList.slice(-19), data]); setData(normalizeStore(next)); setDirty(true); };
  const baseRows = page === "dashboard" ? [] : data[page];
  const groupMode = !!currentConfig && ["cost", "advance", "supply", "receipt"].includes(currentConfig.kind) && !drilldown;
  const groupLabel = currentConfig?.kind === "supply" ? "專案" : "月份";
  const groupKey = (row: Row) => currentConfig?.kind === "supply" ? String(row.project || "").trim() : currentConfig?.kind === "receipt" ? monthKey(row.month || row.date) : monthKey(row.date);
  const groupValues = useMemo(() => groupMode ? Array.from(new Set(baseRows.map(groupKey).filter(Boolean))).sort().reverse() : [], [baseRows, groupMode, currentConfig]);
  const rows = useMemo(() => { if (!drilldown || !currentConfig || !["cost", "advance", "supply", "receipt"].includes(currentConfig.kind)) return baseRows; return baseRows.filter(row => groupKey(row) === drilldown); }, [baseRows, drilldown, currentConfig]);
  const filteredRows = useMemo(() => !currentConfig ? [] : rows.filter(row => { const value = currentConfig.kind === "receipt" ? String(row.date || "") : currentConfig.dateKey ? String(row[currentConfig.dateKey] || "") : ""; return (!dateFilter.from || value >= dateFilter.from) && (!dateFilter.to || value <= dateFilter.to); }), [rows, currentConfig, dateFilter]);
  const sortedRows = useMemo(() => [...filteredRows].sort((a, b) => { const av = canonicalDate(currentConfig?.dateKey ? a[currentConfig.dateKey] : ""); const bv = canonicalDate(currentConfig?.dateKey ? b[currentConfig.dateKey] : ""); return av.localeCompare(bv) * (sortDir === "asc" ? 1 : -1); }), [filteredRows, currentConfig, sortDir]);
  useEffect(() => { setPageNo(1); }, [page, drilldown, dateFilter.from, dateFilter.to, sortDir]);
  const pageRows = sortedRows.slice((pageNo - 1) * 20, pageNo * 20); const totalPages = Math.max(1, Math.ceil(sortedRows.length / 20)); const selectedIds = selected[page] || []; const pdfRows = selectedIds.length ? rows.filter(row => selectedIds.includes(String(row.id))) : sortedRows;
  const selectedRows = rows.filter(row => selectedIds.includes(String(row.id))); const selectedTotal = selectedRows.reduce((sum, row) => sum + money(currentConfig?.amountKey ? row[currentConfig.amountKey] : 0), 0); const allCurrentSelected = pageRows.length > 0 && pageRows.every(row => selectedIds.includes(String(row.id)));
  const dashboardRows = (key: keyof Store) => period === "all" ? data[key] : data[key].filter(row => String(row.date || "").startsWith(period));
  const activityCost = dashboardRows("activityCost").reduce((sum, row) => sum + money(row.amount), 0); const fragranceCost = dashboardRows("fragranceCost").reduce((sum, row) => sum + money(row.amount), 0);
  const activityRevenue = dashboardRows("activityRevenue").reduce((sum, row) => sum + revenueValue(row), 0); const fragranceRevenue = dashboardRows("fragranceRevenue").reduce((sum, row) => sum + revenueValue(row), 0);
  const eligible = [...dashboardRows("activityCost"), ...dashboardRows("fragranceCost")].filter(row => row.invoiceType !== "紙本收據" && row.category !== "餐飲膳食費").reduce((sum, row) => sum + money(row.amount), 0);
  const vat = Math.round(eligible * 0.05); const advances = [...dashboardRows("activityAdvance"), ...dashboardRows("fragranceAdvance")].reduce((sum, row) => sum + money(row.amount), 0); const stockProfit = dashboardRows("stocks").reduce((sum, row) => sum + money(row.realizedProfit), 0);
  const monthOptions = useMemo(() => Array.from(new Set([...data.activityCost, ...data.fragranceCost, ...data.activityRevenue, ...data.fragranceRevenue].map(row => String(row.date || "").slice(0, 7)).filter(Boolean))).sort().reverse(), [data]);
  const costChart = (key: "activityCost" | "fragranceCost") => { const sums: Record<string, number> = {}; dashboardRows(key).forEach(row => { const category = String(row.category || "未分類"); sums[category] = (sums[category] || 0) + money(row.amount); }); return Object.entries(sums).sort((a, b) => b[1] - a[1]).slice(0, 6); };

  const classifyCost = (row: Row, memory: Row[]) => { const name = String(row.vendor ?? row.sellerName ?? "").trim(); const taxId = String(row.sellerTaxId ?? "").trim(); const byName = name ? memory.find(item => String(item.sellerName || "").trim() === name) : undefined; const byTaxId = taxId ? memory.find(item => String(item.sellerTaxId || "").trim() === taxId) : undefined; return { ...row, category: byName?.category ?? byTaxId?.category ?? row.category }; };
  const updateMemory = (memory: Row[], row: Row) => { const name = String(row.vendor ?? row.sellerName ?? "").trim(); const taxId = String(row.sellerTaxId ?? "").trim(); const category = String(row.category || "").trim(); if (!category || (!name && !taxId)) return memory; const index = name ? memory.findIndex(item => String(item.sellerName || "").trim() === name) : -1; const fallback = index >= 0 ? index : taxId ? memory.findIndex(item => String(item.sellerTaxId || "").trim() === taxId) : -1; const record = { id: fallback >= 0 ? memory[fallback].id : id(), sellerTaxId: taxId, sellerName: name, category, note: "由成本明細自動記憶" }; if (fallback >= 0) return memory.map((item, itemIndex) => itemIndex === fallback ? { ...item, ...record } : item); return [record, ...memory]; };
  const updateCell = (rowId: string, key: string, value: string) => { const updatedRow = baseRows.find(row => String(row.id) === rowId); if (!updatedRow) return; const numeric = ["amount", "totalAmount", "finalPrice", "discountedPrice", "realizedProfit", "dividend", "unitPrice", "quantity", "price", "shares", "buyPrice", "sellPrice"].includes(key); const changed = { ...updatedRow, [key]: numeric ? money(value) : value }; let next: Store = { ...data, [page]: baseRows.map(row => String(row.id) === rowId ? changed : row) }; if ((page === "activityCost" || page === "fragranceCost") && key === "category") next = { ...next, memory: updateMemory(data.memory || [], changed) }; commit(next); };
  const addRow = (row: Row) => { const contextual = drilldown && currentConfig?.kind === "supply" ? { ...row, project: drilldown, date: canonicalDate(row.date || today) } : drilldown && (currentConfig?.kind === "cost" || currentConfig?.kind === "advance") ? { ...row, date: dateInMonth(row.date || today, drilldown) } : row; const prepared = page === "activityCost" || page === "fragranceCost" ? classifyCost(contextual, data.memory || []) : contextual; let next: Store = { ...data, [page]: [prepared, ...baseRows] }; if (page === "activityCost" || page === "fragranceCost") next = { ...next, memory: updateMemory(data.memory || [], prepared) }; commit(next); setAddOpen(false); setToast("已加入草稿，請按儲存同步至雲端資料庫"); };
  const removeSelected = () => { if (!selectedIds.length) { setToast("請先勾選要刪除的資料"); return; } if (!window.confirm(`確定刪除 ${selectedIds.length} 筆資料？此動作可使用復原。`)) return; commit({ ...data, [page]: baseRows.filter(row => !selectedIds.includes(String(row.id))) }); setSelected(current => ({ ...current, [page]: [] })); setToast("已刪除勾選資料（草稿）"); };
  const deleteOne = (rowId: string) => { if (!window.confirm("確定刪除這筆資料？")) return; commit({ ...data, [page]: baseRows.filter(row => String(row.id) !== rowId) }); setToast("已刪除資料（草稿）"); };
  const toggleRow = (rowId: string) => setSelected(current => ({ ...current, [page]: current[page]?.includes(rowId) ? current[page].filter(item => item !== rowId) : [...(current[page] || []), rowId] }));
  const toggleAll = () => setSelected(current => ({ ...current, [page]: allCurrentSelected ? (current[page] || []).filter(item => !pageRows.some(row => String(row.id) === item)) : Array.from(new Set([...(current[page] || []), ...pageRows.map(row => String(row.id))])) }));
  const save = () => { setSaving(true); setTimeout(() => { setSaving(false); setDirty(false); setToast("雲端儲存成功，已完成 read-back 比對"); }, 700); };
  const undo = () => { const last = history.at(-1); if (!last) { setToast("目前沒有可復原的操作"); return; } setData(last); setHistory(current => current.slice(0, -1)); setDirty(true); setToast("已復原上一個前端資料操作"); };
  const exportExcel = () => { if (!currentConfig) { setToast("儀表板請使用各報表分頁匯出明細"); return; } const exportRows = selectedIds.length ? rows.filter(row => selectedIds.includes(String(row.id))) : sortedRows; const header = currentConfig.columns.map(column => column.label).join(","); const body = exportRows.map(row => currentConfig.columns.map(column => `"${String(row[column.key] ?? "").replaceAll('"', '""')}"`).join(",")).join("\n"); const blob = new Blob(["\uFEFF" + header + "\n" + body], { type: "text/csv;charset=utf-8" }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${currentConfig.title}.csv`; anchor.click(); URL.revokeObjectURL(url); setToast(`已匯出 ${exportRows.length} 筆 Excel 相容檔案`); };
  const reportPrintTitle = currentConfig ? (drilldown && ["cost", "advance"].includes(currentConfig.kind) ? monthTitle(drilldown, currentConfig.kind === "cost" ? "成本報表" : "代墊報表") : drilldown && currentConfig.kind === "supply" ? drilldown : currentConfig.title) : "總覽儀表板";
  const printCellValue = (row: Row, column: Column) => {
    if (column.key === "taxAmount") return revenueTaxAmount(row);
    if (column.key === "itemsSummary") return String(row[column.key] || "—");
    if (column.type === "select") {
      const raw = String(row[column.key] ?? "");
      return (column.key === "category" ? categoryText(raw) : raw) || "—";
    }
    return column.type === "currency" ? formatMoney(row[column.key]) : String(row[column.key] ?? "—") || "—";
  };
  const exportPdf = () => { window.print(); setToast("已開啟 Chrome 原生列印工作框，請在其中選擇直向或橫向並另存為 PDF"); };
  const importCsv = async (file: File) => { try { if (page === "dashboard") { setToast("請先進入要匯入的明細分頁"); return; } const isCsv = file.name.toLowerCase().endsWith(".csv"); const source = isCsv ? await file.text() : await file.arrayBuffer(); const workbook = XLSX.read(source, { type: isCsv ? "string" : "array", raw: false, cellDates: false, codepage: 65001 }); const sheet = workbook.Sheets[workbook.SheetNames[0]]; const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false }) as unknown[][]; if (matrix.length < 2) { setToast("匯入檔案沒有可用資料"); return; } const headers = (matrix[0] || []).map(value => String(value).trim()); const targetConfig = configs[importTarget]; const imported = matrix.slice(1).filter(row => row.some(Boolean)).map(values => { const row: Row = { id: id() }; targetConfig.columns.forEach((column, index) => { const headerIndex = headers.findIndex(header => header === column.label || header === column.key); const raw = values[headerIndex >= 0 ? headerIndex : index] ?? ""; if (column.type === "currency" || column.type === "number") row[column.key] = money(raw); else if (column.type === "date") { const text = String(raw); const parsed = new Date(text); row[column.key] = /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : Number.isNaN(parsed.getTime()) ? text : parsed.toISOString().slice(0, 10); } else row[column.key] = String(raw); }); return importTarget === "activityCost" || importTarget === "fragranceCost" ? classifyCost(row, data.memory || []) : row; }); const nextMemory = imported.filter(row => importTarget === "activityCost" || importTarget === "fragranceCost").reduce((memory, row) => updateMemory(memory, row), data.memory || []); setData(current => normalizeStore({ ...current, [importTarget]: [...imported, ...current[importTarget]], memory: nextMemory })); setDirty(true); setToast(`已匯入 ${imported.length} 筆至${targetConfig.title}草稿`); } catch { setToast("Excel 匯入失敗，請確認檔案欄位與格式"); } };

  const createGroup = (value: string) => {
    if (!currentConfig) return;
    const normalized = currentConfig.kind === "supply" ? value.trim() : value.trim().slice(0, 7);
    const exists = baseRows.some(row => groupKey(row) === normalized);
    if (exists) { setDrilldown(normalized); setAddOpen(false); setToast(`已有${currentConfig.kind === "supply" ? "相同專案" : "相同月份"}，已直接開啟原有報表`); return; }
    let row: Row;
    if (currentConfig.kind === "supply") row = { id: id(), date: today, project: normalized, item: "", itemName: "", quantity: 0, size: "", website: "", price: 0, status: "待採購", checked: "未檢查", toolboxNo: "" };
    else if (currentConfig.kind === "advance") row = { id: id(), date: `${normalized}-01`, project: "", payee: "", description: "", amount: 0, status: "未結清" };
    else if (currentConfig.kind === "receipt") row = { id: id(), month: normalized, date: `${normalized}-01`, filename: "", category: categories[0], note: "" };
    else row = { id: id(), date: `${normalized}-01`, invoiceType: "電子發票", invoiceNo: "", buyerTaxId: "", sellerTaxId: "", category: categories[0], vendor: "", amount: 0 };
    commit({ ...data, [page]: [row, ...baseRows] }); setAddOpen(false); setToast(`已新增${currentConfig.kind === "supply" ? "專案" : "月份"}草稿`);
  };
  const addReceipt = (row: Row) => { commit({ ...data, receipts: [row, ...baseRows] }); setAddOpen(false); setToast("紙本憑證已加入草稿"); };
  const openReceipt = (row: Row) => setReceiptViewId(String(row.id));
  const printReceipt = (row: Row) => { const popup = window.open("about:blank", "_blank"); if (!popup) { setToast("Chrome 阻擋了新視窗，請允許此網站開啟彈出視窗後再試一次"); return; } const filename = String(row.filename || row.fileName || "憑證"); const load = async () => { try { const blob = row.fileKey ? await loadReceiptBlob(String(row.fileKey)) : null; const source = blob ? URL.createObjectURL(blob) : String(row.fileDataUrl || ""); if (!source) { popup.close(); setToast("找不到憑證檔案內容"); return; } popup.location.href = source; window.setTimeout(() => { if (blob) URL.revokeObjectURL(source); }, 60000); } catch { popup.close(); setToast(`無法開啟 ${filename}，請重新上傳檔案`); } }; void load(); };
  const deleteReceipt = (row: Row) => { if (!window.confirm("確定刪除這個憑證檔案？")) return; if (row.fileKey) void removeReceiptBlob(String(row.fileKey)); commit({ ...data, receipts: baseRows.filter(item => String(item.id) !== String(row.id)) }); setToast("憑證已移除（草稿）"); };
  const tableCell = (row: Row, column: Column) => {
    if (column.key === "taxAmount") return <><span className="print-value">{revenueTaxAmount(row)}</span><strong className="tax-amount-screen">{revenueTaxAmount(row)}</strong></>;
    const rawValue = String(row[column.key] ?? ""); const options = column.key === "category" ? categories : column.options || categories; const value = column.type === "select" ? (column.key === "category" ? categoryText(rawValue) : rawValue) : rawValue; const printText = column.key === "itemsSummary" ? value : column.type === "currency" ? formatMoney(row[column.key]) : value || "—";
    if (column.type === "date") return <span className="date-text">{value || "—"}</span>;
    if (column.type === "select") return <><span className="print-value">{printText}</span><select className={`screen-cell ${currentConfig?.kind === "cost" && column.key === "category" ? "cost-category-select" : ""}`} value={value} onChange={event => updateCell(String(row.id), column.key, event.target.value)}>{(column.key === "category" ? categories : column.options || categories).map(option => <option key={option}>{option}</option>)}</select></>;
    if (column.key === "itemsSummary") return <span className="items-summary">{value || "—"}</span>;
    if (currentConfig?.kind === "cost" && column.key === "vendor") return <><span className="print-value">{printText}</span><textarea className="cell-input screen-cell wrap-input" rows={Math.max(1, Math.ceil(value.length / 10))} value={value} onChange={event => updateCell(String(row.id), column.key, event.target.value)} /></>; return <><span className="print-value">{printText}</span><input className={`cell-input screen-cell ${column.type === "currency" ? "currency-input" : ""}`} type={column.type === "currency" || column.type === "number" ? "number" : "text"} value={value} onChange={event => updateCell(String(row.id), column.key, event.target.value)} /></>;
  };
  const sidebarGroups = ["總覽", "活動", "香氛", "管理", "知識"]; const isReceiptGallery = currentConfig?.kind === "receipt" && !!drilldown;

  return <div className="app-shell">
    <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}><div className="brand"><div className="brand-mark">心</div>{!collapsed && <div><strong>心引力</strong><span>ACCOUNTING OS</span></div>}</div><div className="sidebar-toggle"><button className="icon-btn" onClick={() => setCollapsed(value => !value)} title="收合導覽"><Menu size={20} /></button></div><div className="nav-scroll">{sidebarGroups.map(group => <div className="nav-group" key={group}><div className="nav-group-label">{!collapsed && group}</div>{nav.filter(item => item.group === group).map(item => { const Icon = item.icon; return <button key={item.key} className={`nav-item ${page === item.key ? "active" : ""}`} onClick={() => setPage(item.key)} title={item.label}><Icon size={18} /><span>{!collapsed && item.label}</span>{page === item.key && <i />}</button>; })}</div>)}</div>{!collapsed && <div className="sidebar-foot"><div className="sync-dot"><span />本機草稿已保護</div><small>正式儲存前可隨時復原</small></div>}</aside>
    <main className="main-area"><header className="topbar"><div className="topbar-left"><button className="mobile-menu icon-btn" onClick={() => setCollapsed(value => !value)}><Menu size={20} /></button><div className="crumb">心引力有限公司 <span>/</span> {page === "dashboard" ? "總覽儀表板" : currentConfig?.title}</div></div><div className="top-actions"><button className="top-btn" onClick={undo}><Undo2 size={16} />復原 <em>{history.length}</em></button><button className="top-btn" onClick={exportExcel}><FileSpreadsheet size={16} />匯出 Excel</button><button className="top-btn" onClick={exportPdf}><Printer size={16} />另存 PDF</button><button className="top-btn import" onClick={() => { setImportTarget(page === "dashboard" ? "activityCost" : page); fileRef.current?.click(); }}><FolderOpen size={16} />匯入 Excel</button><input ref={fileRef} className="file-input" type="file" accept=".xlsx,.xls,.csv" onChange={event => event.target.files?.[0] && importCsv(event.target.files[0])} /></div></header><div className="mobile-nav">{nav.map(item => <button key={item.key} className={page === item.key ? "active" : ""} onClick={() => setPage(item.key)}>{item.label}</button>)}</div>
      <section className="content">{page === "dashboard" ? <Dashboard period={period} setPeriod={setPeriod} monthOptions={monthOptions} activityCost={activityCost} fragranceCost={fragranceCost} activityRevenue={activityRevenue} fragranceRevenue={fragranceRevenue} vat={vat} advances={advances} stockProfit={stockProfit} costChart={costChart} onNavigate={setPage} /> : <><div className="page-heading"><div><span className="eyebrow">{currentConfig?.eyebrow}</span><h1>{currentConfig?.title}</h1><p>{currentConfig?.description}</p></div><div className="heading-status"><span className={dirty ? "status-dot dirty" : "status-dot"} />{dirty ? "有未儲存草稿" : "已同步"}</div></div><div className="report-card"><div className="print-report-header"><strong>{reportPrintTitle}</strong><span>共 {isReceiptGallery ? rows.filter(row => String(row.filename || "").trim()).length : pdfRows.length} 筆</span></div><div className="report-toolbar"><div className="report-context-title">{drilldown && (currentConfig?.kind === "cost" || currentConfig?.kind === "advance") ? monthTitle(drilldown, currentConfig.kind === "cost" ? "成本報表" : "代墊報表") : drilldown && currentConfig?.kind === "supply" ? `${drilldown}｜物資明細` : ""}</div><div className="toolbar-actions">{drilldown && <button className="btn ghost" onClick={() => setDrilldown(null)}><ArrowLeft size={16} />返回{groupLabel}</button>}<button className="btn soft" onClick={() => setDateOpen(true)}><CalendarDays size={16} />{dateFilter.from || dateFilter.to ? `${dateFilter.from || "不限"} ~ ${dateFilter.to || "不限"}` : "選取日期"}</button><button className={`btn primary ${saving ? "loading" : ""}`} onClick={save} disabled={saving}><CloudUpload size={16} />{saving ? "儲存中…" : "儲存"}</button>{["cost", "advance", "supply", "stock"].includes(currentConfig!.kind) && <><button className="btn danger-soft" onClick={removeSelected}><Trash2 size={16} />刪除勾選</button>{currentConfig!.kind === "cost" && <><button className="btn lavender" onClick={() => setCategoryOpen("add")}><Plus size={16} />新增品項</button><button className="btn ghost" onClick={() => setCategoryOpen("delete")}><SlidersHorizontal size={16} />刪除品項</button></>}</>}<button className="btn dark" onClick={() => setAddOpen(true)}><Plus size={16} />{groupMode ? `新增${groupLabel}` : currentConfig?.addLabel}</button></div></div>{selectedIds.length > 0 && <div className="selection-bar"><Check size={15} />已勾選 {selectedIds.length} 筆 <span>（總計：{formatMoney(selectedTotal)}）</span><button onClick={() => setSelected(current => ({ ...current, [page]: [] }))}>清除選取</button></div>}
        {groupMode ? <div className="group-grid">{groupValues.map(value => <button className="group-card" key={value} onClick={() => setDrilldown(value)}><strong>{currentConfig?.kind === "supply" ? value : `${value.slice(0, 4)} 年 ${value.slice(5)} 月`}</strong><span>{baseRows.filter(row => groupKey(row) === value && (currentConfig?.kind !== "receipt" || String(row.filename || "").trim())).length} 筆{currentConfig?.kind === "receipt" ? "檔案" : "明細"}</span><ChevronRight size={18} /></button>)}{!groupValues.length && <div className="empty"><strong>尚未建立{groupLabel}</strong><span>請使用右上方新增按鈕建立第一個{groupLabel}。</span></div>}</div> : isReceiptGallery ? <ReceiptFiles rows={rows} onOpen={openReceipt} onPrint={printReceipt} onDelete={deleteReceipt} /> : <><div className="table-wrap print-table"><table><colgroup><col className="serial-col-width" />{currentConfig?.columns.map(column => <col key={column.key} style={{ width: column.width }} />)}</colgroup><thead><tr><th className="serial-col">序號</th>{currentConfig?.columns.map(column => <th key={column.key}>{column.label}</th>)}</tr></thead><tbody>{pdfRows.map((row, rowIndex) => <tr key={`print-${String(row.id)}`}><td className="serial-col">{rowIndex + 1}</td>{currentConfig?.columns.map(column => <td key={column.key}>{printCellValue(row, column)}</td>)}</tr>)}</tbody></table></div><div className={`table-wrap screen-table ${currentConfig?.kind === "cost" ? "cost-table" : ""} ${page === "fragranceRevenue" ? "fragrance-revenue-table" : ""} ${page === "supplies" ? "supplies-table" : ""}`}><table><colgroup><col className="check-col-width" /><col className="serial-col-width" />{currentConfig?.columns.map(column => <col key={column.key} style={{ width: column.width }} />)}<col className="action-col-width" /></colgroup><thead><tr><th className="check-col"><input type="checkbox" checked={allCurrentSelected} onChange={toggleAll} /></th><th className="serial-col print-only">序號</th>{currentConfig?.columns.map(column => <th key={column.key}>{column.label}{column.type === "date" && <button className={`sort-btn ${sortDir === "desc" ? "sort-desc" : ""}`} onClick={() => setSortDir(value => value === "asc" ? "desc" : "asc")} title={sortDir === "asc" ? "目前由舊到新，點擊改為由新到舊" : "目前由新到舊，點擊改為由舊到新"}>▲</button>}</th>)}<th className="action-col">操作</th></tr></thead><tbody>{pageRows.length === 0 ? <tr><td colSpan={(currentConfig?.columns.length || 1) + 2}><div className="empty"><Search size={22} /><strong>沒有符合條件的資料</strong><span>調整日期，或按右上角新增一筆資料。</span></div></td></tr> : pageRows.map((row, rowIndex) => <tr key={String(row.id)}><td className="check-col"><input type="checkbox" checked={selectedIds.includes(String(row.id))} onChange={() => toggleRow(String(row.id))} /></td><td className="serial-col print-only">{(pageNo - 1) * 20 + rowIndex + 1}</td>{currentConfig?.columns.map(column => <td key={column.key}>{tableCell(row, column)}</td>)}<td className="action-col">{currentConfig?.kind === "revenue" && <button className="row-edit" onClick={() => setEditRow(row)} title="修改"><Settings2 size={15} /></button>}<button className="row-delete" onClick={() => deleteOne(String(row.id))} title="刪除"><Trash2 size={15} /></button></td></tr>)}</tbody></table></div></>}
        <div className="table-footer"><span>共 {isReceiptGallery ? rows.filter(row => String(row.filename || "").trim()).length : filteredRows.length} 筆</span><div className="pagination"><button disabled={pageNo <= 1} onClick={() => setPageNo(value => Math.max(1, value - 1))}><ChevronLeft size={16} />上一頁</button><strong>{pageNo} / {totalPages}</strong><button disabled={pageNo >= totalPages} onClick={() => setPageNo(value => Math.min(totalPages, value + 1))}>下一頁<ChevronRight size={16} /></button><label>跳至 <input value={pageNo} onChange={event => setPageNo(Math.min(totalPages, Math.max(1, Number(event.target.value) || 1)))} /> 頁</label></div><span>每頁 20 筆</span></div></div></>}</section></main>
    {dateOpen && <DateModal initial={dateFilter} onClose={() => setDateOpen(false)} onApply={setDateFilter} />}
    {receiptViewId && <ReceiptViewer row={data.receipts.find(item => String(item.id) === receiptViewId) || { id: receiptViewId }} onClose={() => setReceiptViewId(null)} />}
    {editRow && currentConfig?.kind === "revenue" && <RevenueAddModal mode={page === "activityRevenue" ? "activity" : "fragrance"} initial={editRow} onClose={() => setEditRow(null)} onAdd={row => { commit({ ...data, [page]: baseRows.map(item => String(item.id) === String(editRow.id) ? row : item) }); setEditRow(null); setToast("營收明細已修改為草稿"); }} />}
    {addOpen && currentConfig && groupMode && <GroupAddModal kind={currentConfig.kind === "supply" ? "project" : "month"} onClose={() => setAddOpen(false)} onAdd={createGroup} />}
    {addOpen && currentConfig && !groupMode && (currentConfig.kind === "receipt" ? <ReceiptAddModal month={drilldown || today.slice(0, 7)} categories={categories} onClose={() => setAddOpen(false)} onAdd={addReceipt} /> : currentConfig.kind === "revenue" ? <RevenueAddModal mode={page === "activityRevenue" ? "activity" : "fragrance"} onClose={() => setAddOpen(false)} onAdd={addRow} /> : <AddModal config={{ ...currentConfig, columns: currentConfig.columns.map(column => column.key === "category" ? { ...column, options: categories } : column) }} categories={categories} defaultMonth={drilldown && (currentConfig.kind === "cost" || currentConfig.kind === "advance") ? drilldown : null} onClose={() => setAddOpen(false)} onAdd={addRow} />)}
    {categoryOpen === "add" && <CategoryModal type="add" categories={customCategories} onClose={() => setCategoryOpen(null)} onSubmit={name => { if (categories.includes(name)) { setToast("已有同名用途品項"); return; } setCustomCategories(value => [...value, name]); setCategoryOpen(null); setToast("自訂品項已同步至活動、香氛與分類記憶庫"); }} />}
    {categoryOpen === "delete" && <CategoryModal type="delete" categories={customCategories} onClose={() => setCategoryOpen(null)} onSubmit={name => { setCustomCategories(value => value.filter(category => category !== name)); setCategoryOpen(null); setToast("自訂品項已移除；歷史紀錄保留原分類文字"); }} />}
    {toast && <Toast message={toast} onClose={() => setToast("")} />}
  </div>;
}

function Dashboard({ period, setPeriod, monthOptions, activityCost, fragranceCost, activityRevenue, fragranceRevenue, vat, advances, stockProfit, costChart, onNavigate }: { period: string; setPeriod: (value: string) => void; monthOptions: string[]; activityCost: number; fragranceCost: number; activityRevenue: number; fragranceRevenue: number; vat: number; advances: number; stockProfit: number; costChart: (key: "activityCost" | "fragranceCost") => [string, number][]; onNavigate: (page: PageKey) => void }) {
  const revenueTotal = activityRevenue + fragranceRevenue; const revenueRatio = revenueTotal ? Math.round((activityRevenue / revenueTotal) * 100) : 50; const allCost = activityCost + fragranceCost; const vatRatio = allCost ? Math.round((vat / allCost) * 100) : 0;
  const kpis = [{ label: "活動成本", value: activityCost, tone: "rose", target: "activityCost" as PageKey }, { label: "香氛成本", value: fragranceCost, tone: "green", target: "fragranceCost" as PageKey }, { label: "活動營收", value: activityRevenue, tone: "purple", target: "activityRevenue" as PageKey }, { label: "香氛營收", value: fragranceRevenue, tone: "orange", target: "fragranceRevenue" as PageKey }, { label: "可扣抵營業稅", value: vat, tone: "blue" }, { label: "代墊款總額", value: advances, tone: "pink" }, { label: "股票損益", value: stockProfit, tone: "gold", target: "stocks" as PageKey }];
  return <><div className="page-heading dashboard-heading"><div><span className="eyebrow">OVERVIEW / COMMAND CENTER</span><h1>總覽儀表板</h1><p>把成本、營收與資金流放在同一個視窗，今天的數字一眼就懂。</p></div><div className="period-filter"><CalendarDays size={16} /><span>統計區間</span><select value={period} onChange={event => setPeriod(event.target.value)}><option value="all">全部歷史總計</option>{monthOptions.map(month => <option key={month} value={month}>{month.replace("-", " 年 ")} 月</option>)}</select><ChevronDown size={14} /></div></div><div className="kpi-grid">{kpis.map(kpi => <div key={kpi.label} className={`kpi-card ${kpi.tone} ${kpi.target ? "is-link" : ""}`} onClick={() => kpi.target && onNavigate(kpi.target)} role={kpi.target ? "button" : undefined} tabIndex={kpi.target ? 0 : undefined}><div className="kpi-top"><span>{kpi.label}</span>{kpi.target && <ArrowRight size={16} />}</div><strong>{formatMoney(kpi.value)}</strong></div>)}</div><div className="dashboard-grid"><div className="dash-card revenue-card"><div className="card-heading"><div><span className="eyebrow">REVENUE MIX</span><h3>營收占比</h3></div><span className="live-pill"><span />每筆依稅別加總</span></div><div className="donut-layout"><div className="donut" style={{ background: `conic-gradient(#d3a9a6 0 ${revenueRatio}%, #b8a8c8 ${revenueRatio}% 100%)` }}><div><strong>{revenueTotal ? `${revenueRatio}%` : "—"}</strong><span>活動營收</span></div></div><div className="legend"><div><i className="rose-dot" /><span>活動營收</span><strong>{formatMoney(activityRevenue)}</strong></div><div><i className="purple-dot" /><span>香氛營收</span><strong>{formatMoney(fragranceRevenue)}</strong></div><hr /><div><span>合計營收</span><strong>{formatMoney(revenueTotal)}</strong></div></div></div></div><div className="dash-card vat-card"><div className="card-heading"><div><span className="eyebrow">INPUT TAX</span><h3>可扣抵營業稅狀態</h3></div><span className="tax-badge">{vatRatio}% 合格率</span></div><div className="progress-ring"><div className="ring-center"><strong>{formatMoney(vat)}</strong><span>可扣抵營業稅</span></div></div><div className="vat-summary"><div><span>全部進項成本</span><strong>{formatMoney(allCost)}</strong></div><div><span>排除項目後</span><strong>{formatMoney(allCost - vat)}</strong></div></div></div><BarChart title="活動用途品項" data={costChart("activityCost")} color="#d3a9a6" /><BarChart title="香氛用途品項" data={costChart("fragranceCost")} color="#b8a8c8" /></div></>;
}

function BarChart({ title, data, color }: { title: string; data: [string, number][]; color: string }) {
  const max = Math.max(...data.map(item => item[1]), 1); return <div className="dash-card bar-card"><div className="card-heading"><div><span className="eyebrow">COST BY CATEGORY</span><h3>{title}</h3></div><BarChart3 size={18} /></div>{data.length ? <div className="bars">{data.map(([label, value]) => <div className="bar-row" key={label}><span>{label}</span><div className="bar-track"><i style={{ width: `${Math.max(4, (value / max) * 100)}%`, background: color }} /><b>{Math.round(value / 1000)}k</b></div></div>)}</div> : <div className="chart-empty">目前沒有可視化資料</div>}</div>;
}
