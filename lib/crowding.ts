import { getCoinalyzeLiquidationImbalance, getCoinalyzeOiChangePercent } from "./coinalyze";
import { getStoredCrowdingBars } from "./crowding-history";
import type { DashboardData } from "./types";

export type CrowdingRange = "day" | "week" | "month";

type VenueSnapshot = {
  funding: number | null;
  name: string;
  oiUsd: number;
  source: string;
};

type OiPoint = { time: number; value: number };
type OiHistory = { dayChangePercent: number | null; daySourceCount: number; ranges: Record<CrowdingRange, OiPoint[]> };
type OiSeries = { name: string; points: OiPoint[]; weightBoost: number };

const HYPERLIQUID_INFO_URLS = ["https://api.hyperliquid.xyz/info", "https://api-ui.hyperliquid.xyz/info"];
const PRICE_FALLBACK = 1;

export async function getCrowdingData(input: { hypePrice: number; orderFlow: DashboardData["orderFlow"]; priceChange1d: number | null; rsi14: number | null; twaps: DashboardData["twaps"] }): Promise<DashboardData["crowding"]> {
  const current = await getCurrentCrowdingData(input);
  const storedBars = await getStoredCrowdingBars().catch(() => null);
  return storedBars ? { ...current, bars: { ...current.bars, ...storedBars } } : current;
}

export async function getCurrentCrowdingData(input: { hypePrice: number; orderFlow: DashboardData["orderFlow"]; priceChange1d: number | null; rsi14: number | null; twaps: DashboardData["twaps"] }): Promise<DashboardData["crowding"]> {
  const [venues, oiHistory, liquidation, coinalyzeOiChange] = await Promise.all([
    getVenueSnapshots(input.hypePrice),
    getOiHistory(input.hypePrice),
    getCoinalyzeLiquidationImbalance().catch(() => null),
    getCoinalyzeOiChangePercent().catch(() => null),
  ]);
  const oiFundingScore = fundingCrowdingScore(venues);
  const liquidationScore = liquidation?.score ?? 0;
  const fallbackOiChange = oiHistory.daySourceCount >= 2 ? oiChangePercent(oiHistory.ranges.day) : null;
  const oiChange24hPercent = coinalyzeOiChange ?? oiHistory.dayChangePercent ?? fallbackOiChange;
  const flowNetUsd = weightedFlowNetUsd(input.orderFlow);
  const oiPriceScore = oiPriceCrowdingScore(oiChange24hPercent, input.priceChange1d, weightedFunding(venues));
  const flowScore = flowCrowdingScore(input.orderFlow);
  const twapScore = twapCrowdingScore(input.twaps, input.hypePrice, input.orderFlow);
  const baseScore = clampScore(0.35 * oiFundingScore + 0.2 * liquidationScore + 0.2 * oiPriceScore + 0.15 * flowScore + 0.1 * twapScore);
  const positioningGateScore = 0.35 * oiFundingScore + 0.2 * oiPriceScore;
  const flowGateScore = 0.2 * liquidationScore + 0.15 * flowScore + 0.1 * twapScore;
  const rsiModifier = rsiExhaustionModifier({ baseScore, flowGateScore, positioningGateScore, rsi: input.rsi14 });
  const score = clampScore(baseScore * rsiModifier);
  return {
    bars: buildCrowdingBars(oiHistory.ranges, score),
    breakdown: { flow: Math.round(flowScore), fundingOi: Math.round(oiFundingScore), liquidation: Math.round(liquidationScore), oiPrice: Math.round(oiPriceScore), twap: Math.round(twapScore) },
    generatedAt: new Date().toISOString(),
    label: crowdingLabel(score),
    metrics: {
      flowNetUsd,
      liquidationImbalanceUsd: liquidation?.imbalanceUsd ?? null,
      oiChange24hPercent,
      priceChange24hPercent: input.priceChange1d,
      rsi14: input.rsi14,
      rsiModifier,
      twapPressure1hUsd: input.twaps.pressure.next1h,
      weightedFunding: weightedFunding(venues),
    },
    score: Math.round(score),
    sources: venues.map((venue) => ({ funding: venue.funding, name: venue.name, oiUsd: venue.oiUsd, source: venue.source })),
    summary: crowdingSummary(score, flowScore, oiPriceScore),
    totalOiUsd: venues.reduce((sum, venue) => sum + venue.oiUsd, 0),
  };
}

