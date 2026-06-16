import { describe, expect, it } from "vitest";
import { calculateTwapPressure, dedupeTwapRows, normalizeTwapRows } from "./twap";

const now = 1_000_000;

describe("live TWAP analytics", () => {
  it("keeps only active HYPE TWAP rows and normalizes table fields", () => {
    const rows = normalizeTwapRows([
      rawTwap({ asset: 159, buy: true, minutes: 60, size: "100", time: now - 30 * 60_000 }),
      rawTwap({ asset: 1, buy: true, minutes: 60, size: "100", time: now - 30 * 60_000 }),
      rawTwap({ asset: 10107, buy: false, minutes: 5, size: "10", time: now - 10 * 60_000 }),
    ], { hypeMarketIds: [159, 10107], hypePrice: 60, now });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ side: "BUY", token: "HYPE-USD", value: 6000, remainingMs: 30 * 60_000 });
  });

  it("calculates signed HYPE buy pressure for future windows", () => {
    const rows = normalizeTwapRows([
      rawTwap({ asset: 159, buy: true, minutes: 60, size: "100", time: now }),
      rawTwap({ asset: 10107, buy: false, minutes: 120, size: "100", time: now }),
    ], { hypeMarketIds: [159, 10107], hypePrice: 60, now });

    expect(calculateTwapPressure(rows, 60 * 60_000, now)).toBe(3000);
    expect(calculateTwapPressure(rows, 24 * 60 * 60_000, now)).toBe(0);
  });
  it("de-dupes the same wallet TWAP when public feed labels a perp as -USD and wallet history uses the bare coin", () => {
    const rows = dedupeTwapRows([
      normalizedTwap({ hash: "user-twap-1", token: "NEAR", value: 120_000 }),
      normalizedTwap({ hash: "public-hash", token: "NEAR-USD", value: 150_000 }),
      normalizedTwap({ hash: "different-start", startTime: now + 1, token: "NEAR-USD", value: 10_000 }),
    ]);

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.hash)).toEqual(["user-twap-1", "different-start"]);
  });
});

function normalizedTwap(overrides: Partial<{ hash: string; side: "BUY" | "SELL"; startTime: number; token: string; user: string; value: number }> = {}) {
  return {
    amount: 1,
    asset: 74,
    durationMs: 30 * 60_000,
    endTime: now + 30 * 60_000,
    hash: "hash",
    progress: 0,
    remainingMs: 30 * 60_000,
    side: "BUY" as const,
    startTime: now,
    token: "NEAR",
    user: "0x89c0fee4b7ca37711219092cd1c0d2b4f7af87c1",
    value: 1,
    ...overrides,
  };
}

function rawTwap({ asset, buy, minutes, size, time }: { asset: number; buy: boolean; minutes: number; size: string; time: number }) {
  return {
    time,
    user: "0x1234567890abcdef1234567890abcdef12345678",
    hash: `${asset}-${buy}-${time}`,
    action: { type: "twapOrder", twap: { a: asset, b: buy, s: size, r: false, m: minutes, t: false } },
    error: null,
  };
}
