const COINALYZE_BASE_URL = "https://api.coinalyze.net/v1";
const MARKET_CACHE_MS = 6 * 60 * 60 * 1000;
const LIQUIDATION_WINDOW_SECONDS = 60 * 60;
const FULL_LIQUIDATION_IMBALANCE_USD = 5_000_000;
const MAX_SYMBOLS = 20;

const cachedSymbols = new Map<string, { expiresAt: number; symbols: string[] }>();
const cachedLiquidation = new Map<string, { expiresAt: number; value: LiquidationImbalance | null }>();
const cachedOiChange = new Map<string, { expiresAt: number; value: number | null }>();

type FutureMarket = {
  base_asset?: string;
  exchange?: string;
  is_perpetual?: boolean;
  margined?: string;
  quote_asset?: string;
  symbol?: string;
};

type LiquidationPoint = { l?: number; s?: number; t?: number };
type LiquidationHistory = { history?: LiquidationPoint[]; symbol?: string };
type OpenInterestPoint = { c?: number; h?: number; l?: number; o?: number; t?: number };
type OpenInterestHistory = { history?: OpenInterestPoint[]; symbol?: string };

export type LiquidationImbalance = {
  longLiquidationsUsd: number;
  shortLiquidationsUsd: number;
  imbalanceUsd: number;
  score: number;
  sourceCount: number;
};

export async function getCoinalyzeOiChangePercent(baseAsset = "HYPE"): Promise<number | null> {
  const cacheKey = normalizeBaseAsset(baseAsset);
  const cached = cachedOiChange.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const apiKey = process.env.COINALYZE_API_KEY;
  if (!apiKey) return null;
  const symbols = await getPerpSymbols(apiKey, cacheKey);
  if (!symbols.length) return null;
  const now = Math.floor(Date.now() / 1000);
  const histories = await getCoinalyze<OpenInterestHistory[]>("/open-interest-history", apiKey, {
    convert_to_usd: "true",
    from: String(now - 24 * 60 * 60),
    interval: "1hour",
    symbols: symbols.slice(0, MAX_SYMBOLS).join(","),
    to: String(now),
  });
  const value = weightedOpenInterestChange(histories);
  cachedOiChange.set(cacheKey, { expiresAt: Date.now() + 60 * 1000, value });
  return value;
}

export async function getCoinalyzeLiquidationImbalance(baseAsset = "HYPE"): Promise<LiquidationImbalance | null> {
  const cacheKey = normalizeBaseAsset(baseAsset);
  const cached = cachedLiquidation.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const apiKey = process.env.COINALYZE_API_KEY;
  if (!apiKey) return null;
  const symbols = await getPerpSymbols(apiKey, cacheKey);
  if (!symbols.length) return null;
  const now = Math.floor(Date.now() / 1000);
  const histories = await getCoinalyze<LiquidationHistory[]>("/liquidation-history", apiKey, {
    convert_to_usd: "true",
    from: String(now - LIQUIDATION_WINDOW_SECONDS),
    interval: "5min",
    symbols: symbols.slice(0, MAX_SYMBOLS).join(","),
    to: String(now),
  });
  const totals = sumLiquidations(histories);
  const imbalanceUsd = totals.longLiquidationsUsd - totals.shortLiquidationsUsd;
  const total = totals.longLiquidationsUsd + totals.shortLiquidationsUsd;
  const value = total ? { ...totals, imbalanceUsd, score: liquidationImbalanceScore(imbalanceUsd), sourceCount: histories.length } : null;
  cachedLiquidation.set(cacheKey, { expiresAt: Date.now() + 60 * 1000, value });
  return value;
}

export function liquidationImbalanceScore(imbalanceUsd: number): number {
  return clampScore((imbalanceUsd / FULL_LIQUIDATION_IMBALANCE_USD) * 100);
}

async function getPerpSymbols(apiKey: string, baseAsset: string): Promise<string[]> {
  const cacheKey = normalizeBaseAsset(baseAsset);
  const cached = cachedSymbols.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.symbols;
  const markets = await getCoinalyze<FutureMarket[]>("/future-markets", apiKey, {});
  const symbols = markets.filter((market) => isPerpMarket(market, cacheKey)).sort(compareMarkets).map((market) => market.symbol).filter(isString).slice(0, MAX_SYMBOLS);
  cachedSymbols.set(cacheKey, { expiresAt: Date.now() + MARKET_CACHE_MS, symbols });
  return symbols;
}

function isPerpMarket(market: FutureMarket, baseAsset: string): boolean {
  return normalizeBaseAsset(market.base_asset ?? "") === baseAsset && market.is_perpetual === true && market.margined === "STABLE" && market.quote_asset === "USDT" && typeof market.symbol === "string";
}

function normalizeBaseAsset(baseAsset: string): string { return baseAsset.trim().toUpperCase(); }

function compareMarkets(a: FutureMarket, b: FutureMarket): number {
  return marketPriority(a.exchange) - marketPriority(b.exchange);
}

function marketPriority(exchange: string | undefined): number {
  const preferred = ["Hyperliquid", "Binance", "Bybit", "OKX", "Bitget", "MEXC", "Gate", "HTX"];
  const index = preferred.findIndex((name) => name.toLowerCase() === (exchange ?? "").toLowerCase());
  return index >= 0 ? index : preferred.length;
}

function sumLiquidations(histories: LiquidationHistory[]): Pick<LiquidationImbalance, "longLiquidationsUsd" | "shortLiquidationsUsd"> {
  return histories.reduce((totals, row) => {
    for (const point of row.history ?? []) {
      totals.longLiquidationsUsd += Number(point.l) || 0;
      totals.shortLiquidationsUsd += Number(point.s) || 0;
    }
    return totals;
  }, { longLiquidationsUsd: 0, shortLiquidationsUsd: 0 });
}

function weightedOpenInterestChange(histories: OpenInterestHistory[]): number | null {
  const changes = histories.flatMap((row) => {
    const points = row.history ?? [];
    const first = Number(points[0]?.o ?? points[0]?.c);
    const last = Number(points.at(-1)?.c ?? points.at(-1)?.o);
    if (!Number.isFinite(first) || !Number.isFinite(last) || first <= 0 || last <= 0) return [];
    return [{ change: ((last - first) / first) * 100, weight: first * oiSourceBoost(row.symbol) }];
  });
  const totalWeight = changes.reduce((sum, row) => sum + row.weight, 0);
  return totalWeight ? changes.reduce((sum, row) => sum + row.change * row.weight, 0) / totalWeight : null;
}

function oiSourceBoost(symbol: string | undefined): number {
  return symbol?.toUpperCase().includes("BINANCE") || symbol?.toUpperCase().endsWith(".A") ? 1.2 : 1;
}

function clampScore(value: number): number { return Math.max(-100, Math.min(100, value)); }

async function getCoinalyze<T>(path: string, apiKey: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${COINALYZE_BASE_URL}${path}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url, { headers: { api_key: apiKey, accept: "application/json" } });
  if (!response.ok) throw new Error(`Coinalyze ${path} failed: ${response.status}`);
  return response.json() as Promise<T>;
}

function isString(value: unknown): value is string { return typeof value === "string" && value.length > 0; }
