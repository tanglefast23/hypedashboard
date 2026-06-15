import { z } from "zod";
import { buildDailyVolumeBars, buildHourlyVolumeBars, buildLimitFillFlow, buildMarketFlow, buildWeeklyVolumeBars, FLOW_TIMEFRAMES, HEADER_TIMEFRAMES, PERFORMANCE_TIMEFRAMES } from "./order-flow";
import type { HeaderTimeframeId, TimeframeId } from "./order-flow";
import { getCrowdingData } from "./crowding";
import { calculatePriceChangePercent } from "./price-change";
import { collectHypeTrades, getStoredVenueFlows } from "./trade-history";
import { aggregateUserTwapExecutedSizes, buildTwapPressure, normalizeAssetTwapRows, normalizeTwapRows, normalizeUserTwapHistory } from "./twap";
import type { Candle, DashboardData, HoldingDashboardData } from "./types";

const HYPERLIQUID_INFO_URLS = ["https://api.hyperliquid.xyz/info", "https://api-ui.hyperliquid.xyz/info"];
const COINGECKO_URL = "https://api.coingecko.com/api/v3/coins/hyperliquid?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false";
const HYPURRSCAN_TWAPS_URL = "https://api.hypurrscan.io/twap/*";
const WATCHED_PERP_ADDRESS = "0x89c0fEe4b7CA37711219092CD1c0D2b4F7AF87c1";

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

