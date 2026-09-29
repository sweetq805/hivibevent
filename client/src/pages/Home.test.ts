import { describe, expect, it } from "vitest";
import { canonicalDate, deletedIdsStillPresent, formatMoney, mergeDraftRows, money, monthKey, parseDiscount, revenueValue, seedData, shouldUseLegacyMigration, stockProfitValue, findImportHeaderIndex } from "./Home";

describe("accounting data helpers", () => {
  it("parses NT dollar strings with commas and whitespace", () => {
    expect(money(" NT$ 1,234 ")).toBe(1234);
    expect(money("$ 98.5")).toBe(98.5);
    expect(money(undefined)).toBe(0);
  });

  it("formats dashboard and table amounts as rounded NT dollars", () => {
    expect(formatMoney("NT$ 12,345.6")).toBe("NT$ 12,346");
    expect(formatMoney(0)).toBe("NT$ 0");
  });

  it("parses one and two digit manual discount formats", () => {
    expect(parseDiscount("6折")).toBe(0.6);
    expect(parseDiscount("8折")).toBe(0.8);
    expect(parseDiscount("65折")).toBe(0.65);
    expect(parseDiscount("84折")).toBe(0.84);
    expect(parseDiscount("80%")).toBe(0.8);
    expect(parseDiscount("0.84")).toBe(0.84);
  });

  it("normalizes slash, ISO, and Excel-like dates to one month key", () => {
    expect(canonicalDate("2026/08/21")).toBe("2026-08-21");
    expect(monthKey("2026/08/21")).toBe("2026-08");
    expect(monthKey("2026-08-03")).toBe("2026-08");
  });

  it("uses each revenue row's selected tax mode for dashboard totals", () => {
    expect(revenueValue({ id: "1", preTaxAmount: 1000, inclusiveAmount: 1050, taxMode: "未稅" })).toBe(1000);
    expect(revenueValue({ id: "2", preTaxAmount: 1000, inclusiveAmount: 1050, taxMode: "含稅" })).toBe(1050);
    expect(revenueValue({ id: "3", preTaxAmount: 1000, inclusiveAmount: 1050, taxMode: "tax-included" })).toBe(1050);
  });

  it("includes cash dividend in stock KPI profit", () => {
    expect(stockProfitValue({ id: "stock-1", realizedProfit: 1300, dividend: 360 })).toBe(1660);
    expect(stockProfitValue({ id: "stock-2", realizedProfit: 1300 })).toBe(1300);
  });

  it("maps cost import company names to seller name instead of seller tax id", () => {
    expect(findImportHeaderIndex(["日期", "買方統編", "賣方統編", "客戶名稱", "金額"], { key: "vendor", label: "賣方名稱", type: "text" } as any)).toBe(3);
    expect(findImportHeaderIndex(["賣方統編", "賣方名稱"], { key: "sellerTaxId", label: "賣方統編", type: "text" } as any)).toBe(0);
  });


  it("verifies single and multiple deleted ids are absent after D1 read-back", () => {
    const store = seedData();
    const entries = [{ page: "stocks", id: String(store.stocks[0].id) }, { page: "receipts", id: "already-gone" }] as const;
    expect(deletedIdsStillPresent(store, entries as any).map(entry => entry.id)).toEqual([String(store.stocks[0].id)]);
    const afterDelete = { ...store, stocks: store.stocks.slice(1) };
    expect(deletedIdsStillPresent(afterDelete, entries as any)).toEqual([]);
  });

  it("keeps unsaved drafts local while deleting only the latest D1 snapshot", () => {
    const remote = seedData();
    const draft = { ...remote, stocks: [{ ...remote.stocks[0], name: "尚未儲存修改" }, ...remote.stocks.slice(1), { id: "draft-stock", name: "草稿" }] };
    const displayed = mergeDraftRows({ ...remote, stocks: remote.stocks.slice(1) }, draft, [{ page: "stocks", id: String(remote.stocks[0].id) } as any]);
    expect(displayed.stocks.some(row => row.id === "draft-stock")).toBe(true);
    expect(displayed.stocks.some(row => String(row.id) === String(remote.stocks[0].id))).toBe(false);
  });

  it("does not re-import legacy local data after migration is completed", () => {
    expect(shouldUseLegacyMigration(false, 1, false)).toBe(true);
    expect(shouldUseLegacyMigration(false, 1, true)).toBe(false);
    expect(shouldUseLegacyMigration(false, 2, false)).toBe(false);
    expect(shouldUseLegacyMigration(true, 1, false)).toBe(false);
  });

  it("seeds every required report with unique stable ids", () => {
    const data = seedData();
    const keys = [
      "activityCost", "activityRevenue", "activityAdvance", "fragranceCost",
      "fragranceRevenue", "fragranceAdvance", "supplies", "stocks", "receipts",
      "memory",
    ] as const;
    const rows = keys.flatMap(key => data[key]);
    expect(rows.length).toBeGreaterThan(10);
    expect(new Set(rows.map(row => row.id)).size).toBe(rows.length);
    expect(data.activityCost[0]?.invoiceType).toBe("電子發票");
    expect(data.stocks[0]).toHaveProperty("realizedProfit");
  });

  it("keeps memory records without update dates and supplies with requested fields", () => {
    const data = seedData();
    expect(data.memory[0]).not.toHaveProperty("updatedAt");
    expect(data.supplies[0]).toMatchObject({ itemName: expect.any(String), size: expect.any(String), website: expect.any(String), price: expect.any(Number), checked: expect.any(String), toolboxNo: expect.any(String) });
  });
});
