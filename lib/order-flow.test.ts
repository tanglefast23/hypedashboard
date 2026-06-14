import { describe, expect, it } from "vitest";
import { buildHourlyVolumeBars, buildMarketFlow, HEADER_TIMEFRAMES, normalizeL2Book } from "./order-flow";

const now = 1_000_000;

describe("order flow helpers", () => {
  it("normalizes top 15 limit buys and sells from an l2 book", () => {
    const levels = Array.from({ length: 20 }, (_, i) => ({ px: String(100 + i), sz: String(i + 1), n: i + 2 }));
    const book = normalizeL2Book({ levels: [levels, levels] }, 60);

    expect(book.buys).toHaveLength(15);
    expect(book.sells).toHaveLength(15);
    expect(book.buys[0]).toMatchObject({ price: 100, size: 1, value: 100, orders: 2 });
  });

  it("builds market buy and sell rows for the selected time window", () => {
    const trades = [
      { side: "B", px: "10", sz: "2", time: now - 60_000, tid: 1 },
      { side: "A", px: "20", sz: "3", time: now - 2 * 60_000, tid: 2 },
      { side: "B", px: "30", sz: "4", time: now - 10 * 60_000, tid: 3 },
    ];

    const flow = buildMarketFlow(trades, 5 * 60_000, now);
    expect(flow.buys).toEqual([{ price: 10, size: 2, time: now - 60_000, value: 20 }]);
    expect(flow.sells).toEqual([{ price: 20, size: 3, time: now - 2 * 60_000, value: 60 }]);
  });

  it("defines compact header changes for 30m, 1h, 1d, and 1w", () => {
    expect(HEADER_TIMEFRAMES.map((frame) => frame.id)).toEqual(["30m", "1h", "1d", "1w"]);
  });

  it("creates 24 hourly volume bars from candles", () => {
    const candles = Array.from({ length: 24 }, (_, i) => ({ time: now / 1000 + i * 3600, volume: i + 1 }));
    const bars = buildHourlyVolumeBars(candles, 10);

    expect(bars).toHaveLength(24);
    expect(bars[0]).toMatchObject({ volume: 1, volumeUsd: 10 });
    expect(bars[23].volumeUsd).toBe(240);
  });
});