async function getHypeCandles30d(): Promise<Candle[]> {
  return cached("hype-candles-30d-1d", 300_000, async () => {
    const endTime = Date.now();
    const startTime = endTime - 30 * 24 * 60 * 60 * 1000;
    const raw = await postHyperliquid({ type: "candleSnapshot", req: { coin: "HYPE", interval: "1d", startTime, endTime } });
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
    return { pressure: buildTwapPressure(rows, now), rows };
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

async function getAccountPerpWatch(): Promise<DashboardData["accountPerps"]> {
  return cached("account-perp-watch-v2", 30_000, async () => {
    const [coreState, xyzState, coreMeta, xyzMeta, coreMids, xyzMids, twapsRaw] = await Promise.all([
      postHyperliquid({ type: "clearinghouseState", user: WATCHED_PERP_ADDRESS }),
      postHyperliquid({ type: "clearinghouseState", user: WATCHED_PERP_ADDRESS, dex: "xyz" }),
      postHyperliquid({ type: "meta" }),
      postHyperliquid({ type: "meta", dex: "xyz" }),
      postHyperliquid({ type: "allMids" }),
      postHyperliquid({ type: "allMids", dex: "xyz" }),
      getJson(HYPURRSCAN_TWAPS_URL),
    ]);
    const positions = [...parseAccountPerpPositions(coreState, ""), ...parseAccountPerpPositions(xyzState, "xyz")];
    const assetMap = {
      ...buildPerpAssetMap(positions.filter((position) => position.dex === ""), parseUniverse(coreMeta), z.record(z.string()).parse(coreMids)),
      ...buildPerpAssetMap(positions.filter((position) => position.dex === "xyz"), parseUniverse(xyzMeta), z.record(z.string()).parse(xyzMids)),
    };
    const rows = normalizeAssetTwapRows(z.array(z.unknown()).parse(twapsRaw), { assetMap, now: Date.now() });
    return {
      address: WATCHED_PERP_ADDRESS,
      groups: positions.map((position) => ({ coin: position.coin, position, rows: rows.filter((row) => row.token === position.coin) })),
    };
  });
}

function parseUniverse(raw: unknown): Record<string, unknown>[] { return z.object({ universe: z.array(z.record(z.unknown())) }).parse(raw).universe; }

function parseAccountPerpPositions(raw: unknown, dex: string): DashboardData["accountPerps"]["groups"][number]["position"][] {
  const state = z.object({ assetPositions: z.array(z.record(z.unknown())) }).parse(raw);
  return state.assetPositions.map((row) => parseAccountPosition(row, dex)).filter(isAccountPosition);
}

function parseAccountPosition(row: Record<string, unknown>, dex: string): DashboardData["accountPerps"]["groups"][number]["position"] | null {
  const position = row.position;
  if (!position || typeof position !== "object") return null;
  const p = position as Record<string, unknown>;
  const coin = typeof p.coin === "string" ? p.coin : null;
  const size = toNumber(p.szi);
  const positionValue = toNumber(p.positionValue);
  if (!coin || size === null || size === 0 || positionValue === null) return null;
  return {
    coin,
    dex,
    displayCoin: coin.includes(":") ? coin.split(":").at(-1) ?? coin : coin,
    entryPx: toNumber(p.entryPx),
    liquidationPx: toNumber(p.liquidationPx),
    marginUsed: toNumber(p.marginUsed),
    positionValue,
    returnOnEquity: toNumber(p.returnOnEquity),
    side: size > 0 ? "LONG" : "SHORT",
    size: Math.abs(size),
    unrealizedPnl: toNumber(p.unrealizedPnl),
  };
}

function buildPerpAssetMap(positions: DashboardData["accountPerps"]["groups"][number]["position"][], universe: Record<string, unknown>[], mids: Record<string, string>) {
  return Object.fromEntries(positions.flatMap((position): [number, { token: string; price: number }][] => {
    const localAsset = universe.findIndex((market) => market.name === position.coin);
    const asset = position.dex ? 110000 + localAsset : localAsset;
    const price = toNumber(mids[position.coin]) ?? position.positionValue / Math.max(position.size, 1);
    return localAsset >= 0 && price ? [[asset, { token: position.coin, price }]] : [];
  }));
}

function isAccountPosition(position: DashboardData["accountPerps"]["groups"][number]["position"] | null): position is DashboardData["accountPerps"]["groups"][number]["position"] { return position !== null; }

function isHypeSpotMarket(market: Record<string, unknown>, hypeTokenIds: number[]): boolean {
  const tokens = Array.isArray(market.tokens) ? market.tokens.map(toNumber).filter(isNumber) : [];
  return hypeTokenIds.some((id) => tokens.includes(id));
}

function isNumber(value: number | null): value is number { return value !== null; }

async function getOrderFlow(price: number, candles: Candle[], monthlyCandles: Candle[]): Promise<DashboardData["orderFlow"]> {
  await collectHypeTrades().catch((error) => console.warn("Trade collection failed", error));
  const storedFlows = await getStoredVenueFlows().catch((error) => {
    console.warn("Supabase trade history unavailable", error);
    return null;
  });
  const fallbackFlows = storedFlows ?? await getRecentTradeFallbackFlows();
  return {
    hourlyVolume: buildHourlyVolumeBars(candles, price),
    weeklyVolume: buildWeeklyVolumeBars(monthlyCandles),
    dailyVolume: buildDailyVolumeBars(monthlyCandles),
    perps: fallbackFlows.perps,
    spot: fallbackFlows.spot,
  };
}

async function getRecentTradeFallbackFlows(): Promise<{ perps: DashboardData["orderFlow"]["perps"]; spot: DashboardData["orderFlow"]["spot"] }> {
  const [perpTrades, spotTrades] = await Promise.all([
    postHyperliquid({ type: "recentTrades", coin: "HYPE" }),
    postHyperliquid({ type: "recentTrades", coin: "@107" }),
  ]);
  return {
    perps: buildVenueFlow(z.array(z.unknown()).parse(perpTrades)),
    spot: buildVenueFlow(z.array(z.unknown()).parse(spotTrades)),
  };
}

function buildVenueFlow(trades: unknown[]) {
  const now = Date.now();
  return {
    marketTrades: Object.fromEntries(FLOW_TIMEFRAMES.map((frame) => [frame.id, buildMarketFlow(trades, frame.durationMs, now)])) as DashboardData["orderFlow"]["perps"]["marketTrades"],
    limitFills: Object.fromEntries(FLOW_TIMEFRAMES.map((frame) => [frame.id, buildLimitFillFlow(trades, frame.durationMs, now)])) as DashboardData["orderFlow"]["perps"]["limitFills"],
  };
}

function normalizePerpCoin(coin: string): string {
  const decoded = decodeURIComponent(coin);
  if (decoded.includes(":")) {
    const [dex, symbol] = decoded.split(":");
    return `${dex.toLowerCase()}:${symbol.toUpperCase()}`;
  }
  return decoded.toUpperCase();
}

function dexForCoin(coin: string): string | undefined { return coin.includes(":") ? coin.split(":")[0] : undefined; }

async function getHoldingTwaps(coin: string, price: number): Promise<HoldingDashboardData["twaps"]> {
  return cached(`holding-twaps-${coin}-v2`, 30_000, async () => {
    const [rawRowsResult, assetResult, userHistoryResult, userFillsResult] = await Promise.allSettled([
      getJson(HYPURRSCAN_TWAPS_URL),
      getPerpAssetIndex(coin),
      postHyperliquid({ type: "twapHistory", user: WATCHED_PERP_ADDRESS }),
      postHyperliquid({ type: "userTwapSliceFills", user: WATCHED_PERP_ADDRESS }),
    ]);
    const now = Date.now();
    const rawRows = rawRowsResult.status === "fulfilled" ? z.array(z.unknown()).parse(rawRowsResult.value) : [];
    const asset = assetResult.status === "fulfilled" ? assetResult.value : null;
    const userHistory = userHistoryResult.status === "fulfilled" ? z.array(z.unknown()).parse(userHistoryResult.value) : [];
    const userFills = userFillsResult.status === "fulfilled" ? z.array(z.unknown()).parse(userFillsResult.value) : [];
    const executedSizeById = aggregateUserTwapExecutedSizes(userFills, coin);
    const publicRows = asset === null ? [] : normalizeAssetTwapRows(rawRows, { assetMap: { [asset]: { token: coin, price } }, now });
    const userRows = normalizeUserTwapHistory(userHistory, { coin, executedSizeById, now, price });
    const rows = dedupeTwaps([...userRows, ...publicRows]);
    return { pressure: buildTwapPressure(rows, now), rows };
  });
}

async function getPerpAssetIndex(coin: string): Promise<number | null> {
  return cached(`perp-asset-${coin}-v2`, 1_800_000, async () => {
    const dex = dexForCoin(coin);
    const rawMeta = await postHyperliquid({ type: "meta", ...(dex ? { dex } : {}) });
    const localIndex = parseUniverse(rawMeta).findIndex((market) => market.name === coin);
    if (localIndex < 0) return null;
    return dex ? 110000 + localIndex : localIndex;
  });
}

async function getPerpCandles(coin: string, interval: string, durationMs: number): Promise<Candle[]> {
  return cached(`candles-${coin}-${interval}-${durationMs}`, interval === "1m" ? 30_000 : 300_000, async () => {
    const endTime = Date.now();
    const startTime = endTime - durationMs;
    const raw = await postHyperliquid({ type: "candleSnapshot", req: { coin, interval, startTime, endTime } });
    return z.array(z.record(z.unknown())).parse(raw).map(parseCandle).filter(isCandle);
  });
}

function dedupeTwaps<T extends { hash: string; side: string; startTime: number; token: string; user: string; value: number }>(rows: T[]): T[] {
  const byOrder = new Map<string, T>();
  for (const row of rows) {
    const key = `${row.user.toLowerCase()}-${row.token}-${row.side}-${row.startTime}`;
    if (!byOrder.has(key)) byOrder.set(key, row);
  }
  return [...byOrder.values()].sort((a, b) => b.value - a.value);
}

export async function getHoldingDashboardData(coin: string): Promise<HoldingDashboardData> {
  const cleanCoin = normalizePerpCoin(coin);
  const [candles, weeklyCandles, monthlyCandles, midsRaw, holdings] = await Promise.all([
    getPerpCandles(cleanCoin, "1m", 24 * 60 * 60 * 1000),
    getPerpCandles(cleanCoin, "1h", 7 * 24 * 60 * 60 * 1000),
    getPerpCandles(cleanCoin, "1d", 30 * 24 * 60 * 60 * 1000),
    postHyperliquid({ type: "allMids", ...(dexForCoin(cleanCoin) ? { dex: dexForCoin(cleanCoin) } : {}) }),
    getAccountPerpWatch(),
  ]);
  const mids = z.record(z.string()).parse(midsRaw);
  const price = toNumber(mids[cleanCoin]) ?? monthlyCandles.at(-1)?.close ?? 0;
  const twaps = await getHoldingTwaps(cleanCoin, price);
  return {
    generatedAt: new Date().toISOString(),
    asset: { coin: cleanCoin, price, headerChanges: getHeaderChanges(price, weeklyCandles), changes: getPriceChanges(price, candles), volumes: getVolumes(candles, price) },
    position: holdings.groups.find((group) => group.coin === cleanCoin)?.position ?? null,
    twaps,
    volume: { hourlyVolume: buildHourlyVolumeBars(candles, price), weeklyVolume: buildWeeklyVolumeBars(monthlyCandles), dailyVolume: buildDailyVolumeBars(monthlyCandles) },
    holdings,
  };
}

function calculateRsi(candles: Candle[], currentPrice: number, period = 14): number | null {
  const closes = [...candles.slice(-(period + 1)).map((candle) => candle.close), currentPrice].filter((value) => Number.isFinite(value) && value > 0);
  if (closes.length < period + 1) return null;
  const changes = closes.slice(1).map((close, index) => close - closes[index]);
  const recent = changes.slice(-period);
  const gains = recent.reduce((sum, change) => sum + Math.max(change, 0), 0) / period;
  const losses = recent.reduce((sum, change) => sum + Math.max(-change, 0), 0) / period;
  if (losses === 0) return gains === 0 ? 50 : 100;
  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

export async function getDashboardData(): Promise<DashboardData> {
  const [candles, weeklyCandles, monthlyCandles] = await Promise.all([getHypeCandles24h(), getHypeCandles7d(), getHypeCandles30d()]);
  const hype = await getHypeMarket(candles, weeklyCandles);
  const [twaps, orderFlow, accountPerps] = await Promise.all([getHypeTwaps(hype.price), getOrderFlow(hype.price, candles, monthlyCandles), getAccountPerpWatch()]);
  const crowding = await getCrowdingData({ hypePrice: hype.price, orderFlow, priceChange1d: hype.changes["1d"], rsi14: calculateRsi(weeklyCandles, hype.price), twaps });
  return { generatedAt: new Date().toISOString(), hype, twaps, orderFlow, accountPerps, crowding };
}
