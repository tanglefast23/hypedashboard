import { z } from "zod";
import { buildHourlyVolumeBars, buildMarketFlow, FLOW_TIMEFRAMES, HEADER_TIMEFRAMES, normalizeL2Book, PERFORMANCE_TIMEFRAMES } from "./order-flow";
import type { HeaderTimeframeId, TimeframeId } from "./order-flow";
import { calculatePriceChangePercent } from "./price-change";
import { buildTwapPressure, normalizeTwapRows } from "./twap";
import type { Candle, DashboardData } from "./types";

const HYPERLIQUID_INFO_URLS = ["https://api.hyperliquid.xyz/info", "https://api-ui.hyperliquid.xyz/info"];
const COINGECKO_URL = "https://api.coingecko.com/api/v3/coins/hyperliquid?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false";
const HYPURRSCAN_TWAPS_URL = "https://api.hypurrscan.io/twap/*";

type CacheEntry = { expiresAt: number; value: unknown };
const cache = new Map<string, CacheEntry>();

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function cached<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  const entry = cache.get(key);
  if (entry && entry.expiresAt > Date.now()) return entry.value as T;
  const value = await loader();
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

async function postHyperliquid(body: Record<string, unknown>): Promise<unknown> {
  let lastError: unknown = null;
  for (const url of HYPERLIQUID_INFO_URLS) {
    try {
      const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (response.ok) return response.json();
      lastError = new Error(`Hyperliquid API failed: ${response.status}`);
    } catch (error) { lastError = error; }
  }
  throw lastError instanceof Error ? lastError : new Error("Hyperliquid API failed");
}

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`Fetch failed ${response.status}: ${url}`);
  return response.json();
}

async function getHypeMarket(priceCandles: Candle[], headerCandles: Candle[]): Promise<DashboardData["hype"]> {
  return cached("hype-market", 30_000, async () => {
    const [midsRaw, geckoRaw] = await Promise.all([postHyperliquid({ type: "allMids" }), getJson(COINGECKO_URL)]);
    const mids = z.record(z.string()).parse(midsRaw);
    const gecko = z.object({ market_data: z.record(z.unknown()) }).parse(geckoRaw);
    const market = gecko.market_data;
    const price = toNumber(mids.HYPE) ?? nestedUsd(market.current_price) ?? 0;
    return {
      price,
      headerChanges: getHeaderChanges(price, headerCandles),
      changes: getPriceChanges(price, priceCandles),
      volumes: getVolumes(priceCandles, price),
      marketCap: nestedUsd(market.market_cap),
      fdv: nestedUsd(market.fully_diluted_valuation),
      volume24h: nestedUsd(market.total_volume),
    } as DashboardData["hype"];
  });
}

function nestedUsd(value: unknown): number | null {
  if (!value || typeof value !== "object" || !("usd" in value)) return null;
  return toNumber(value.usd);
}

function getHeaderChanges(currentPrice: number, candles: Candle[]): Record<HeaderTimeframeId, number | null> {
  return Object.fromEntries(HEADER_TIMEFRAMES.map((frame) => [frame.id, changeSince(currentPrice, candles, frame.durationMs)])) as Record<HeaderTimeframeId, number | null>;
}

function getPriceChanges(currentPrice: number, candles: Candle[]): Record<TimeframeId, number | null> {
  return Object.fromEntries(PERFORMANCE_TIMEFRAMES.map((frame) => [frame.id, changeSince(currentPrice, candles, frame.durationMs)])) as Record<TimeframeId, number | null>;
}

function getVolumes(candles: Candle[], currentPrice: number): Record<TimeframeId, number | null> {
  const now = Date.now() / 1000;
  return Object.fromEntries(PERFORMANCE_TIMEFRAMES.map((frame) => {
    const volume = candles.filter((candle) => now - candle.time <= frame.durationMs / 1000).reduce((sum, candle) => sum + candle.volume, 0);
    return [frame.id, volume * currentPrice];
  })) as Record<TimeframeId, number | null>;
}

function changeSince(currentPrice: number, candles: Candle[], lookbackMs: number): number | null {
  const targetSeconds = (Date.now() - lookbackMs) / 1000;
  const previous = [...candles].reverse().find((candle) => candle.time <= targetSeconds) ?? candles[0];
  return previous ? calculatePriceChangePercent(currentPrice, previous.close) : null;
}

async function getHypeCandles24h(): Promise<Candle[]> {
  return cached("hype-candles-24h-1m", 30_000, async () => {
    const endTime = Date.now();
    const startTime = endTime - 24 * 60 * 60 * 1000;
    const raw = await postHyperliquid({ type: "candleSnapshot", req: { coin: "HYPE", interval: "1m", startTime, endTime } });
    return z.array(z.record(z.unknown())).parse(raw).map(parseCandle).filter(isCandle);
  });
}