async function getVenueSnapshots(hypePrice: number): Promise<VenueSnapshot[]> {
  const results = await Promise.allSettled([
    getHyperliquidVenue(), getBinanceVenue(), getBybitVenue(hypePrice), getOkxVenue(), getBitgetVenue(hypePrice),
    getLighterVenue(), getAsterVenue(hypePrice), getMexcVenue(), getGateVenue(), getHtxVenue(),
  ]);
  return results.flatMap((result) => result.status === "fulfilled" && result.value ? [result.value] : []);
}

async function getHyperliquidVenue(): Promise<VenueSnapshot | null> {
  const raw = await postHyperliquid({ type: "metaAndAssetCtxs" });
  const [meta, ctxs] = parseMetaAndCtxs(raw);
  const index = meta.findIndex((market) => market.name === "HYPE");
  if (index < 0) return null;
  const ctx = ctxs[index] ?? {};
  const oi = num(ctx.openInterest) * num(ctx.markPx);
  return oi ? { funding: numOrNull(ctx.funding), name: "Hyperliquid", oiUsd: oi, source: "official" } : null;
}

async function getBinanceVenue(): Promise<VenueSnapshot | null> {
  const [oi, funding] = await Promise.all([getJson("https://fapi.binance.com/fapi/v1/openInterest?symbol=HYPEUSDT"), getJson("https://fapi.binance.com/fapi/v1/premiumIndex?symbol=HYPEUSDT")]);
  const oiUsd = num((oi as Record<string, unknown>).openInterest) * num((funding as Record<string, unknown>).markPrice);
  return oiUsd ? { funding: numOrNull((funding as Record<string, unknown>).lastFundingRate), name: "Binance", oiUsd, source: "official" } : null;
}

async function getBybitVenue(hypePrice: number): Promise<VenueSnapshot | null> {
  const raw = await getJson("https://api.bybit.com/v5/market/open-interest?category=linear&symbol=HYPEUSDT&intervalTime=5min&limit=1");
  const latest = (((raw as Record<string, unknown>).result as Record<string, unknown>)?.list as Record<string, unknown>[] | undefined)?.[0];
  const funding = await getBybitFunding().catch(() => null);
  const oiUsd = num(latest?.openInterest) * hypePrice;
  return oiUsd ? { funding, name: "Bybit", oiUsd, source: "official" } : null;
}

async function getOkxVenue(): Promise<VenueSnapshot | null> {
  const [oi, funding] = await Promise.all([getJson("https://www.okx.com/api/v5/public/open-interest?instType=SWAP&instId=HYPE-USDT-SWAP"), getJson("https://www.okx.com/api/v5/public/funding-rate?instId=HYPE-USDT-SWAP")]);
  const row = ((oi as Record<string, unknown>).data as Record<string, unknown>[] | undefined)?.[0];
  const fundingRow = ((funding as Record<string, unknown>).data as Record<string, unknown>[] | undefined)?.[0];
  const oiUsd = num(row?.oiUsd);
  return oiUsd ? { funding: numOrNull(fundingRow?.fundingRate), name: "OKX", oiUsd, source: "official" } : null;
}

async function getBitgetVenue(hypePrice: number): Promise<VenueSnapshot | null> {
  const raw = await getJson("https://api.bitget.com/api/v2/mix/market/open-interest?symbol=HYPEUSDT&productType=USDT-FUTURES");
  const row = (((raw as Record<string, unknown>).data as Record<string, unknown>)?.openInterestList as Record<string, unknown>[] | undefined)?.[0];
  const oiUsd = num(row?.size) * hypePrice;
  return oiUsd ? { funding: null, name: "Bitget", oiUsd, source: "official" } : null;
}

