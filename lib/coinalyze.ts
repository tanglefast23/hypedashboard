const COINALYZE_BASE_URL = "https://api.coinalyze.net/v1";
const MARKET_CACHE_MS = 6 * 60 * 60 * 1000;
const LIQUIDATION_WINDOW_SECONDS = 60 * 60;
const MAX_SYMBOLS = 20;

let cachedHypeSymbols: { expiresAt: number; symbols: string[] } | null = null;

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

export async function getCoinalyzeOiChangePercent(): Promise<number | null> {
  const apiKey = process.env.COINALYZE_API_KEY;
  if (!apiKey) return null;
  const symbols = await getHypeSymbols(apiKey);
  if (!symbols.length) return null;
  const now = Math.floor(Date.now() / 1000);
  const histories = await getCoinalyze<OpenInterestHistory[]>("/open-interest-history", apiKey, {
    convert_to_usd: "true",
    from: String(now - 24 * 60 * 60),
    interval: "1hour",
    symbols: symbols.slice(0, MAX_SYMBOLS).join(","),
    to: String(now),
  });
  return weightedOpenInterestChange(histories);
}

export async function getCoinalyzeLiquidationImbalance(): Promise<LiquidationImbalance | null> {
  const apiKey = process.env.COINALYZE_API_KEY;
  if (!apiKey) return null;
  const symbols = await getHypeSymbols(apiKey);
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
  const total = totals.longLiquidationsUsd + totals.shortLiquidationsUsd;
  return total ? { ...totals, imbalanceUsd: totals.longLiquidationsUsd - totals.shortLiquidationsUsd, score: ((totals.longLiquidationsUsd - totals.shortLiquidationsUsd) / total) * 100, sourceCount: histories.length } : null;
}

async function getHypeSymbols(apiKey: string): Promise<string[]> {
  if (cachedHypeSymbols && cachedHypeSymbols.expiresAt > Date.now()) return cachedHypeSymbols.symbols;
  const markets = await getCoinalyze<FutureMarket[]>("/future-markets", apiKey, {});
  const symbols = markets.filter(isHypePerpMarket).sort(compareMarkets).map((market) => market.symbol).filter(isString).slice(0, MAX_SYMBOLS);
  cachedHypeSymbols = { expiresAt: Date.now() + MARKET_CACHE_MS, symbols };
  return symbols;
}

function isHypePerpMarket(market: FutureMarket): boolean {
  return market.base_asset === "HYPE" && market.is_perpetual === true && market.margined === "STABLE" && market.quote_asset === "USDT" && typeof market.symbol === "string";
}

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

async function getCoinalyze<T>(path: string, apiKey: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${COINALYZE_BASE_URL}${path}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url, { headers: { api_key: apiKey, accept: "application/json" } });
  if (!response.ok) throw new Error(`Coinalyze ${path} failed: ${response.status}`);
  return response.json() as Promise<T>;
}

function isString(value: unknown): value is string { return typeof value === "string" && value.length > 0; }
