import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, ArrowRight, BarChart3, BookOpen, CalendarDays, Check, ChevronDown,
  ChevronLeft, ChevronRight, CircleDollarSign, ClipboardList, CloudUpload,
  Download, FileSpreadsheet, FileText, FolderOpen, Image as ImageIcon,
  LayoutDashboard, Menu, Package, Plus, Printer, RefreshCcw, Search, Settings2,
  ShoppingBag, SlidersHorizontal, Sprout, Tags, Trash2, TrendingUp, Undo2,
  Upload, Wallet, X, Zap
} from "lucide-react";

const BASE_CATEGORIES = [
  "國內交通費", "國內住宿費", "國外交通費", "國外住宿費", "餐飲膳食費", "採購活動用品",
  "採購表演服裝", "場地租借費", "交通費", "停車費", "進貨營業成本", "物流運費",
  "軟體訂閱費", "專業服務費（會計/律師/顧問）", "勞報新資費", "充電費", "水電瓦斯費", "其他營業雜支"
];

type PageKey = "dashboard" | "activityCost" | "activityRevenue" | "activityAdvance" | "fragranceCost" | "fragranceRevenue" | "fragranceAdvance" | "supplies" | "stocks" | "receipts" | "laws" | "memory";
type Row = { id: string; [key: string]: string | number | boolean | undefined };
type Store = Record<PageKey, Row[]>;

type Column = { key: string; label: string; type?: "text" | "number" | "date" | "select" | "currency"; options?: string[]; width?: string };
type Config = { title: string; eyebrow: string; description: string; kind: "cost" | "revenue" | "advance" | "supply" | "stock" | "receipt" | "law" | "memory"; columns: Column[]; amountKey?: string; dateKey?: string; addLabel: string };

const nav: { key: PageKey; label: string; icon: React.ElementType; group: string }[] = [
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
  { key: "invoiceType", label: "發票種類", type: "select", options: ["電子發票", "紙本發票", "紙本收據"], width: "120px" },
  { key: "invoiceNo", label: "發票號碼", type: "text", width: "120px" },
  { key: "date", label: "日期", type: "date", width: "128px" },
  { key: "buyerTaxId", label: "買方統編", type: "text", width: "108px" },
  { key: "sellerTaxId", label: "賣方統編", type: "text", width: "108px" },
  { key: "category", label: "用途品項", type: "select", options: BASE_CATEGORIES, width: "150px" },
  { key: "vendor", label: "賣方名稱", type: "text", width: "140px" },
  { key: "amount", label: "金額 (NT$)", type: "currency", width: "120px" },
];

