import { describe, expect, it } from "vitest";
import { calculateTwapPressure, normalizeTwapRows } from "./twap";

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
});

function rawTwap({ asset, buy, minutes, size, time }: { asset: number; buy: boolean; minutes: number; size: string; time: number }) {
  return {
    time,
    user: "0x1234567890abcdef1234567890abcdef12345678",
    hash: `${asset}-${buy}-${time}`,
    action: { type: "twapOrder", twap: { a: asset, b: buy, s: size, r: false, m: minutes, t: false } },
    error: null,
  };
}
