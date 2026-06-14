import { describe, expect, it } from "vitest";
import { calculatePriceChangePercent } from "./price-change";

describe("price change helpers", () => {
  it("calculates signed percent change from a previous price", () => {
    expect(calculatePriceChangePercent(110, 100)).toBe(10);
    expect(calculatePriceChangePercent(95, 100)).toBe(-5);
  });

  it("returns null for missing or invalid previous prices", () => {
    expect(calculatePriceChangePercent(100, 0)).toBeNull();
    expect(calculatePriceChangePercent(Number.NaN, 100)).toBeNull();
    expect(calculatePriceChangePercent(100, Number.NaN)).toBeNull();
  });
});