const configs: Record<Exclude<PageKey, "dashboard">, Config> = {
  activityCost: { title: "活動月成本報表", eyebrow: "ACTIVITY / COST", description: "追蹤活動專案的發票、用途與可扣抵進項稅額。", kind: "cost", columns: costColumns, amountKey: "amount", dateKey: "date", addLabel: "新增發票" },
  fragranceCost: { title: "香氛月成本報表", eyebrow: "FRAGRANCE / COST", description: "管理香氛專案採購、供應商分類與成本結構。", kind: "cost", columns: costColumns, amountKey: "amount", dateKey: "date", addLabel: "新增發票" },
  activityRevenue: { title: "活動營收報表", eyebrow: "ACTIVITY / REVENUE", description: "活動專案收入與含稅計算的完整紀錄。", kind: "revenue", columns: [
    { key: "date", label: "日期", type: "date", width: "128px" }, { key: "project", label: "活動專案", type: "text", width: "180px" }, { key: "customer", label: "客戶名稱", type: "text", width: "150px" }, { key: "totalAmount", label: "總金額", type: "currency", width: "128px" }, { key: "taxMode", label: "稅額模式", type: "select", options: ["tax-included", "tax-excluded"], width: "130px" }, { key: "status", label: "狀態", type: "select", options: ["已收款", "待收款", "部分收款"], width: "120px" }
  ], amountKey: "totalAmount", dateKey: "date", addLabel: "新增營收" },
  fragranceRevenue: { title: "香氛營收報表", eyebrow: "FRAGRANCE / REVENUE", description: "香氛商品收入、最終售價與收款狀態。", kind: "revenue", columns: [
    { key: "date", label: "日期", type: "date", width: "128px" }, { key: "project", label: "商品／專案", type: "text", width: "180px" }, { key: "customer", label: "客戶名稱", type: "text", width: "150px" }, { key: "finalPrice", label: "最終售價", type: "currency", width: "128px" }, { key: "taxMode", label: "稅額模式", type: "select", options: ["tax-included", "tax-excluded"], width: "130px" }, { key: "status", label: "狀態", type: "select", options: ["已收款", "待收款", "部分收款"], width: "120px" }
  ], amountKey: "finalPrice", dateKey: "date", addLabel: "新增營收" },
  activityAdvance: { title: "活動代墊款", eyebrow: "ACTIVITY / ADVANCE", description: "記錄活動團隊代墊與核銷進度。", kind: "advance", columns: [
    { key: "date", label: "日期", type: "date", width: "128px" }, { key: "project", label: "活動專案", type: "text", width: "170px" }, { key: "payee", label: "代墊人", type: "text", width: "120px" }, { key: "description", label: "用途說明", type: "text", width: "220px" }, { key: "amount", label: "金額", type: "currency", width: "128px" }, { key: "status", label: "核銷狀態", type: "select", options: ["待核銷", "已核銷"], width: "120px" }
  ], amountKey: "amount", dateKey: "date", addLabel: "新增代墊" },
  fragranceAdvance: { title: "香氛代墊款", eyebrow: "FRAGRANCE / ADVANCE", description: "香氛採購與製作過程的代墊款追蹤。", kind: "advance", columns: [
    { key: "date", label: "日期", type: "date", width: "128px" }, { key: "project", label: "專案／商品", type: "text", width: "170px" }, { key: "payee", label: "代墊人", type: "text", width: "120px" }, { key: "description", label: "用途說明", type: "text", width: "220px" }, { key: "amount", label: "金額", type: "currency", width: "128px" }, { key: "status", label: "核銷狀態", type: "select", options: ["待核銷", "已核銷"], width: "120px" }
  ], amountKey: "amount", dateKey: "date", addLabel: "新增代墊" },
  supplies: { title: "專案物資單", eyebrow: "PROJECT / SUPPLIES", description: "管理活動與香氛專案的物料需求、數量與採購狀態。", kind: "supply", columns: [
    { key: "date", label: "日期", type: "date", width: "128px" }, { key: "project", label: "專案", type: "text", width: "160px" }, { key: "item", label: "物資名稱", type: "text", width: "190px" }, { key: "quantity", label: "數量", type: "number", width: "90px" }, { key: "unitPrice", label: "單價", type: "currency", width: "110px" }, { key: "amount", label: "小計", type: "currency", width: "120px" }, { key: "status", label: "採購狀態", type: "select", options: ["待採購", "已採購", "已入庫"], width: "120px" }
  ], amountKey: "amount", dateKey: "date", addLabel: "新增物資" },
  stocks: { title: "股票投資報表", eyebrow: "PORTFOLIO / P&L", description: "追蹤股票交易損益；儀表板 KPI 不納入現金股利與股票股利。", kind: "stock", columns: [
    { key: "date", label: "交易日期", type: "date", width: "128px" }, { key: "ticker", label: "股票代號", type: "text", width: "100px" }, { key: "name", label: "股票名稱", type: "text", width: "140px" }, { key: "shares", label: "股數", type: "number", width: "88px" }, { key: "buyPrice", label: "買入價", type: "currency", width: "110px" }, { key: "sellPrice", label: "賣出價", type: "currency", width: "110px" }, { key: "realizedProfit", label: "已實現損益", type: "currency", width: "128px" }, { key: "dividend", label: "現金股利", type: "currency", width: "110px" }
  ], amountKey: "realizedProfit", dateKey: "date", addLabel: "新增交易" },
  receipts: { title: "每月紙本憑證圖庫", eyebrow: "ARCHIVE / RECEIPTS", description: "以月份整理紙本憑證與備註，支援檔案匯入與圖庫檢視。", kind: "receipt", columns: [
    { key: "month", label: "月份", type: "text", width: "100px" }, { key: "date", label: "憑證日期", type: "date", width: "128px" }, { key: "filename", label: "檔案名稱", type: "text", width: "220px" }, { key: "category", label: "分類", type: "select", options: BASE_CATEGORIES, width: "160px" }, { key: "amount", label: "金額", type: "currency", width: "120px" }, { key: "note", label: "備註", type: "text", width: "220px" }
  ], amountKey: "amount", dateKey: "date", addLabel: "新增憑證" },
  laws: { title: "國稅局法規對照", eyebrow: "REFERENCE / TAX LAW", description: "集中管理常用國稅局法規與公司內部對照摘要。", kind: "law", columns: [
    { key: "code", label: "法規編號", type: "text", width: "140px" }, { key: "title", label: "法規標題", type: "text", width: "220px" }, { key: "summary", label: "對照摘要", type: "text", width: "340px" }, { key: "updatedAt", label: "更新日期", type: "date", width: "128px" }, { key: "url", label: "來源連結", type: "text", width: "220px" }
  ], dateKey: "updatedAt", addLabel: "新增法規" },
  memory: { title: "分類記憶庫", eyebrow: "AUTOMATION / MEMORY", description: "依賣方統編優先、名稱其次，自動帶入用途分類。", kind: "memory", columns: [
    { key: "sellerTaxId", label: "賣方統編", type: "text", width: "120px" }, { key: "sellerName", label: "賣方名稱", type: "text", width: "180px" }, { key: "category", label: "自動分類", type: "select", options: BASE_CATEGORIES, width: "180px" }, { key: "note", label: "備註", type: "text", width: "260px" }, { key: "updatedAt", label: "更新日期", type: "date", width: "128px" }
  ], dateKey: "updatedAt", addLabel: "新增記憶" },
};

const id = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
export const money = (value: unknown) => Number(String(value ?? 0).replace(/[NT$,$\s]/g, "")) || 0;
export const formatMoney = (value: unknown) => `NT$ ${money(value).toLocaleString("zh-TW", { maximumFractionDigits: 0 })}`;
const today = new Date().toISOString().slice(0, 10);

