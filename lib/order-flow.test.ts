import { describe, expect, it } from "vitest";
import { buildDailyVolumeBars, buildHourlyVolumeBars, buildLimitFillFlow, buildMarketFlow, buildWeeklyVolumeBars, HEADER_TIMEFRAMES, normalizeL2Book } from "./order-flow";

const now = 1_000_000;

describe("order flow helpers", () => {
  it("normalizes top 15 limit buys and sells from an l2 book", () => {
    const levels = Array.from({ length: 20 }, (_, i) => ({ px: String(100 + i), sz: String(i + 1), n: i + 2 }));
    const book = normalizeL2Book({ levels: [levels, levels] }, 60);

    expect(book.buys).toHaveLength(15);
    expect(book.sells).toHaveLength(15);
    expect(book.buys[0]).toMatchObject({ price: 100, size: 1, value: 100, orders: 2 });
  });

  it("builds market buy and sell rows for the selected time window sorted by value", () => {
    const trades = [
      { side: "B", px: "10", sz: "2", time: now - 60_000, tid: 1 },
      { side: "A", px: "20", sz: "3", time: now - 2 * 60_000, tid: 2 },
      { side: "B", px: "30", sz: "4", time: now - 10 * 60_000, tid: 3 },
      { side: "B", px: "5", sz: "9", time: now - 3 * 60_000, tid: 4 },
    ];

    const flow = buildMarketFlow(trades, 5 * 60_000, now);
    expect(flow.buys).toEqual([
      { price: 5, size: 9, time: now - 3 * 60_000, value: 45 },
      { price: 10, size: 2, time: now - 60_000, value: 20 },
    ]);
    expect(flow.sells).toEqual([{ price: 20, size: 3, time: now - 2 * 60_000, value: 60 }]);
  });

  it("limits each trade side to the top 50 values", () => {
    const trades = Array.from({ length: 60 }, (_, i) => ({ side: "B" as const, px: String(i + 1), sz: "1", time: now - 60_000, tid: i }));
    const flow = buildMarketFlow(trades, 5 * 60_000, now);

    expect(flow.buys).toHaveLength(50);
    expect(flow.buys[0].value).toBe(60);
    expect(flow.buys[49].value).toBe(11);
  });

  it("builds filled limit buy and sell rows from the maker side of trades", () => {
    const trades = [
      { side: "B", px: "10", sz: "2", time: now - 60_000, tid: 1 },
      { side: "A", px: "20", sz: "3", time: now - 2 * 60_000, tid: 2 },
    ];

    const flow = buildLimitFillFlow(trades, 5 * 60_000, now);
    expect(flow.buys).toEqual([{ price: 20, size: 3, time: now - 2 * 60_000, value: 60 }]);
    expect(flow.sells).toEqual([{ price: 10, size: 2, time: now - 60_000, value: 20 }]);
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

  it("creates 30 daily volume bars with month label on the first day", () => {
    const start = Date.UTC(2026, 1, 27) / 1000;
    const candles = Array.from({ length: 30 }, (_, i) => ({ close: 10, time: start + i * 86_400, volume: i + 1 }));
    const bars = buildDailyVolumeBars(candles);

    expect(bars).toHaveLength(30);
    expect(bars[0]).toMatchObject({ label: "27", volume: 1, volumeUsd: 10 });
    expect(bars[2].label).toBe("Mar 1");
    expect(bars[29].volumeUsd).toBe(300);
  });

  it("creates 7 weekly volume bars with weekday labels", () => {
    const start = Date.UTC(2026, 5, 8) / 1000;
    const candles = Array.from({ length: 7 }, (_, i) => ({ close: 10, time: start + i * 86_400, volume: i + 1 }));
    const bars = buildWeeklyVolumeBars(candles);

    expect(bars).toHaveLength(7);
    expect(bars.map((bar) => bar.label)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    expect(bars[6].volumeUsd).toBe(70);
  });
});
