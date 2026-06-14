import { z } from "zod";
import { getChartRange } from "./chart-ranges";
import { buildTwapPressure, normalizeTwapRows } from "./twap";
import type { Candle, DashboardData, EcosystemProtocol, PerpMarket } from "./types";

const HYPERLIQUID_INFO_URL = "https://api.hyperliquid.xyz/info";
const COINGECKO_URL = "https://api.coingecko.com/api/v3/coins/hyperliquid?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false";
const DEFILLAMA_CHAINS_URL = "https://api.llama.fi/v2/chains";
const DEFILLAMA_PROTOCOLS_URL = "https://api.llama.fi/protocols";
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
  const response = await fetch(HYPERLIQUID_INFO_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Hyperliquid API failed: ${response.status}`);
  return response.json();
}

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`Fetch failed ${response.status}: ${url}`);
  return response.json();
}

async function getHypeMarket(): Promise<DashboardData["hype"]> {
  return cached("hype-market", 30_000, async () => {
    const mids = z.record(z.string()).parse(await postHyperliquid({ type: "allMids" }));
    const gecko = z.object({ market_data: z.record(z.unknown()) }).parse(await getJson(COINGECKO_URL));
    const market = gecko.market_data;
    const price = toNumber(mids.HYPE) ?? nestedUsd(market.current_price) ?? 0;
    return {
      price,
      change24h: toNumber(market.price_change_percentage_24h),
      marketCap: nestedUsd(market.market_cap),
      fdv: nestedUsd(market.fully_diluted_valuation),
      volume24h: nestedUsd(market.total_volume),
    };
  });
}

function nestedUsd(value: unknown): number | null {
  if (!value || typeof value !== "object" || !("usd" in value)) return null;
  return toNumber(value.usd);
}

export async function getCandles(rangeId = "1d"): Promise<Candle[]> {
  const range = getChartRange(rangeId);
  return cached(`hype-candles-${range.id}`, 15_000, async () => {
    const endTime = Date.now();
    const startTime = endTime - range.durationMs;
    const raw = await postHyperliquid({
      type: "candleSnapshot",
      req: { coin: "HYPE", interval: range.interval, startTime, endTime },
    });
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

function isCandle(candle: Candle | null): candle is Candle {
  return candle !== null;
}

async function getHypeTwaps(hypePrice: number): Promise<DashboardData["twaps"]> {
  return cached("hype-twaps", 10_000, async () => {
    const [rawRows, hypeMarketIds] = await Promise.all([getJson(HYPURRSCAN_TWAPS_URL), getHypeMarketIds()]);
    const now = Date.now();
    const rows = normalizeTwapRows(z.array(z.unknown()).parse(rawRows), { hypeMarketIds, hypePrice, now });
    return { pressure: buildTwapPressure(rows, now), rows: rows.slice(0, 15) };
  });
}

async function getHypeMarketIds(): Promise<number[]> {
  return cached("hype-market-ids", 1_800_000, async () => {
    const [rawMeta, rawSpotMeta] = await Promise.all([
      postHyperliquid({ type: "meta" }),
      postHyperliquid({ type: "spotMeta" }),
    ]);
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

function isNumber(value: number | null): value is number {
  return value !== null;
}

async function getPerps(): Promise<PerpMarket[]> {
  return cached("perps", 30_000, async () => {
    const raw = z.tuple([z.object({ universe: z.array(z.record(z.unknown())) }), z.array(z.record(z.unknown()))])
      .parse(await postHyperliquid({ type: "metaAndAssetCtxs" }));
    return raw[0].universe.map((market, index) => parsePerp(market, raw[1][index])).filter(isPerpMarket)
      .sort((a, b) => b.volume24h - a.volume24h).slice(0, 10);
  });
}

function parsePerp(meta: Record<string, unknown>, ctx: Record<string, unknown> | undefined): PerpMarket | null {
  if (!ctx || typeof meta.name !== "string") return null;
  const markPrice = toNumber(ctx.markPx);
  const openInterest = toNumber(ctx.openInterest);
  const volume24h = toNumber(ctx.dayNtlVlm);
  const fundingRate = toNumber(ctx.funding);
  if (markPrice === null || openInterest === null || volume24h === null || fundingRate === null) return null;
  return { name: meta.name, markPrice, openInterest, volume24h, fundingRate: fundingRate * 100 };
}

function isPerpMarket(market: PerpMarket | null): market is PerpMarket {
  return market !== null;
}

async function getEcosystem(): Promise<DashboardData["ecosystem"]> {
  return cached("ecosystem", 300_000, async () => {
    const [chains, protocols] = await Promise.all([getJson(DEFILLAMA_CHAINS_URL), getJson(DEFILLAMA_PROTOCOLS_URL)]);
    const chainTvl = parseChainTvl(chains);
    return { chainTvl, protocols: parseProtocols(protocols) };
  });
}

function parseChainTvl(raw: unknown): number | null {
  const chains = z.array(z.record(z.unknown())).parse(raw);
  const chain = chains.find((item) => item.name === "Hyperliquid L1");
  return chain ? toNumber(chain.tvl) : null;
}

function parseProtocols(raw: unknown): EcosystemProtocol[] {
  const protocols = z.array(z.record(z.unknown())).parse(raw);
  return protocols.filter(isHyperliquidProtocol).map((item) => ({
    name: String(item.name ?? "Unknown"),
    tvl: toNumber(item.tvl) ?? 0,
    change1d: toNumber(item.change_1d),
  })).sort((a, b) => b.tvl - a.tvl).slice(0, 6);
}

function isHyperliquidProtocol(item: Record<string, unknown>): boolean {
  const chains = Array.isArray(item.chains) ? item.chains.map(String) : [];
  return chains.some((chain) => chain.toLowerCase().includes("hyperliquid"));
}

export async function getDashboardData(): Promise<DashboardData> {
  const hype = await getHypeMarket();
  const [candles, perps, ecosystem, twaps] = await Promise.all([
    getCandles(), getPerps(), getEcosystem(), getHypeTwaps(hype.price),
  ]);
  return { generatedAt: new Date().toISOString(), hype, candles, perps, ecosystem, twaps };
}