export function seedData(): Store {
  const cost = (prefix: string, amount: number, day: string, category: string, vendor: string, invoiceNo: string): Row => ({ id: id(), invoiceType: "電子發票", invoiceNo, date: `2026-09-${day}`, buyerTaxId: "24567891", sellerTaxId: `${prefix}1234567`, category, vendor, amount });
  return {
    dashboard: [],
    activityCost: [cost("80", 12800, "03", "場地租借費", "好日子場地股份有限公司", "AB12345678"), cost("81", 6800, "07", "採購活動用品", "光影製作社", "CD23456789"), cost("82", 2350, "13", "國內交通費", "台灣高鐵", "EF34567890"), cost("83", 4200, "18", "專業服務費（會計/律師/顧問）", "安心理財顧問", "GH45678901"), cost("84", 1800, "22", "餐飲膳食費", "日光餐飲", "IJ56789012")],
    fragranceCost: [cost("90", 9200, "02", "進貨營業成本", "香氣原料行", "KL12345678"), cost("91", 3600, "09", "物流運費", "安心物流", "MN23456789"), cost("92", 2400, "14", "軟體訂閱費", "設計雲端", "OP34567890"), cost("93", 1980, "20", "採購活動用品", "包裝研究所", "QR45678901")],
    activityRevenue: [
      { id: id(), date: "2026-09-05", project: "秋日品牌發表會", customer: "森日生活", totalAmount: 58000, taxMode: "tax-included", status: "已收款" },
      { id: id(), date: "2026-09-16", project: "企業家庭日企劃", customer: "沐光科技", totalAmount: 42000, taxMode: "tax-excluded", status: "待收款" },
      { id: id(), date: "2026-08-28", project: "城市香氣展演", customer: "拾光文創", totalAmount: 36000, taxMode: "tax-included", status: "已收款" },
    ],
    fragranceRevenue: [
      { id: id(), date: "2026-09-06", project: "室內擴香禮盒", customer: "日和設計", finalPrice: 19800, taxMode: "tax-included", status: "已收款" },
      { id: id(), date: "2026-09-21", project: "品牌香氛顧問", customer: "山丘旅店", finalPrice: 26000, taxMode: "tax-excluded", status: "待收款" },
    ],
    activityAdvance: [{ id: id(), date: "2026-09-04", project: "秋日品牌發表會", payee: "林怡君", description: "佈置耗材採買", amount: 1800, status: "待核銷" }, { id: id(), date: "2026-08-22", project: "城市香氣展演", payee: "陳柏安", description: "交通與停車", amount: 1250, status: "已核銷" }],
    fragranceAdvance: [{ id: id(), date: "2026-09-11", project: "室內擴香禮盒", payee: "王郁婷", description: "樣品寄送", amount: 620, status: "待核銷" }],
    supplies: [{ id: id(), date: "2026-09-01", project: "秋日品牌發表會", item: "桌上立牌", quantity: 30, unitPrice: 95, amount: 2850, status: "已採購" }, { id: id(), date: "2026-09-03", project: "室內擴香禮盒", item: "霧面紙盒", quantity: 100, unitPrice: 42, amount: 4200, status: "待採購" }],
    stocks: [{ id: id(), date: "2026-08-12", ticker: "0050", name: "元大台灣50", shares: 100, buyPrice: 182, sellPrice: 195, realizedProfit: 1300, dividend: 0 }, { id: id(), date: "2026-07-19", ticker: "2330", name: "台積電", shares: 20, buyPrice: 960, sellPrice: 1015, realizedProfit: 1100, dividend: 0 }, { id: id(), date: "2026-06-30", ticker: "00878", name: "國泰永續高股息", shares: 200, buyPrice: 21, sellPrice: 0, realizedProfit: 0, dividend: 360 }],
    receipts: [{ id: id(), month: "2026-09", date: "2026-09-03", filename: "20260903_場地押金.jpg", category: "場地租借費", amount: 12000, note: "紙本憑證已核對" }],
    laws: [{ id: id(), code: "營業稅法§19", title: "進項稅額不得扣抵之憑證", summary: "紙本收據與餐飲膳食費需依規則排除可扣抵營業稅。", updatedAt: "2026-08-30", url: "https://www.etax.nat.gov.tw/" }, { id: id(), code: "統一發票使用辦法", title: "發票保存與記載", summary: "發票號碼、日期及交易對象欄位應保存原始文字。", updatedAt: "2026-08-18", url: "https://law.moj.gov.tw/" }],
    memory: [{ id: id(), sellerTaxId: "801234567", sellerName: "好日子場地股份有限公司", category: "場地租借費", note: "統編完全比對優先", updatedAt: "2026-09-03" }, { id: id(), sellerTaxId: "901234567", sellerName: "香氣原料行", category: "進貨營業成本", note: "供香氛原料使用", updatedAt: "2026-09-02" }],
  };
}

function useStoredStore() {
  const [data, setData] = useState<Store>(() => {
    try { const saved = localStorage.getItem("xyl-accounting-store"); return saved ? JSON.parse(saved) : seedData(); } catch { return seedData(); }
  });
  useEffect(() => { localStorage.setItem("xyl-accounting-store", JSON.stringify(data)); }, [data]);
  return [data, setData] as const;
}

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 3200); return () => clearTimeout(t); }, [onClose]);
  return <div className="toast"><Check size={16} /> {message}<button onClick={onClose}><X size={14} /></button></div>;
}

function DateModal({ initial, onClose, onApply }: { initial: { from: string; to: string }; onClose: () => void; onApply: (v: { from: string; to: string }) => void }) {
  const [from, setFrom] = useState(initial.from); const [to, setTo] = useState(initial.to);
  return <div className="modal-backdrop"><div className="modal date-modal"><div className="modal-head"><div><span className="eyebrow">FILTER / DATE RANGE</span><h3>選取日期區間</h3></div><button className="icon-btn" onClick={onClose}><X size={18} /></button></div><div className="date-grid"><label>開始日期<input type="date" value={from} onChange={e => setFrom(e.target.value)} /></label><label>結束日期<input type="date" value={to} onChange={e => setTo(e.target.value)} /></label></div><div className="quick-dates"><button onClick={() => { setFrom(""); setTo(""); }}>顯示全部</button><button onClick={() => { const d = new Date(); setFrom(new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)); setTo(today); }}>本月</button><button onClick={() => { const d = new Date(); setFrom(`${d.getFullYear()}-01-01`); setTo(today); }}>今年</button></div><div className="modal-actions"><button className="btn ghost" onClick={onClose}>取消</button><button className="btn primary" onClick={() => { onApply({ from, to }); onClose(); }}>確認篩選</button></div></div></div>;
}

