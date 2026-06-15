import { buildLimitFillFlow, buildMarketFlow, FLOW_TIMEFRAMES } from "./order-flow";
import type { DashboardData } from "./types";

const HYPERLIQUID_INFO_URLS = ["https://api.hyperliquid.xyz/info", "https://api-ui.hyperliquid.xyz/info"];
const TRADE_TABLE = "hype_dashboard_trades";

type Venue = "perps" | "spot";
type TradeSide = "A" | "B";
type SupabaseConfig = { key: string; url: string };
type RawTrade = { coin: string; px: string; side: TradeSide; sz: string; tid?: number | string; time: number; hash?: string };
type StoredTrade = { price: number; side: TradeSide; size: number; time: number; value: number };
type VenueFlow = DashboardData["orderFlow"]["perps"];

export async function collectHypeTrades(): Promise<{ inserted: number; ok: boolean; reason?: string }> {
  const config = getSupabaseConfig();
  if (!config) return { inserted: 0, ok: false, reason: "Supabase server env missing" };
  const [perpRaw, spotRaw] = await Promise.all([fetchRecentTrades("HYPE"), fetchRecentTrades("@107")]);
  const rows = [...normalizeTrades(perpRaw, "perps", "HYPE"), ...normalizeTrades(spotRaw, "spot", "@107")];
  if (rows.length === 0) return { inserted: 0, ok: true };
  await upsertTrades(config, rows);
  await deleteOldTrades(config);
  return { inserted: rows.length, ok: true };
}

export async function getStoredVenueFlows(): Promise<{ perps: VenueFlow; spot: VenueFlow } | null> {
  const config = getSupabaseConfig();
  if (!config) return null;
  const [perps, spot] = await Promise.all([buildStoredVenueFlow(config, "perps"), buildStoredVenueFlow(config, "spot")]);
  if (!hasAnyTrades(perps) && !hasAnyTrades(spot)) return null;
  return { perps, spot };
}

function getSupabaseConfig(): SupabaseConfig | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url: url.replace(/\/$/, ""), key } : null;
}

async function buildStoredVenueFlow(config: SupabaseConfig, venue: Venue): Promise<VenueFlow> {
  const now = Date.now();
  const entries = await Promise.all(FLOW_TIMEFRAMES.map(async (frame) => [frame.id, await getFrameTrades(config, venue, frame.durationMs, now)] as const));
  const marketTrades = Object.fromEntries(entries.map(([id, trades]) => [id, buildMarketFlow(trades, Number.POSITIVE_INFINITY, now)])) as VenueFlow["marketTrades"];
  const limitFills = Object.fromEntries(entries.map(([id, trades]) => [id, buildLimitFillFlow(trades, Number.POSITIVE_INFINITY, now)])) as VenueFlow["limitFills"];
  return { marketTrades, limitFills };
}

async function getFrameTrades(config: SupabaseConfig, venue: Venue, durationMs: number, now: number): Promise<StoredTrade[]> {
  const since = new Date(now - durationMs).toISOString();
  const [buys, sells] = await Promise.all([
    queryFrameSide(config, venue, "B", since),
    queryFrameSide(config, venue, "A", since),
  ]);
  return [...buys, ...sells];
}

