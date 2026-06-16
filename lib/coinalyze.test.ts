import { describe, expect, it } from "vitest";

import { liquidationImbalanceScore } from "./coinalyze";

describe("liquidationImbalanceScore", () => {
  it("keeps ordinary million-dollar imbalances away from binary extremes", () => {
    expect(Math.round(liquidationImbalanceScore(-1_111_431))).toBe(-22);
    expect(Math.round(liquidationImbalanceScore(1_111_431))).toBe(22);
  });

  it("stays near zero for small liquidation imbalances", () => {
    expect(Math.round(liquidationImbalanceScore(50_000))).toBe(1);
    expect(Math.round(liquidationImbalanceScore(-50_000))).toBe(-1);
  });

  it("clips only genuinely large one-hour imbalances", () => {
    expect(liquidationImbalanceScore(5_000_000)).toBe(100);
    expect(liquidationImbalanceScore(-5_000_000)).toBe(-100);
    expect(liquidationImbalanceScore(7_500_000)).toBe(100);
  });
});