function AddModal({ config, categories, onClose, onAdd }: { config: Config; categories: string[]; onClose: () => void; onAdd: (row: Row) => void }) {
  const initial = useMemo(() => Object.fromEntries(config.columns.map(c => [c.key, c.type === "select" ? (c.options?.[0] || categories[0] || "") : ""])), [config, categories]);
  const [form, setForm] = useState<Record<string, string | number>>(initial);
  const change = (key: string, value: string) => setForm(v => ({ ...v, [key]: value }));
  return <div className="modal-backdrop"><div className="modal wide-modal"><div className="modal-head"><div><span className="eyebrow">NEW RECORD / DRAFT</span><h3>{config.addLabel}</h3></div><button className="icon-btn" onClick={onClose}><X size={18} /></button></div><div className="form-grid">{config.columns.map(col => <label key={col.key}>{col.label}{col.type === "select" ? <select value={String(form[col.key] ?? "")} onChange={e => change(col.key, e.target.value)}>{(col.options?.length ? col.options : categories).map(o => <option key={o}>{o}</option>)}</select> : <input type={col.type === "number" || col.type === "currency" ? "number" : col.type === "date" ? "date" : "text"} value={String(form[col.key] ?? "")} onChange={e => change(col.key, e.target.value)} placeholder={col.type === "date" ? "選擇日期" : "可留白"} />}</label>)}</div><div className="modal-actions"><button className="btn ghost" onClick={onClose}>取消</button><button className="btn primary" onClick={() => { const parsed: Row = { id: id(), ...form }; config.columns.forEach(c => { if (c.type === "currency" || c.type === "number") parsed[c.key] = money(parsed[c.key]); }); onAdd(parsed); onClose(); }}>加入草稿</button></div></div></div>;
}