async function queryFrameSide(config: SupabaseConfig, venue: Venue, side: TradeSide, since: string): Promise<StoredTrade[]> {
  const rows: StoredTrade[] = [];
  const pageSize = 1000;
  for (let offset = 0; offset < 10_000; offset += pageSize) {
    const page = await queryFrameSidePage(config, venue, side, since, pageSize, offset);
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
  return rows;
}

async function queryFrameSidePage(config: SupabaseConfig, venue: Venue, side: TradeSide, since: string, limit: number, offset: number): Promise<StoredTrade[]> {
  const params = new URLSearchParams({
    select: "side,price,size,value_usd,trade_time",
    venue: `eq.${venue}`,
    side: `eq.${side}`,
    trade_time: `gte.${since}`,
    order: "trade_time.desc",
    limit: String(limit),
    offset: String(offset),
  });
  const response = await supabaseFetch(config, `${TRADE_TABLE}?${params}`);
  if (!response.ok) throw new Error(`Supabase ${venue} ${side} query failed: ${response.status}`);
  const rows = await response.json() as Record<string, unknown>[];
  return rows.map(parseStoredTrade).filter(isStoredTrade);
}

async function upsertTrades(config: SupabaseConfig, rows: Record<string, unknown>[]): Promise<void> {
  const response = await supabaseFetch(config, `${TRADE_TABLE}?on_conflict=venue,trade_id`, {
    body: JSON.stringify(rows),
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    method: "POST",
  });
  if (!response.ok) throw new Error(`Supabase upsert failed: ${response.status} ${await response.text()}`);
}

async function deleteOldTrades(config: SupabaseConfig): Promise<void> {
  const response = await supabaseFetch(config, "rpc/hype_dashboard_delete_old_trades", { body: "{}", method: "POST" });
  if (!response.ok) throw new Error(`Supabase cleanup failed: ${response.status}`);
}

function normalizeTrades(raw: unknown[], venue: Venue, coin: string): Record<string, unknown>[] {
  return raw.map((trade) => parseRawTrade(trade, coin)).filter(isRawTrade).map((trade) => ({
    coin,
    price: trade.px,
    raw: trade,
    side: trade.side,
    size: trade.sz,
    trade_id: String(trade.tid ?? trade.hash ?? `${trade.time}-${trade.side}-${trade.px}-${trade.sz}`),
    trade_time: new Date(trade.time).toISOString(),
    value_usd: Number(trade.px) * Number(trade.sz),
    venue,
  }));
}

function parseRawTrade(trade: unknown, coin: string): RawTrade | null {
  if (!trade || typeof trade !== "object") return null;
  const row = trade as Record<string, unknown>;
  const side = row.side === "A" || row.side === "B" ? row.side : null;
  if (typeof row.px !== "string" || typeof row.sz !== "string" || typeof row.time !== "number" || !side) return null;
  return { coin, hash: typeof row.hash === "string" ? row.hash : undefined, px: row.px, side, sz: row.sz, tid: typeof row.tid === "string" || typeof row.tid === "number" ? row.tid : undefined, time: row.time };
}

function parseStoredTrade(row: Record<string, unknown>): StoredTrade | null {
  const price = toNumber(row.price);
  const size = toNumber(row.size);
  const value = toNumber(row.value_usd);
  const side = row.side === "A" || row.side === "B" ? row.side : null;
  const time = typeof row.trade_time === "string" ? Date.parse(row.trade_time) : NaN;
  if (price === null || size === null || value === null || !side || !Number.isFinite(time)) return null;
  return { price, side, size, time, value };
}

async function fetchRecentTrades(coin: string): Promise<unknown[]> {
  const raw = await postHyperliquid({ type: "recentTrades", coin });
  return Array.isArray(raw) ? raw : [];
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

async function supabaseFetch(config: SupabaseConfig, path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${config.url}/rest/v1/${path}`, {
    ...init,
    cache: "no-store",
    headers: { apikey: config.key, authorization: `Bearer ${config.key}`, "content-type": "application/json", ...(init.headers ?? {}) },
  });
}

function hasAnyTrades(flow: VenueFlow): boolean {
  return FLOW_TIMEFRAMES.some((frame) => flow.marketTrades[frame.id].buys.length || flow.marketTrades[frame.id].sells.length);
}

function isRawTrade(trade: RawTrade | null): trade is RawTrade { return trade !== null; }
function isStoredTrade(trade: StoredTrade | null): trade is StoredTrade { return trade !== null; }
function toNumber(value: unknown): number | null { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; }
