import { describe, expect, it } from "vitest";
import { calculateTwapPlan } from "./twap";

describe("TWAP planner", () => {
  it("splits a TWAP into 30-second slices", () => {
    expect(calculateTwapPlan({ totalSize: 100, durationMinutes: 30, price: 60 })).toEqual({
      durationMinutes: 30,
      estimatedNotional: 6000,
      maxSlippagePercent: 3,
      sliceCount: 60,
      sliceIntervalSeconds: 30,
      sliceNotional: 100,
      sliceSize: 1.6666666666666667,
      totalSize: 100,
    });
  });

  it("clamps duration to Hyperliquid's 1 to 1440 minute range", () => {
    expect(calculateTwapPlan({ totalSize: 10, durationMinutes: 0, price: 50 }).durationMinutes).toBe(1);
    expect(calculateTwapPlan({ totalSize: 10, durationMinutes: 2000, price: 50 }).durationMinutes).toBe(1440);
  });
});
