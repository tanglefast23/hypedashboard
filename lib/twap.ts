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
  token: string;
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

const userTwapHistorySchema = z.object({
  time: z.number(),
  state: z.object({
    coin: z.string(),
    user: z.string(),
    side: z.enum(["A", "B"]),
    sz: z.string(),
    executedSz: z.string(),
    minutes: z.number(),
    timestamp: z.number(),
  }),
  status: z.object({ status: z.string() }),
  twapId: z.number(),
});

const userTwapSliceFillSchema = z.object({
  twapId: z.number(),
  fill: z.object({
    coin: z.string(),
    sz: z.string(),
  }),
});

export function normalizeTwapRows(rawRows: unknown[], options: { hypeMarketIds: number[]; hypePrice: number; now: number }): HypeTwap[] {
  const assetMap = Object.fromEntries(options.hypeMarketIds.map((id) => [id, { token: id >= 10000 ? "HYPE" : "HYPE-USD", price: options.hypePrice }]));
  return normalizeAssetTwapRows(rawRows, { assetMap, now: options.now });
}

export function normalizeAssetTwapRows(rawRows: unknown[], options: { assetMap: Record<number, { token: string; price: number }>; now: number }): HypeTwap[] {
  return rawRows.map((row) => parseTwapRow(row, options)).filter(isHypeTwap).sort((a, b) => b.value - a.value);
}

export function aggregateUserTwapExecutedSizes(rawRows: unknown[], coin: string): Record<number, number> {
  return rawRows.reduce<Record<number, number>>((totals, raw) => {
    const parsed = userTwapSliceFillSchema.safeParse(raw);
    if (!parsed.success || parsed.data.fill.coin !== coin) return totals;
    const size = Number(parsed.data.fill.sz);
    if (!Number.isFinite(size)) return totals;
    totals[parsed.data.twapId] = (totals[parsed.data.twapId] ?? 0) + size;
    return totals;
  }, {});
}

export function normalizeUserTwapHistory(rawRows: unknown[], options: { coin: string; displayCoin?: string; executedSizeById?: Record<number, number>; now: number; price: number }): HypeTwap[] {
  const latest = new Map<number, z.infer<typeof userTwapHistorySchema>>();
  for (const raw of rawRows) {
    const parsed = userTwapHistorySchema.safeParse(raw);
    if (!parsed.success || parsed.data.state.coin !== options.coin) continue;
    const current = latest.get(parsed.data.twapId);
    if (!current || parsed.data.time >= current.time) latest.set(parsed.data.twapId, parsed.data);
  }
  return [...latest.values()].map((row) => parseUserTwap(row, options)).filter(isHypeTwap).sort((a, b) => b.value - a.value);
}

export function dedupeTwapRows<T extends { hash: string; side: string; startTime: number; token: string; user: string; value: number }>(rows: T[]): T[] {
  const byOrder = new Map<string, T>();
  for (const row of rows) {
    // Wallet TWAP history labels perps as the bare coin (e.g. NEAR), while
    // HypurrScan's public active feed labels the same order as NEAR-USD.
    // Treat those as one order so a user's own active TWAP is not double-counted.
    const canonicalToken = row.token.replace(/-USD$/, "");
    const key = `${row.user.toLowerCase()}-${canonicalToken}-${row.side}-${row.startTime}`;
    if (!byOrder.has(key)) byOrder.set(key, row);
  }
  return [...byOrder.values()].sort((a, b) => b.value - a.value);
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

function parseTwapRow(raw: unknown, options: { assetMap: Record<number, { token: string; price: number }>; now: number }): HypeTwap | null {
  const parsed = twapRowSchema.safeParse(raw);
  if (!parsed.success || parsed.data.ended || parsed.data.error) return null;
  const twap = parsed.data.action.twap;
  const asset = options.assetMap[twap.a];
  if (!asset) return null;
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
    token: asset.token,
    user: parsed.data.user,
    value: amount * asset.price,
  };
}

function parseUserTwap(row: z.infer<typeof userTwapHistorySchema>, options: { coin: string; displayCoin?: string; executedSizeById?: Record<number, number>; now: number; price: number }): HypeTwap | null {
  if (row.status.status !== "activated") return null;
  const totalAmount = Number(row.state.sz);
  const historyExecutedAmount = Number(row.state.executedSz);
  const executedAmount = Math.max(Number.isFinite(historyExecutedAmount) ? historyExecutedAmount : 0, options.executedSizeById?.[row.twapId] ?? 0);
  if (!Number.isFinite(totalAmount) || !Number.isFinite(executedAmount)) return null;
  const amount = Math.max(0, totalAmount - executedAmount);
  const durationMs = row.state.minutes * 60 * 1000;
  const endTime = row.state.timestamp + durationMs;
  if (amount <= 0 || durationMs <= 0 || endTime <= options.now) return null;
  return {
    amount,
    asset: -1,
    durationMs,
    endTime,
    hash: `user-twap-${row.twapId}`,
    progress: Math.min(1, Math.max(0, (options.now - row.state.timestamp) / durationMs)),
    remainingMs: Math.max(0, endTime - options.now),
    side: row.state.side === "B" ? "BUY" : "SELL",
    startTime: row.state.timestamp,
    token: options.displayCoin ?? options.coin,
    user: row.state.user,
    value: amount * options.price,
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
