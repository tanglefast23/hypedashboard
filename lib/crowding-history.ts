import type { CrowdingBar, CrowdingData } from "./types";

const SNAPSHOT_TABLE = "hype_dashboard_crowding_snapshots";
const RETENTION_RPC = "hype_dashboard_delete_old_crowding_snapshots";
const RANGE_BUCKETS = {
  day: { count: 24, durationMs: 60 * 60 * 1000, label: "hour" },
  week: { count: 7, durationMs: 24 * 60 * 60 * 1000, label: "day" },
  month: { count: 30, durationMs: 24 * 60 * 60 * 1000, label: "day" },
} as const;

type SupabaseConfig = { key: string; url: string };
type RangeId = keyof typeof RANGE_BUCKETS;
type SnapshotRow = { score: number; snapshot_time: string; total_oi_usd: number };

export async function saveCrowdingSnapshot(crowding: CrowdingData, asset = "HYPE"): Promise<{ ok: boolean; reason?: string }> {
  const config = getSupabaseConfig();
  if (!config) return { ok: false, reason: "Supabase server env missing" };
  const response = await supabaseFetch(config, SNAPSHOT_TABLE, {
    body: JSON.stringify(toSnapshotRow(crowding, asset)),
    headers: { Prefer: "return=minimal" },
    method: "POST",
  });
  if (!response.ok) throw new Error(`Supabase crowding insert failed: ${response.status} ${await response.text()}`);
  await deleteOldCrowdingSnapshots(config);
  return { ok: true };
}

export async function getStoredCrowdingBars(asset = "HYPE"): Promise<Partial<Record<RangeId, CrowdingBar[]>> | null> {
  const config = getSupabaseConfig();
  if (!config) return null;
  const since = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
  const params = new URLSearchParams({
    select: "snapshot_time,score,total_oi_usd",
    asset: `eq.${normalizeAsset(asset)}`,
    snapshot_time: `gte.${since}`,
    order: "snapshot_time.desc",
    limit: "5000",
  });
  const response = await supabaseFetch(config, `${SNAPSHOT_TABLE}?${params}`);
  if (!response.ok) return null;
  const rows = (await response.json() as Record<string, unknown>[]).map(parseSnapshotRow).filter(isSnapshotRow).reverse();
  if (rows.length < 2) return null;
  const bars = Object.fromEntries((Object.keys(RANGE_BUCKETS) as RangeId[]).flatMap((range) => {
    const rangeBars = buildRangeBars(rows, range);
    return rangeBars.length >= minBarsForRange(range) ? [[range, rangeBars]] : [];
  })) as Partial<Record<RangeId, CrowdingBar[]>>;
  return Object.keys(bars).length ? bars : null;
}

function toSnapshotRow(crowding: CrowdingData, asset: string): Record<string, unknown> {
  return {
    asset: normalizeAsset(asset),
    flow_net_usd: crowding.metrics.flowNetUsd,
    flow_score: crowding.breakdown.flow,
    funding_oi_score: crowding.breakdown.fundingOi,
    label: crowding.label,
    liquidation_imbalance_usd: crowding.metrics.liquidationImbalanceUsd,
    liquidation_score: crowding.breakdown.liquidation,
    oi_change_24h_percent: crowding.metrics.oiChange24hPercent,
    oi_price_score: crowding.breakdown.oiPrice,
    price_change_24h_percent: crowding.metrics.priceChange24hPercent,
    raw: { breakdown: crowding.breakdown, metrics: crowding.metrics, sources: crowding.sources },
    score: crowding.score,
    source_count: crowding.sources.length,
    total_oi_usd: crowding.totalOiUsd,
    twap_pressure_1h_usd: crowding.metrics.twapPressure1hUsd,
    twap_score: crowding.breakdown.twap,
    weighted_funding: crowding.metrics.weightedFunding,
  };
}

function buildRangeBars(rows: SnapshotRow[], range: RangeId): CrowdingBar[] {
  const spec = RANGE_BUCKETS[range];
  const end = floorTime(Date.now(), spec.durationMs);
  const start = end - (spec.count - 1) * spec.durationMs;
  return Array.from({ length: spec.count }, (_, index) => {
    const bucketStart = start + index * spec.durationMs;
    const bucketRows = rows.filter((row) => {
      const time = Date.parse(row.snapshot_time);
      return time >= bucketStart && time < bucketStart + spec.durationMs;
    });
    return {
      label: formatBarLabel(bucketStart, spec.label),
      score: bucketRows.length ? Math.round(avg(bucketRows.map((row) => row.score))) : 0,
      value: bucketRows.length ? avg(bucketRows.map((row) => row.total_oi_usd)) : 0,
    };
  });
}

function minBarsForRange(range: RangeId): number { return range === "day" ? 2 : 2; }

async function deleteOldCrowdingSnapshots(config: SupabaseConfig): Promise<void> {
  const response = await supabaseFetch(config, `rpc/${RETENTION_RPC}`, { body: "{}", method: "POST" });
  if (!response.ok) throw new Error(`Supabase crowding cleanup failed: ${response.status}`);
}

function getSupabaseConfig(): SupabaseConfig | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url: url.replace(/\/$/, ""), key } : null;
}

async function supabaseFetch(config: SupabaseConfig, path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${config.url}/rest/v1/${path}`, {
    cache: "no-store",
    ...init,
    headers: { apikey: config.key, authorization: `Bearer ${config.key}`, "content-type": "application/json", ...(init.headers ?? {}) },
  });
}

function parseSnapshotRow(row: Record<string, unknown>): SnapshotRow | null {
  const score = Number(row.score);
  const totalOiUsd = Number(row.total_oi_usd);
  return typeof row.snapshot_time === "string" && Number.isFinite(score) && Number.isFinite(totalOiUsd)
    ? { score, snapshot_time: row.snapshot_time, total_oi_usd: totalOiUsd }
    : null;
}

function normalizeAsset(asset: string): string { return asset.toUpperCase(); }
function floorTime(time: number, bucketMs: number): number { return Math.floor(time / bucketMs) * bucketMs; }
function avg(values: number[]): number { return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1); }
function formatBarLabel(time: number, mode: "hour" | "day"): string {
  const date = new Date(time);
  return mode === "hour" ? String(date.getHours()).padStart(2, "0") : `${date.getMonth() + 1}/${date.getDate()}`;
}
function isSnapshotRow(row: SnapshotRow | null): row is SnapshotRow { return row !== null; }