async function getLighterVenue(): Promise<VenueSnapshot | null> {
  const raw = await getJson("https://mainnet.zklighter.elliot.ai/api/v1/orderBookDetails");
  const row = ((raw as Record<string, unknown>).order_book_details as Record<string, unknown>[] | undefined)?.find((market) => market.symbol === "HYPE");
  const oiUsd = num(row?.open_interest) * num(row?.last_trade_price);
  return oiUsd ? { funding: null, name: "Lighter", oiUsd, source: "official" } : null;
}

async function getAsterVenue(hypePrice: number): Promise<VenueSnapshot | null> {
  const raw = await getJson("https://fapi.asterdex.com/fapi/v1/openInterest?symbol=HYPEUSDT");
  const oiUsd = num((raw as Record<string, unknown>).openInterest) * hypePrice;
  return oiUsd ? { funding: null, name: "Aster", oiUsd, source: "official" } : null;
}

async function getMexcVenue(): Promise<VenueSnapshot | null> {
  const raw = await getJson("https://contract.mexc.com/api/v1/contract/ticker?symbol=HYPE_USDT");
  const data = (raw as Record<string, unknown>).data as Record<string, unknown> | undefined;
  const oiUsd = num(data?.holdVol) * 0.1 * num(data?.fairPrice);
  return oiUsd ? { funding: numOrNull(data?.fundingRate), name: "MEXC", oiUsd, source: "official" } : null;
}

async function getGateVenue(): Promise<VenueSnapshot | null> {
  const raw = await getJson("https://api.gateio.ws/api/v4/futures/usdt/contracts/HYPE_USDT");
  const row = raw as Record<string, unknown>;
  const oiUsd = num(row.position_size) * num(row.quanto_multiplier) * num(row.mark_price);
  return oiUsd ? { funding: numOrNull(row.funding_rate), name: "Gate", oiUsd, source: "official" } : null;
}

async function getHtxVenue(): Promise<VenueSnapshot | null> {
  const raw = await getJson("https://api.hbdm.com/linear-swap-api/v1/swap_open_interest?contract_code=HYPE-USDT");
  const row = ((raw as Record<string, unknown>).data as Record<string, unknown>[] | undefined)?.[0];
  const oiUsd = num(row?.value);
  return oiUsd ? { funding: null, name: "HTX", oiUsd, source: "official" } : null;
}

async function getBybitFunding(): Promise<number | null> {
  const raw = await getJson("https://api.bybit.com/v5/market/tickers?category=linear&symbol=HYPEUSDT");
  const row = (((raw as Record<string, unknown>).result as Record<string, unknown>)?.list as Record<string, unknown>[] | undefined)?.[0];
  return numOrNull(row?.fundingRate);
}

async function getOiHistory(hypePrice: number): Promise<OiHistory> {
  const [daySeries, week, month] = await Promise.all([getOiSeries("day", hypePrice), getCombinedOiBars("week", hypePrice), getCombinedOiBars("month", hypePrice)]);
  const day = mergeOiBars(daySeries.map((series) => series.points), 24);
  return { dayChangePercent: weightedOiChangePercent(daySeries), daySourceCount: daySeries.length, ranges: { day, week, month } };
}

async function getCombinedOiBars(range: CrowdingRange, hypePrice: number): Promise<OiPoint[]> {
  const count = range === "day" ? 24 : range === "week" ? 7 : 30;
  const series = await getOiSeries(range, hypePrice);
  return mergeOiBars(series.map((row) => row.points), count);
}

async function getOiSeries(range: CrowdingRange, hypePrice: number): Promise<OiSeries[]> {
  const results = await Promise.allSettled([
    getBinanceOiBars(range).then((points) => ({ name: "Binance", points, weightBoost: 1.2 })),
    getBybitOiBars(range, hypePrice).then((points) => ({ name: "Bybit", points, weightBoost: 1 })),
    getOkxOiBars(range).then((points) => ({ name: "OKX", points, weightBoost: 1 })),
  ]);
  return results.flatMap((result) => result.status === "fulfilled" && result.value.points.length >= 2 ? [result.value] : []);
}