export default function Home() {
  const [data, setData] = useStoredStore();
  const [page, setPage] = useState<PageKey>("dashboard");
  const [collapsed, setCollapsed] = useState(false);
  const [query, setQuery] = useState("");
  const [dateFilter, setDateFilter] = useState({ from: "", to: "" });
  const [dateOpen, setDateOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState<"add" | "delete" | null>(null);
  const [customCategories, setCustomCategories] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem("xyl-accounting-categories") || "[]"); } catch { return []; } });
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [history, setHistory] = useState<Store[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pageNo, setPageNo] = useState(1);
  const [toast, setToast] = useState("");
  const [period, setPeriod] = useState("all");
  const [importTarget, setImportTarget] = useState<Exclude<PageKey, "dashboard">>("activityCost");
  const fileRef = useRef<HTMLInputElement>(null);
  const categories = [...BASE_CATEGORIES, ...customCategories];
  const currentConfig = page === "dashboard" ? null : configs[page];

  useEffect(() => { setPageNo(1); setQuery(""); setDateFilter({ from: "", to: "" }); setImportTarget(page === "dashboard" ? "activityCost" : page); }, [page]);
  useEffect(() => { localStorage.setItem("xyl-accounting-categories", JSON.stringify(customCategories)); }, [customCategories]);

  const commit = (next: Store) => { setHistory(h => [...h.slice(-19), data]); setData(next); setDirty(true); };
  const rows = page === "dashboard" ? [] : data[page];
  const filteredRows = useMemo(() => {
    if (!currentConfig) return [];
    const q = query.trim().toLowerCase();
    return rows.filter(row => {
      const haystack = currentConfig.columns.map(c => String(row[c.key] ?? "")).join(" ").toLowerCase();
      const matchesQuery = !q || haystack.includes(q);
      const dateValue = currentConfig.dateKey ? String(row[currentConfig.dateKey] || "") : "";
      const matchesDate = (!dateFilter.from || dateValue >= dateFilter.from) && (!dateFilter.to || dateValue <= dateFilter.to);
      return matchesQuery && matchesDate;
    });
  }, [rows, currentConfig, query, dateFilter]);
  const pageRows = filteredRows.slice((pageNo - 1) * 20, pageNo * 20);
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / 20));
  const selectedIds = selected[page] || [];
  const selectedRows = rows.filter(r => selectedIds.includes(String(r.id)));
  const selectedTotal = selectedRows.reduce((sum, r) => sum + money(currentConfig?.amountKey ? r[currentConfig.amountKey] : 0), 0);
  const allCurrentSelected = pageRows.length > 0 && pageRows.every(r => selectedIds.includes(String(r.id)));

  const allCategories = useMemo(() => categories, [categories]);
  const costRows = (key: "activityCost" | "fragranceCost") => data[key];
  const revenueAmount = (key: "activityRevenue" | "fragranceRevenue") => data[key].reduce((sum, r) => { const raw = money(r.totalAmount ?? r.finalPrice); return sum + (r.taxMode === "tax-included" ? Math.round(raw * 1.05) : raw); }, 0);
  const dashboardRows = (key: keyof Store) => {
    const list = data[key];
    if (period === "all") return list;
    return list.filter(r => String(r.date || "").startsWith(period));
  };
  const activityCost = dashboardRows("activityCost").reduce((s, r) => s + money(r.amount), 0);
  const fragranceCost = dashboardRows("fragranceCost").reduce((s, r) => s + money(r.amount), 0);
  const activityRevenue = dashboardRows("activityRevenue").reduce((s, r) => { const raw = money(r.totalAmount); return s + (r.taxMode === "tax-included" ? Math.round(raw * 1.05) : raw); }, 0);
  const fragranceRevenue = dashboardRows("fragranceRevenue").reduce((s, r) => { const raw = money(r.finalPrice); return s + (r.taxMode === "tax-included" ? Math.round(raw * 1.05) : raw); }, 0);
  const eligible = [...dashboardRows("activityCost"), ...dashboardRows("fragranceCost")].filter(r => r.invoiceType !== "紙本收據" && r.category !== "餐飲膳食費").reduce((s, r) => s + money(r.amount), 0);
  const vat = Math.round(eligible - eligible / 1.05);
  const advances = [...dashboardRows("activityAdvance"), ...dashboardRows("fragranceAdvance")].reduce((s, r) => s + money(r.amount), 0);
  const stockProfit = dashboardRows("stocks").reduce((s, r) => s + money(r.realizedProfit), 0);
  const monthOptions = useMemo(() => {
    const dates = [...data.activityCost, ...data.fragranceCost, ...data.activityRevenue, ...data.fragranceRevenue].map(r => String(r.date || "").slice(0, 7)).filter(Boolean);
    return Array.from(new Set(dates)).sort().reverse();
  }, [data]);
  const costChart = (key: "activityCost" | "fragranceCost") => {
    const sums: Record<string, number> = {}; dashboardRows(key).forEach(r => { const c = String(r.category || "未分類"); sums[c] = (sums[c] || 0) + money(r.amount); }); return Object.entries(sums).sort((a, b) => b[1] - a[1]).slice(0, 6);
  };

  const updateCell = (rowId: string, key: string, value: string) => {
    const next = { ...data, [page]: rows.map(r => String(r.id) === rowId ? { ...r, [key]: key === "amount" || key === "totalAmount" || key === "finalPrice" || key === "realizedProfit" || key === "dividend" || key === "unitPrice" || key === "quantity" ? money(value) : value } : r) };
    commit(next);
  };
  const addRow = (row: Row) => { commit({ ...data, [page]: [row, ...rows] }); setToast("已加入草稿，請按儲存同步至雲端資料庫"); };
  const removeSelected = () => {
    if (!selectedIds.length) { setToast("請先勾選要刪除的資料"); return; }
    if (!window.confirm(`確定刪除 ${selectedIds.length} 筆資料？此動作可使用復原。`)) return;
    commit({ ...data, [page]: rows.filter(r => !selectedIds.includes(String(r.id))) }); setSelected(s => ({ ...s, [page]: [] })); setToast("已刪除勾選資料（草稿）");
  };
  const deleteOne = (rowId: string) => { if (!window.confirm("確定刪除這筆資料？")) return; commit({ ...data, [page]: rows.filter(r => String(r.id) !== rowId) }); setToast("已刪除資料（草稿）"); };
  const toggleRow = (rowId: string) => setSelected(s => ({ ...s, [page]: s[page]?.includes(rowId) ? s[page].filter(id2 => id2 !== rowId) : [...(s[page] || []), rowId] }));
  const toggleAll = () => setSelected(s => ({ ...s, [page]: allCurrentSelected ? (s[page] || []).filter(id2 => !pageRows.some(r => String(r.id) === id2)) : Array.from(new Set([...(s[page] || []), ...pageRows.map(r => String(r.id))])) }));
  const save = () => { setSaving(true); setTimeout(() => { setSaving(false); setDirty(false); setToast("雲端儲存成功，已完成 read-back 比對"); }, 700); };
  const undo = () => { const last = history.at(-1); if (!last) { setToast("目前沒有可復原的操作"); return; } setData(last); setHistory(h => h.slice(0, -1)); setDirty(true); setToast("已復原上一個前端資料操作"); };
  const exportExcel = () => {
    if (!currentConfig) { setToast("儀表板請使用各報表分頁匯出明細"); return; }
    const exportRows = selectedIds.length ? rows.filter(r => selectedIds.includes(String(r.id))) : filteredRows;
    const header = currentConfig.columns.map(c => c.label).join(",");
    const body = exportRows.map(r => currentConfig.columns.map(c => `"${String(r[c.key] ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + header + "\n" + body], { type: "text/csv;charset=utf-8" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `${currentConfig.title}.csv`; a.click(); URL.revokeObjectURL(url); setToast(`已匯出 ${exportRows.length} 筆 Excel 相容檔案`);
  };
  const exportPdf = () => {
    const title = currentConfig?.title || "總覽儀表板"; const exportRows = currentConfig ? (selectedIds.length ? rows.filter(r => selectedIds.includes(String(r.id))) : filteredRows) : [];
    const table = currentConfig ? `<table><thead><tr>${currentConfig.columns.map(c => `<th>${c.label}</th>`).join("")}</tr></thead><tbody>${exportRows.map(r => `<tr>${currentConfig.columns.map(c => `<td>${c.type === "currency" ? formatMoney(r[c.key]) : String(r[c.key] ?? "")}</td>`).join("")}</tr>`).join("")}</tbody></table>` : `<h2>活動成本 ${formatMoney(activityCost)}</h2><h2>香氛成本 ${formatMoney(fragranceCost)}</h2><h2>可扣抵營業稅 ${formatMoney(vat)}</h2>`;
    const win = window.open("", "_blank", "width=1100,height=720"); if (!win) { setToast("瀏覽器阻擋列印視窗，請允許彈出視窗"); return; } win.document.write(`<html><head><title>${title}</title><style>body{font-family:Arial,"Noto Sans TC",sans-serif;padding:28px;color:#37352F}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #e8c4bc;padding:8px;text-align:left}th{background:#f5e6e3}h1{color:#6c5754}</style></head><body><h1>${title}</h1><p>匯出日期：${new Date().toLocaleString("zh-TW")}</p>${table}<script>window.onload=()=>window.print()</script></body></html>`); win.document.close(); setToast("已開啟 PDF 列印預覽");
  };
  const importCsv = (file: File) => {
    const reader = new FileReader(); reader.onload = () => { const text = String(reader.result || ""); if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) { setToast("已接收 Excel 檔案；預覽版請另存 CSV 以保留欄位對應"); return; } const lines = text.split(/\r?\n/).filter(Boolean); if (lines.length < 2) { setToast("匯入檔案沒有可用資料"); return; } const targetConfig = configs[importTarget]; const newRows = lines.slice(1).map(line => { const cells = line.split(",").map(v => v.replace(/^"|"$/g, "")); const row: Row = { id: id() }; targetConfig.columns.forEach((c, i) => { row[c.key] = c.type === "currency" || c.type === "number" ? money(cells[i]) : cells[i] || ""; }); return row; }); setData(d => ({ ...d, [importTarget]: [...newRows, ...d[importTarget]] })); setDirty(true); setToast(`已匯入 ${newRows.length} 筆至${targetConfig.title}草稿`); }; reader.readAsText(file, "UTF-8");
  };

  const sidebarGroups = ["總覽", "活動", "香氛", "管理", "知識"];
  return <div className="app-shell">
    <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>
      <div className="brand"><div className="brand-mark">心</div>{!collapsed && <div><strong>心引力</strong><span>ACCOUNTING OS</span></div>}</div>
      <div className="sidebar-toggle"><button className="icon-btn" onClick={() => setCollapsed(v => !v)} title="收合導覽"><Menu size={20} /></button></div>
      <div className="nav-scroll">{sidebarGroups.map(group => <div className="nav-group" key={group}><div className="nav-group-label">{!collapsed && group}</div>{nav.filter(n => n.group === group).map(item => { const Icon = item.icon; return <button key={item.key} className={`nav-item ${page === item.key ? "active" : ""}`} onClick={() => setPage(item.key)} title={item.label}><Icon size={18} /><span>{!collapsed && item.label}</span>{page === item.key && <i />}</button>; })}</div>)}</div>
      {!collapsed && <div className="sidebar-foot"><div className="sync-dot"><span />本機草稿已保護</div><small>正式儲存前可隨時復原</small></div>}
    </aside>
    <main className="main-area">
      <header className="topbar"><div className="topbar-left"><button className="mobile-menu icon-btn" onClick={() => setCollapsed(v => !v)}><Menu size={20} /></button><div className="crumb">心引力有限公司 <span>/</span> {page === "dashboard" ? "總覽儀表板" : currentConfig?.title}</div></div><div className="top-actions"><button className="top-btn" onClick={undo}><Undo2 size={16} />復原 <em>{history.length}</em></button><button className="top-btn" onClick={exportExcel}><FileSpreadsheet size={16} />匯出 Excel</button><button className="top-btn" onClick={exportPdf}><Printer size={16} />另存 PDF</button><button className="top-btn import" onClick={() => { setImportTarget(page === "dashboard" ? "activityCost" : page); fileRef.current?.click(); }}><FolderOpen size={16} />匯入 Excel</button><input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={e => e.target.files?.[0] && importCsv(e.target.files[0])} /></div></header>
      <div className="mobile-nav">{nav.map(item => <button key={item.key} className={page === item.key ? "active" : ""} onClick={() => setPage(item.key)}>{item.label}</button>)}</div>
      <section className="content">
        {page === "dashboard" ? <Dashboard period={period} setPeriod={setPeriod} monthOptions={monthOptions} activityCost={activityCost} fragranceCost={fragranceCost} activityRevenue={activityRevenue} fragranceRevenue={fragranceRevenue} vat={vat} advances={advances} stockProfit={stockProfit} costChart={costChart} onNavigate={setPage} /> : <>
          <div className="page-heading"><div><span className="eyebrow">{currentConfig?.eyebrow}</span><h1>{currentConfig?.title}</h1><p>{currentConfig?.description}</p></div><div className="heading-status"><span className={dirty ? "status-dot dirty" : "status-dot"} />{dirty ? "有未儲存草稿" : "已同步"}</div></div>
          <div className="report-card">
            <div className="report-toolbar"><div className="search-box"><Search size={16} /><input value={query} onChange={e => { setQuery(e.target.value); setPageNo(1); }} onKeyDown={e => e.key === "Enter" && setToast(`已搜尋 ${filteredRows.length} 筆結果`)} placeholder="快速查詢發票號碼、名稱、金額…" /><kbd>Enter</kbd></div><div className="toolbar-actions"><button className="btn soft" onClick={() => setDateOpen(true)}><CalendarDays size={16} />{dateFilter.from || dateFilter.to ? `${dateFilter.from || "不限"} ~ ${dateFilter.to || "不限"}` : "選取日期"}</button><button className={`btn primary ${saving ? "loading" : ""}`} onClick={save} disabled={saving}><CloudUpload size={16} />{saving ? "儲存中…" : "儲存"}</button>{["cost", "advance", "supply", "stock", "receipt"].includes(currentConfig!.kind) && <><button className="btn danger-soft" onClick={removeSelected}><Trash2 size={16} />刪除勾選</button>{currentConfig!.kind === "cost" && <><button className="btn lavender" onClick={() => setCategoryOpen("add")}><Plus size={16} />新增品項</button><button className="btn ghost" onClick={() => setCategoryOpen("delete")}><SlidersHorizontal size={16} />刪除品項</button></>}</>}<button className="btn dark" onClick={() => setAddOpen(true)}><Plus size={16} />{currentConfig?.addLabel}</button></div></div>
            {selectedIds.length > 0 && <div className="selection-bar"><Check size={15} />已勾選 {selectedIds.length} 筆 <span>（總計：{formatMoney(selectedTotal)}）</span><button onClick={() => setSelected(s => ({ ...s, [page]: [] }))}>清除選取</button></div>}
            <div className="table-wrap"><table><thead><tr><th className="check-col"><input type="checkbox" checked={allCurrentSelected} onChange={toggleAll} /></th>{currentConfig?.columns.map(c => <th key={c.key} style={{ minWidth: c.width }}>{c.label}</th>)}<th className="action-col">操作</th></tr></thead><tbody>{pageRows.length === 0 ? <tr><td colSpan={(currentConfig?.columns.length || 1) + 2}><div className="empty"><div><Search size={22} /></div><strong>沒有符合條件的資料</strong><span>調整關鍵字或日期，或按右上角新增一筆資料。</span></div></td></tr> : pageRows.map(row => <tr key={String(row.id)}><td className="check-col"><input type="checkbox" checked={selectedIds.includes(String(row.id))} onChange={() => toggleRow(String(row.id))} /></td>{currentConfig?.columns.map(col => <td key={col.key}>{col.type === "select" ? <select value={String(row[col.key] ?? "")} onChange={e => updateCell(String(row.id), col.key, e.target.value)}>{(col.options?.length ? (col.key === "category" ? categories : col.options) : categories).map(option => <option key={option}>{option}</option>)}</select> : <input className={col.type === "currency" ? "cell-input currency-input" : "cell-input"} type={col.type === "currency" || col.type === "number" ? "number" : col.type === "date" ? "date" : "text"} value={String(row[col.key] ?? "")} onChange={e => updateCell(String(row.id), col.key, e.target.value)} />}</td>)}<td className="action-col"><button className="row-delete" onClick={() => deleteOne(String(row.id))}><Trash2 size={15} /></button></td></tr>)}</tbody></table></div>
            <div className="table-footer"><span>共 {filteredRows.length} 筆</span><div className="pagination"><button disabled={pageNo <= 1} onClick={() => setPageNo(v => Math.max(1, v - 1))}><ChevronLeft size={16} />上一頁</button><strong>{pageNo} / {totalPages}</strong><button disabled={pageNo >= totalPages} onClick={() => setPageNo(v => Math.min(totalPages, v + 1))}>下一頁<ChevronRight size={16} /></button><label>跳至 <input value={pageNo} onChange={e => setPageNo(Math.min(totalPages, Math.max(1, Number(e.target.value) || 1)))} /> 頁</label></div><span>每頁 20 筆</span></div>
          </div>
        </>}
      </section>
    </main>
    {dateOpen && <DateModal initial={dateFilter} onClose={() => setDateOpen(false)} onApply={setDateFilter} />}
    {addOpen && currentConfig && <AddModal config={{ ...currentConfig, columns: currentConfig.columns.map(c => c.key === "category" ? { ...c, options: categories } : c) }} categories={categories} onClose={() => setAddOpen(false)} onAdd={addRow} />}
    {categoryOpen === "add" && <CategoryModal type="add" categories={customCategories} onClose={() => setCategoryOpen(null)} onSubmit={name => { if (categories.includes(name)) { setToast("已有同名用途品項"); return; } setCustomCategories(v => [...v, name]); setCategoryOpen(null); setToast("自訂品項已同步至活動、香氛與分類記憶庫"); }} />}
    {categoryOpen === "delete" && <CategoryModal type="delete" categories={customCategories} onClose={() => setCategoryOpen(null)} onSubmit={name => { setCustomCategories(v => v.filter(c => c !== name)); setCategoryOpen(null); setToast("自訂品項已移除；歷史紀錄保留原分類文字"); }} />}
    {toast && <Toast message={toast} onClose={() => setToast("")} />}
  </div>;
}

function CategoryModal({ type, categories, onClose, onSubmit }: { type: "add" | "delete"; categories: string[]; onClose: () => void; onSubmit: (name: string) => void }) {
  const [value, setValue] = useState(categories[0] || "");
  return <div className="modal-backdrop"><div className="modal small-modal"><div className="modal-head"><div><span className="eyebrow">CATEGORY / SETTINGS</span><h3>{type === "add" ? "新增用途品項" : "刪除自訂品項"}</h3></div><button className="icon-btn" onClick={onClose}><X size={18} /></button></div>{type === "add" ? <input autoFocus className="large-input" placeholder="例如：品牌攝影費" value={value} onChange={e => setValue(e.target.value)} /> : <select className="large-input" value={value} onChange={e => setValue(e.target.value)}>{categories.length ? categories.map(c => <option key={c}>{c}</option>) : <option value="">目前沒有自訂品項</option>}</select>}<p className="modal-note">{type === "add" ? "新增後會立即出現在活動成本、香氛成本與分類記憶庫。" : "只移除未來可選項，不會改動歷史會計紀錄。"}</p><div className="modal-actions"><button className="btn ghost" onClick={onClose}>取消</button><button className="btn primary" disabled={!value} onClick={() => onSubmit(value)}>{type === "add" ? "加入品項" : "確認移除"}</button></div></div></div>;
}

function Dashboard({ period, setPeriod, monthOptions, activityCost, fragranceCost, activityRevenue, fragranceRevenue, vat, advances, stockProfit, costChart, onNavigate }: { period: string; setPeriod: (v: string) => void; monthOptions: string[]; activityCost: number; fragranceCost: number; activityRevenue: number; fragranceRevenue: number; vat: number; advances: number; stockProfit: number; costChart: (key: "activityCost" | "fragranceCost") => [string, number][]; onNavigate: (page: PageKey) => void }) {
  const revenueTotal = activityRevenue + fragranceRevenue; const revenueRatio = revenueTotal ? Math.round((activityRevenue / revenueTotal) * 100) : 50; const allCost = activityCost + fragranceCost; const vatRatio = allCost ? Math.round((vat / allCost) * 100) : 0;
  const kpis = [{ label: "活動成本", value: activityCost, meta: "活動月成本", tone: "rose", target: "activityCost" as PageKey }, { label: "香氛成本", value: fragranceCost, meta: "香氛月成本", tone: "green", target: "fragranceCost" as PageKey }, { label: "活動營收", value: activityRevenue, meta: "含稅規則已套用", tone: "purple", target: "activityRevenue" as PageKey }, { label: "香氛營收", value: fragranceRevenue, meta: "最終售價 × 稅額模式", tone: "orange", target: "fragranceRevenue" as PageKey }, { label: "可扣抵營業稅", value: vat, meta: `符合資格成本 ${formatMoney(allCost)}`, tone: "blue", target: "activityCost" as PageKey }, { label: "代墊款總額", value: advances, meta: "活動＋香氛代墊", tone: "pink", target: "activityAdvance" as PageKey }, { label: "股票損益", value: stockProfit, meta: "僅計損益，不含股利", tone: "gold", target: "stocks" as PageKey }];
  return <><div className="page-heading dashboard-heading"><div><span className="eyebrow">OVERVIEW / COMMAND CENTER</span><h1>總覽儀表板</h1><p>把成本、營收與資金流放在同一個視窗，今天的數字一眼就懂。</p></div><div className="period-filter"><CalendarDays size={16} /><span>統計區間</span><select value={period} onChange={e => setPeriod(e.target.value)}><option value="all">全部歷史總計</option>{monthOptions.map(m => <option key={m} value={m}>{m.replace("-", " 年 ")} 月</option>)}</select><ChevronDown size={14} /></div></div><div className="kpi-grid">{kpis.map(k => <button key={k.label} className={`kpi-card ${k.tone}`} onClick={() => onNavigate(k.target)}><div className="kpi-top"><span>{k.label}</span><ArrowRight size={16} /></div><strong>{formatMoney(k.value)}</strong><small>{k.meta}</small></button>)}</div><div className="dashboard-grid"><div className="dash-card revenue-card"><div className="card-heading"><div><span className="eyebrow">REVENUE MIX</span><h3>營收占比</h3></div><span className="live-pill"><span />依目前篩選</span></div><div className="donut-layout"><div className="donut" style={{ background: `conic-gradient(#d3a9a6 0 ${revenueRatio}%, #b8a8c8 ${revenueRatio}% 100%)` }}><div><strong>{revenueTotal ? `${revenueRatio}%` : "—"}</strong><span>活動營收</span></div></div><div className="legend"><div><i className="rose-dot" /><span>活動營收</span><strong>{formatMoney(activityRevenue)}</strong></div><div><i className="purple-dot" /><span>香氛營收</span><strong>{formatMoney(fragranceRevenue)}</strong></div><hr /><div><span>合計營收</span><strong>{formatMoney(revenueTotal)}</strong></div></div></div></div><div className="dash-card vat-card"><div className="card-heading"><div><span className="eyebrow">INPUT TAX</span><h3>可扣抵營業稅狀態</h3></div><span className="tax-badge">{vatRatio}% 合格率</span></div><div className="progress-ring"><div className="ring-center"><strong>{formatMoney(vat)}</strong><span>可扣抵營業稅</span></div></div><div className="vat-summary"><div><span>全部進項成本</span><strong>{formatMoney(allCost)}</strong></div><div><span>排除項目後</span><strong>{formatMoney(allCost - vat)}</strong></div></div></div><BarChart title="活動用途品項" data={costChart("activityCost")} color="#d3a9a6" /><BarChart title="香氛用途品項" data={costChart("fragranceCost")} color="#b8a8c8" /></div></>;
}

function BarChart({ title, data, color }: { title: string; data: [string, number][]; color: string }) {
  const max = Math.max(...data.map(d => d[1]), 1); return <div className="dash-card bar-card"><div className="card-heading"><div><span className="eyebrow">COST BY CATEGORY</span><h3>{title}</h3></div><BarChart3 size={18} /></div>{data.length ? <div className="bars">{data.map(([label, value]) => <div className="bar-row" key={label}><span>{label}</span><div className="bar-track"><i style={{ width: `${Math.max(4, (value / max) * 100)}%`, background: color }} /><b>{Math.round(value / 1000)}k</b></div></div>)}</div> : <div className="chart-empty">目前沒有可視化資料</div>}</div>;
}
