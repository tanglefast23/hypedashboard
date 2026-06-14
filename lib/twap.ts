import { z } from "zod";

export type HypeTwap = {
  amount: number;
  asset: number;
  durationMs: number;
  endTime: number;
  hash: string;
  progress: number;
  remainingMs: number;
  side: "BUY" | "SELL";
  startTime: number;
  token: "HYPE" | "HYPE-USD";
  user: string;
  value: number;
};

export type TwapPressure = {
  next1h: number;
  next24h: number;
};

const twapRowSchema = z.object({
  time: z.number(),
  user: z.string(),
  hash: z.string(),
  ended: z.unknown().optional(),
  error: z.unknown().nullable().optional(),
  action: z.object({
    twap: z.object({
      a: z.number(),
      b: z.boolean(),
      s: z.string(),
      m: z.number(),
    }),
  }),
});

export function normalizeTwapRows(rawRows: unknown[], options: { hypeMarketIds: number[]; hypePrice: number; now: number }): HypeTwap[] {
  return rawRows.map((row) => parseTwapRow(row, options)).filter(isHypeTwap).sort((a, b) => b.value - a.value);
}

export function calculateTwapPressure(rows: HypeTwap[], windowMs: number, now: number): number {
  return rows.reduce((total, row) => total + calculateRowPressure(row, windowMs, now), 0);
}

export function buildTwapPressure(rows: HypeTwap[], now: number): TwapPressure {
  return {
    next1h: calculateTwapPressure(rows, 60 * 60 * 1000, now),
    next24h: calculateTwapPressure(rows, 24 * 60 * 60 * 1000, now),
  };
}

function parseTwapRow(raw: unknown, options: { hypeMarketIds: number[]; hypePrice: number; now: number }): HypeTwap | null {
  const parsed = twapRowSchema.safeParse(raw);
  if (!parsed.success || parsed.data.ended || parsed.data.error) return null;
  const twap = parsed.data.action.twap;
  if (!options.hypeMarketIds.includes(twap.a)) return null;
  const amount = Number(twap.s);
  if (!Number.isFinite(amount)) return null;
  const durationMs = twap.m * 60 * 1000;
  const endTime = parsed.data.time + durationMs;
  if (endTime <= options.now) return null;
  return {
    amount,
    asset: twap.a,
    durationMs,
    endTime,
    hash: parsed.data.hash,
    progress: Math.min(1, Math.max(0, (options.now - parsed.data.time) / durationMs)),
    remainingMs: Math.max(0, endTime - options.now),
    side: twap.b ? "BUY" : "SELL",
    startTime: parsed.data.time,
    token: twap.a >= 10000 ? "HYPE" : "HYPE-USD",
    user: parsed.data.user,
    value: amount * options.hypePrice,
  };
}

function calculateRowPressure(row: HypeTwap, windowMs: number, now: number): number {
  const overlapEnd = Math.min(row.endTime, now + windowMs);
  const overlapMs = Math.max(0, overlapEnd - now);
  const pressure = (row.value / row.durationMs) * overlapMs;
  return row.side === "BUY" ? pressure : -pressure;
}

function isHypeTwap(row: HypeTwap | null): row is HypeTwap {
  return row !== null;
}