async function getBinanceOiBars(range: CrowdingRange): Promise<OiPoint[]> {
  const period = range === "day" ? "1h" : "1d";
  const limit = range === "day" ? 24 : range === "week" ? 7 : 30;
  const raw = await getJson(`https://fapi.binance.com/futures/data/openInterestHist?symbol=HYPEUSDT&period=${period}&limit=${limit}`);
  return ((raw as Record<string, unknown>[])).map((row) => ({ time: num(row.timestamp), value: num(row.sumOpenInterestValue) })).filter(isOiPoint);
}

async function getBybitOiBars(range: CrowdingRange, hypePrice: number): Promise<OiPoint[]> {
  const interval = range === "day" ? "1h" : "1d";
  const limit = range === "day" ? 24 : range === "week" ? 7 : 30;
  const raw = await getJson(`https://api.bybit.com/v5/market/open-interest?category=linear&symbol=HYPEUSDT&intervalTime=${interval}&limit=${limit}`);
  const rows = (((raw as Record<string, unknown>).result as Record<string, unknown>)?.list as Record<string, unknown>[] | undefined) ?? [];
  return rows.map((row) => ({ time: num(row.timestamp), value: num(row.openInterest) * hypePrice })).filter(isOiPoint).reverse();
}

async function getOkxOiBars(range: CrowdingRange): Promise<OiPoint[]> {
  const period = range === "day" ? "1H" : "1D";
  const raw = await getJson(`https://www.okx.com/api/v5/rubik/stat/contracts/open-interest-history?instId=HYPE-USDT-SWAP&period=${period}`);
  const limit = range === "day" ? 24 : range === "week" ? 7 : 30;
  const rows = ((raw as Record<string, unknown>).data as unknown[] | undefined) ?? [];
  return rows.slice(0, limit).map((row) => parseOkxOiRow(row)).filter(isOiPoint).reverse();
}

function mergeOiBars(series: OiPoint[][], count: number): OiPoint[] {
  const longest = series.reduce((max, rows) => Math.max(max, rows.length), 0);
  return Array.from({ length: Math.min(count, longest) }, (_, index) => ({
    time: Math.max(...series.map((rows) => rows[index]?.time ?? 0)),
    value: series.reduce((sum, rows) => sum + (rows[index]?.value ?? 0), 0),
  })).filter((point) => point.time > 0 && point.value > 0);
}

function weightedOiChangePercent(series: OiSeries[]): number | null {
  const changes = series.flatMap((row) => {
    const first = row.points[0]?.value ?? 0;
    const last = row.points.at(-1)?.value ?? 0;
    if (!first || !last) return [];
    return [{ change: ((last - first) / first) * 100, weight: first * row.weightBoost }];
  });
  if (changes.length < 2) return null;
  const totalWeight = changes.reduce((sum, row) => sum + row.weight, 0);
  return totalWeight ? changes.reduce((sum, row) => sum + row.change * row.weight, 0) / totalWeight : null;
}

function fundingCrowdingScore(venues: VenueSnapshot[]): number {
  const value = weightedFunding(venues);
  return value === null ? 0 : clampScore((value / 0.00015) * 100);
}

function weightedFunding(venues: VenueSnapshot[]): number | null {
  const funded = venues.filter((venue) => venue.funding !== null && venue.oiUsd > 0);
  const total = funded.reduce((sum, venue) => sum + venue.oiUsd, 0);
  if (!total) return null;
  return funded.reduce((sum, venue) => sum + (venue.funding ?? 0) * venue.oiUsd, 0) / total;
}

function oiChangePercent(bars: OiPoint[]): number | null {
  if (bars.length < 2) return null;
  const first = bars[0].value;
  const last = bars.at(-1)?.value ?? first;
  return first ? ((last - first) / first) * 100 : null;
}

