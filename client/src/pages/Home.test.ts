import { describe, expect, it } from "vitest";
import { canonicalDate, classifyCostRow, deletedIdsStillPresent, findMemoryMatch, formatMoney, mergeDraftRows, money, monthKey, sumReportAmount, parseDiscount, revenueValue, seedData, shouldUseLegacyMigration, stockProfitValue } from "./Home";

describe("accounting data helpers", () => {
  it("parses NT dollar strings with commas and whitespace", () => {
    expect(money(" NT$ 1,234 ")).toBe(1234);
    expect(money("$ 98.5")).toBe(98.5);
    expect(money(undefined)).toBe(0);
  });

  it("sums only the selected report amount field", () => {
    expect(sumReportAmount([{ id: "a", amount: "NT$ 1,200" }, { id: "b", amount: 350 }, { id: "c", amount: "" }] as any, "amount")).toBe(1550);
    expect(sumReportAmount([{ id: "a", price: 12000 }, { id: "b", price: "3,000" }] as any, "price")).toBe(15000);
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

  it("keeps Excel dates on the displayed calendar day without UTC month shifts", () => { expect(canonicalDate("2026-09-01 00:00:00")).toBe("2026-09-01"); expect(canonicalDate("2026-09-05 14:35:27")).toBe("2026-09-05"); expect(canonicalDate("2026年9月1日")).toBe("2026-09-01"); expect(canonicalDate("115/09/01")).toBe("2026-09-01"); });
  it("classifies vendor names by exact or longest contained memory name", () => { const memory = [{ id: "a", sellerName: "全家", category: "其他營業雜支" }, { id: "b", sellerName: "全家便利商店", category: "國內交通費" }] as any; const row = { id: "r", vendor: "全家便利商店股份有限公司新竹縣第一三二分公司", category: "" } as any; expect(findMemoryMatch(memory, row)).toBe(1); expect(classifyCostRow(row, memory).category).toBe("國內交通費"); });
  it("uses a manually entered fragrance discounted price and preserves gift text", () => {
    const manual = { id: "fragrance-1", discountedPrice: 24000, preTaxAmount: 24000, inclusiveAmount: 25200, taxMode: "含稅", gift: "香氛小樣" } as any;
    expect(revenueValue(manual)).toBe(25200);
    expect(manual.gift).toBe("香氛小樣");
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
