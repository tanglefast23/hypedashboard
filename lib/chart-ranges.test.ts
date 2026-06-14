import { describe, expect, it } from "vitest";
import { getChartRange, getChartRangeOptions } from "./chart-ranges";

describe("chart ranges", () => {
  it("returns the desktop-first range buttons Joe requested", () => {
    expect(getChartRangeOptions().map((option) => option.id)).toEqual(["30m", "1h", "4h", "1d", "7d", "30d"]);
  });

  it("maps short ranges to higher-resolution Hyperliquid candle intervals", () => {
    expect(getChartRange("30m")).toMatchObject({ interval: "1m", durationMs: 30 * 60 * 1000 });
    expect(getChartRange("1h")).toMatchObject({ interval: "1m", durationMs: 60 * 60 * 1000 });
    expect(getChartRange("1d")).toMatchObject({ interval: "15m", durationMs: 24 * 60 * 60 * 1000 });
  });

  it("falls back to the 1 day view for unknown range ids", () => {
    expect(getChartRange("bad-input")).toMatchObject({ id: "1d", interval: "15m" });
  });
});