function weightedFlowNetUsd(orderFlow: DashboardData["orderFlow"]): number {
  const frames = [{ id: "5m", weight: 0.5 }, { id: "15m", weight: 0.3 }, { id: "1h", weight: 0.2 }] as const;
  return frames.reduce((sum, frame) => sum + flowNetUsd(orderFlow.perps.marketTrades[frame.id]) * frame.weight, 0);
}

function flowNetUsd(flow: { buys: { value: number }[]; sells: { value: number }[] }): number {
  const buy = flow.buys.reduce((sum, row) => sum + row.value, 0);
  const sell = flow.sells.reduce((sum, row) => sum + row.value, 0);
  return buy - sell;
}

function oiPriceCrowdingScore(oiChange24hPercent: number | null, priceChange1d: number | null, funding: number | null): number {
  if (oiChange24hPercent === null || priceChange1d === null) return 0;
  const oiChange = oiChange24hPercent / 100;
  if (oiChange <= 0) return 0;
  const fundingDirection = funding !== null && Math.abs(funding) >= 0.00002 ? Math.sign(funding) : 0;
  const direction = fundingDirection || (priceChange1d >= 0 ? 1 : -1);
  const base = clampScore(oiChange * 350);
  const isTrendContinuation = priceChange1d * direction > 5;
  const isFlat = Math.abs(priceChange1d) < 2;
  const trapMultiplier = isFlat || priceChange1d * direction < 0 ? 1 : 0.55;
  const trendCap = isTrendContinuation ? 60 : 100;
  return clampScore(direction * Math.min(base * trapMultiplier, trendCap));
}

function rsiExhaustionModifier({ baseScore, flowGateScore, positioningGateScore, rsi }: { baseScore: number; flowGateScore: number; positioningGateScore: number; rsi: number | null }): number {
  if (rsi === null || Math.abs(baseScore) < 20) return 1;
  const direction = Math.sign(baseScore);
  const positioningAgrees = Math.sign(positioningGateScore) === direction && Math.abs(positioningGateScore) >= 8;
  const flowAgrees = Math.sign(flowGateScore) === direction && Math.abs(flowGateScore) >= 3;
  if (!positioningAgrees || !flowAgrees) return 1;
  if (direction > 0) {
    if (rsi >= 80) return 1.06;
    if (rsi >= 70) return 1.03;
    if (rsi <= 45) return 0.97;
  }
  if (direction < 0) {
    if (rsi <= 20) return 1.06;
    if (rsi <= 30) return 1.03;
    if (rsi >= 55) return 0.97;
  }
  return 1;
}

function flowCrowdingScore(orderFlow: DashboardData["orderFlow"]): number {
  const frames = [{ id: "5m", weight: 0.5 }, { id: "15m", weight: 0.3 }, { id: "1h", weight: 0.2 }] as const;
  return frames.reduce((score, frame) => score + flowFrameScore(orderFlow.perps.marketTrades[frame.id]) * frame.weight, 0);
}

function flowFrameScore(flow: { buys: { value: number }[]; sells: { value: number }[] }): number {
  const buy = flow.buys.reduce((sum, row) => sum + row.value, 0);
  const sell = flow.sells.reduce((sum, row) => sum + row.value, 0);
  const total = buy + sell;
  const confidence = Math.min(1, total / 1_000_000);
  return total ? aggressiveFlowRiskScore(buy, sell) * confidence : 0;
}

export function aggressiveFlowRiskScore(buyUsd: number, sellUsd: number): number {
  const total = buyUsd + sellUsd;
  return total ? clampScore(((sellUsd - buyUsd) / total) * 100) : 0;
}

function twapCrowdingScore(twaps: DashboardData["twaps"], hypePrice: number, orderFlow: DashboardData["orderFlow"]): number {
  const oneHourVolume = orderFlow.hourlyVolume.at(-1)?.volumeUsd ?? hypePrice * PRICE_FALLBACK;
  return clampScore((-twaps.pressure.next1h / Math.max(oneHourVolume, 1)) * 100);
}

