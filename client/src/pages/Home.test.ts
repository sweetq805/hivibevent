import { describe, expect, it } from "vitest";
import { formatMoney, money, parseDiscount, revenueValue, seedData } from "./Home";

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

  it("uses each revenue row's selected tax mode for dashboard totals", () => {
    expect(revenueValue({ id: "1", preTaxAmount: 1000, inclusiveAmount: 1050, taxMode: "未稅" })).toBe(1000);
    expect(revenueValue({ id: "2", preTaxAmount: 1000, inclusiveAmount: 1050, taxMode: "含稅" })).toBe(1050);
    expect(revenueValue({ id: "3", preTaxAmount: 1000, inclusiveAmount: 1050, taxMode: "tax-included" })).toBe(1050);
  });

  it("seeds every required report with unique stable ids", () => {
    const data = seedData();
    const keys = [
      "activityCost", "activityRevenue", "activityAdvance", "fragranceCost",
      "fragranceRevenue", "fragranceAdvance", "supplies", "stocks", "receipts",
      "laws", "memory",
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
