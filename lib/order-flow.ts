export type TimeframeId = "5m" | "15m" | "30m" | "1h" | "4h" | "12h" | "1d";
export type HeaderTimeframeId = "30m" | "1h" | "1d" | "1w";
export type FlowTimeframeId = "5m" | "15m" | "30m" | "1h" | "4h" | "1d";

export type LimitOrderLevel = {
  orders: number;
  price: number;
  size: number;
  value: number;
};

export type MarketTrade = {
  price: number;
  size: number;
  time: number;
  value: number;
};

export type HourlyVolumeBar = {
  label: string;
  volume: number;
  volumeUsd: number;
};

export const PERFORMANCE_TIMEFRAMES: { id: TimeframeId; label: string; durationMs: number }[] = [
  { id: "5m", label: "5M", durationMs: 5 * 60_000 },
  { id: "15m", label: "15M", durationMs: 15 * 60_000 },
  { id: "30m", label: "30M", durationMs: 30 * 60_000 },
  { id: "1h", label: "1H", durationMs: 60 * 60_000 },
  { id: "4h", label: "4H", durationMs: 4 * 60 * 60_000 },
  { id: "12h", label: "12H", durationMs: 12 * 60 * 60_000 },
  { id: "1d", label: "1D", durationMs: 24 * 60 * 60_000 },
];

export const FLOW_TIMEFRAMES = PERFORMANCE_TIMEFRAMES.filter((item) => item.id !== "12h") as { id: FlowTimeframeId; label: string; durationMs: number }[];

export const HEADER_TIMEFRAMES: { id: HeaderTimeframeId; label: string; durationMs: number }[] = [
  { id: "30m", label: "30M", durationMs: 30 * 60_000 },
  { id: "1h", label: "1H", durationMs: 60 * 60_000 },
  { id: "1d", label: "1D", durationMs: 24 * 60 * 60_000 },
  { id: "1w", label: "1W", durationMs: 7 * 24 * 60 * 60_000 },
];

export function normalizeL2Book(raw: unknown, fallbackPrice: number): { buys: LimitOrderLevel[]; sells: LimitOrderLevel[] } {
  const levels = readLevels(raw);
  return { buys: levels[0].slice(0, 15).map((level) => parseLevel(level, fallbackPrice)), sells: levels[1].slice(0, 15).map((level) => parseLevel(level, fallbackPrice)) };
}

export function buildMarketFlow(rawTrades: unknown[], windowMs: number, now: number): { buys: MarketTrade[]; sells: MarketTrade[] } {
  const trades = rawTrades.map(parseTrade).filter(isMarketTrade).filter((trade) => now - trade.time <= windowMs);
  return {
    buys: trades.filter((trade) => trade.side === "B").map(stripSide).slice(0, 15),
    sells: trades.filter((trade) => trade.side === "A").map(stripSide).slice(0, 15),
  };
}

export function buildHourlyVolumeBars(candles: { time: number; volume: number }[], price: number): HourlyVolumeBar[] {
  if (candles.length === 0) return [];
  const latestHourMs = Math.floor(candles[candles.length - 1].time * 1000 / 3_600_000) * 3_600_000;
  return Array.from({ length: 24 }, (_, index) => {
    const hourMs = latestHourMs - (23 - index) * 3_600_000;
    const nextHourMs = hourMs + 3_600_000;
    const volume = candles.filter((candle) => candle.time * 1000 >= hourMs && candle.time * 1000 < nextHourMs).reduce((sum, candle) => sum + candle.volume, 0);
    return { label: new Date(hourMs).getHours().toString().padStart(2, "0"), volume, volumeUsd: volume * price };
  });
}

function readLevels(raw: unknown): [unknown[], unknown[]] {
  if (!raw || typeof raw !== "object" || !("levels" in raw) || !Array.isArray(raw.levels)) return [[], []];
  const [bids, asks] = raw.levels;
  return [Array.isArray(bids) ? bids : [], Array.isArray(asks) ? asks : []];
}

function parseLevel(level: unknown, fallbackPrice: number): LimitOrderLevel {
  if (!level || typeof level !== "object") return { orders: 0, price: fallbackPrice, size: 0, value: 0 };
  const price = toNumber("px" in level ? level.px : null) ?? fallbackPrice;
  const size = toNumber("sz" in level ? level.sz : null) ?? 0;
  const orders = toNumber("n" in level ? level.n : null) ?? 0;
  return { orders, price, size, value: price * size };
}

function parseTrade(trade: unknown): (MarketTrade & { side: "A" | "B" }) | null {
  if (!trade || typeof trade !== "object") return null;
  const price = toNumber("px" in trade ? trade.px : null);
  const size = toNumber("sz" in trade ? trade.sz : null);
  const time = toNumber("time" in trade ? trade.time : null);
  const side = "side" in trade && (trade.side === "A" || trade.side === "B") ? trade.side : null;
  if (price === null || size === null || time === null || side === null) return null;
  return { price, size, time, side, value: price * size };
}

function stripSide(trade: MarketTrade & { side: "A" | "B" }): MarketTrade {
  return { price: trade.price, size: trade.size, time: trade.time, value: trade.value };
}

function isMarketTrade(trade: (MarketTrade & { side: "A" | "B" }) | null): trade is MarketTrade & { side: "A" | "B" } {
  return trade !== null;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