function buildCrowdingBars(history: Record<CrowdingRange, OiPoint[]>, currentScore: number): DashboardData["crowding"]["bars"] {
  return {
    day: pointsToBars(history.day, currentScore, "hour"),
    week: pointsToBars(history.week, currentScore, "day"),
    month: pointsToBars(history.month, currentScore, "day"),
  };
}

function pointsToBars(points: OiPoint[], currentScore: number, labelMode: "hour" | "day") {
  const first = points[0]?.value ?? 0;
  const lastScore = points.length ? clampScore(((points.at(-1)?.value ?? first) - first) / Math.max(first, 1) * 700) : currentScore;
  const offset = currentScore - lastScore;
  return points.map((point) => ({ label: formatBarLabel(point.time, labelMode), score: Math.round(clampScore(((point.value - first) / Math.max(first, 1)) * 700 + offset)), value: point.value }));
}

function crowdingLabel(score: number): DashboardData["crowding"]["label"] {
  if (score >= 60) return "Crowded Long";
  if (score >= 20) return "Long-Leaning";
  if (score <= -60) return "Crowded Short";
  if (score <= -20) return "Short-Leaning";
  return "Balanced";
}

function crowdingSummary(score: number, flowScore: number, oiPriceScore: number): string {
  if (score >= 60 && flowScore < 0) return "Crowded longs with sell flow appearing — downside unwind risk is elevated.";
  if (score <= -60 && flowScore > 0) return "Crowded shorts with buy flow appearing — upside squeeze risk is elevated.";
  if (score >= 20) return oiPriceScore > 20 ? "Long leverage is building; watch for stall + sell flow as the unwind trigger." : "Perp positioning leans long, but unwind trigger is not obvious yet.";
  if (score <= -20) return oiPriceScore < -20 ? "Short leverage is building; watch for upside flow as the squeeze trigger." : "Perp positioning leans short, but squeeze trigger is not obvious yet.";
  return "Perp positioning is mixed; no clear forced-unwind side right now.";
}

async function postHyperliquid(body: Record<string, unknown>): Promise<unknown> {
  let lastError: unknown = null;
  for (const url of HYPERLIQUID_INFO_URLS) {
    try {
      const response = await fetch(url, { body: JSON.stringify(body), headers: { "content-type": "application/json" }, method: "POST" });
      if (response.ok) return response.json();
      lastError = new Error(`Hyperliquid API failed: ${response.status}`);
    } catch (error) { lastError = error; }
  }
  throw lastError instanceof Error ? lastError : new Error("Hyperliquid API failed");
}

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url, { headers: { accept: "application/json", "user-agent": "hypedashboard/1.0" } });
  if (!response.ok) throw new Error(`Fetch failed ${response.status}: ${url}`);
  return response.json();
}

function parseMetaAndCtxs(raw: unknown): [Record<string, unknown>[], Record<string, unknown>[]] {
  if (!Array.isArray(raw)) return [[], []];
  const meta = raw[0] as Record<string, unknown> | undefined;
  return [Array.isArray(meta?.universe) ? meta.universe as Record<string, unknown>[] : [], Array.isArray(raw[1]) ? raw[1] as Record<string, unknown>[] : []];
}

function parseOkxOiRow(row: unknown): OiPoint | null {
  if (!Array.isArray(row)) return null;
  const time = num(row[0]);
  const value = num(row[3]);
  return time && value ? { time, value } : null;
}

function formatBarLabel(time: number, mode: "hour" | "day"): string {
  const date = new Date(time);
  return mode === "hour" ? String(date.getUTCHours()).padStart(2, "0") : `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
}

function isOiPoint(point: OiPoint | null): point is OiPoint { return point !== null && point.time > 0 && point.value > 0; }
function num(value: unknown): number { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function numOrNull(value: unknown): number | null { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; }
function clampScore(value: number): number { return Math.max(-100, Math.min(100, value)); }
