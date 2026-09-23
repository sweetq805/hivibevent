import { describe, expect, it } from "vitest";
import { formatMoney, money, parseDiscount, seedData } from "./Home";

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

  it("accepts manual discount formats and converts them to a ratio", () => {
    expect(parseDiscount("8折")).toBe(0.8);
    expect(parseDiscount("80%")).toBe(0.8);
    expect(parseDiscount("0.8")).toBe(0.8);
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
});