async function getHypeCandles7d(): Promise<Candle[]> {
  return cached("hype-candles-7d-1h", 300_000, async () => {
    const endTime = Date.now();
    const startTime = endTime - 7 * 24 * 60 * 60 * 1000;
    const raw = await postHyperliquid({ type: "candleSnapshot", req: { coin: "HYPE", interval: "1h", startTime, endTime } });
    return z.array(z.record(z.unknown())).parse(raw).map(parseCandle).filter(isCandle);
  });
}

function parseCandle(row: Record<string, unknown>): Candle | null {
  const time = toNumber(row.t);
  const open = toNumber(row.o);
  const high = toNumber(row.h);
  const low = toNumber(row.l);
  const close = toNumber(row.c);
  const volume = toNumber(row.v);
  if (time === null || open === null || high === null || low === null || close === null || volume === null) return null;
  return { time: time / 1000, open, high, low, close, volume };
}

function isCandle(candle: Candle | null): candle is Candle { return candle !== null; }

async function getHypeTwaps(hypePrice: number): Promise<DashboardData["twaps"]> {
  return cached("hype-twaps", 30_000, async () => {
    const [rawRows, hypeMarketIds] = await Promise.all([getJson(HYPURRSCAN_TWAPS_URL), getHypeMarketIds()]);
    const now = Date.now();
    const rows = normalizeTwapRows(z.array(z.unknown()).parse(rawRows), { hypeMarketIds, hypePrice, now });
    return { pressure: buildTwapPressure(rows, now), rows: rows.slice(0, 15) };
  });
}

async function getHypeMarketIds(): Promise<number[]> {
  return cached("hype-market-ids", 1_800_000, async () => {
    const [rawMeta, rawSpotMeta] = await Promise.all([postHyperliquid({ type: "meta" }), postHyperliquid({ type: "spotMeta" })]);
    const meta = z.object({ universe: z.array(z.record(z.unknown())) }).parse(rawMeta);
    const spotMeta = z.object({ universe: z.array(z.record(z.unknown())), tokens: z.array(z.record(z.unknown())) }).parse(rawSpotMeta);
    const hypeTokenIds = spotMeta.tokens.filter((token) => token.name === "HYPE").map((token) => toNumber(token.index)).filter(isNumber);
    const perpIds = meta.universe.map((market, index) => market.name === "HYPE" ? index : null).filter(isNumber);
    const spotIds = spotMeta.universe.filter((market) => isHypeSpotMarket(market, hypeTokenIds)).map((market) => 10000 + (toNumber(market.index) ?? 0));
    return [...new Set([...perpIds, ...spotIds])];
  });
}

function isHypeSpotMarket(market: Record<string, unknown>, hypeTokenIds: number[]): boolean {
  const tokens = Array.isArray(market.tokens) ? market.tokens.map(toNumber).filter(isNumber) : [];
  return hypeTokenIds.some((id) => tokens.includes(id));
}

function isNumber(value: number | null): value is number { return value !== null; }

async function getOrderFlow(price: number, candles: Candle[]): Promise<DashboardData["orderFlow"]> {
  return cached("order-flow-v2", 30_000, async () => {
    const [perpBook, perpTrades, spotBook, spotTrades] = await Promise.all([
      getVenueOrderFlow("HYPE", price),
      postHyperliquid({ type: "recentTrades", coin: "HYPE" }),
      getVenueOrderFlow("@107", price),
      postHyperliquid({ type: "recentTrades", coin: "@107" }),
    ]);
    return {
      hourlyVolume: buildHourlyVolumeBars(candles, price),
      perps: buildVenueFlow(perpBook, z.array(z.unknown()).parse(perpTrades)),
      spot: buildVenueFlow(spotBook, z.array(z.unknown()).parse(spotTrades)),
    };
  });
}

async function getVenueOrderFlow(coin: "HYPE" | "@107", price: number) {
  const bookRaw = await postHyperliquid({ type: "l2Book", coin });
  return normalizeL2Book(bookRaw, price);
}

function buildVenueFlow(book: ReturnType<typeof normalizeL2Book>, trades: unknown[]) {
  const now = Date.now();
  return {
    limitBook: Object.fromEntries(FLOW_TIMEFRAMES.map((frame) => [frame.id, book])) as DashboardData["orderFlow"]["perps"]["limitBook"],
    marketTrades: Object.fromEntries(FLOW_TIMEFRAMES.map((frame) => [frame.id, buildMarketFlow(trades, frame.durationMs, now)])) as DashboardData["orderFlow"]["perps"]["marketTrades"],
  };
}

export async function getDashboardData(): Promise<DashboardData> {
  const [candles, weeklyCandles] = await Promise.all([getHypeCandles24h(), getHypeCandles7d()]);
  const hype = await getHypeMarket(candles, weeklyCandles);
  const [twaps, orderFlow] = await Promise.all([getHypeTwaps(hype.price), getOrderFlow(hype.price, candles)]);
  return { generatedAt: new Date().toISOString(), hype, twaps, orderFlow };
}
