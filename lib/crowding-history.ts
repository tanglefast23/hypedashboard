import type { CrowdingBar, CrowdingData } from "./types";

const SNAPSHOT_TABLE = "hype_dashboard_crowding_snapshots";
const RETENTION_RPC = "hype_dashboard_delete_old_crowding_snapshots";
const BARS_RPC = "hype_dashboard_crowding_bars";
const RANGE_BUCKETS = {
  day: { count: 24, durationMs: 60 * 60 * 1000, label: "hour" },
  week: { count: 7, durationMs: 24 * 60 * 60 * 1000, label: "day" },
  month: { count: 30, durationMs: 24 * 60 * 60 * 1000, label: "day" },
} as const;

type SupabaseConfig = { key: string; url: string };
type RangeId = keyof typeof RANGE_BUCKETS;
type BucketRow = { bucket: "hour" | "day"; score: number; time: number; value: number };

export async function saveCrowdingSnapshot(crowding: CrowdingData, asset = "HYPE"): Promise<{ ok: boolean; reason?: string }> {
  const config = getSupabaseConfig();
  if (!config) return { ok: false, reason: "Supabase server env missing" };
  const response = await supabaseFetch(config, SNAPSHOT_TABLE, {
    body: JSON.stringify(toSnapshotRow(crowding, asset)),
    headers: { Prefer: "return=minimal" },
    method: "POST",
  });
  if (!response.ok) throw new Error(`Supabase crowding insert failed: ${response.status} ${await response.text()}`);
  return { ok: true };
}

export async function pruneCrowdingSnapshots(): Promise<{ ok: boolean; reason?: string }> {
  const config = getSupabaseConfig();
  if (!config) return { ok: false, reason: "Supabase server env missing" };
  await deleteOldCrowdingSnapshots(config);
  return { ok: true };
}

export async function getStoredCrowdingBars(asset = "HYPE"): Promise<Partial<Record<RangeId, CrowdingBar[]>> | null> {
  const config = getSupabaseConfig();
  if (!config) return null;
  const response = await supabaseFetch(config, `rpc/${BARS_RPC}`, {
    body: JSON.stringify({ p_asset: normalizeAsset(asset) }),
    method: "POST",
  });
  if (!response.ok) return null;
  const rows = (await response.json() as Record<string, unknown>[]).map(parseBucketRow).filter(isBucketRow);
  if (rows.length < 2) return null;
  return {
    day: buildRangeBars(bucketMap(rows, "hour"), "day"),
    week: buildRangeBars(bucketMap(rows, "day"), "week"),
    month: buildRangeBars(bucketMap(rows, "day"), "month"),
  };
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

function buildRangeBars(buckets: Map<number, BucketRow>, range: RangeId): CrowdingBar[] {
  const spec = RANGE_BUCKETS[range];
  const end = floorTime(Date.now(), spec.durationMs);
  const start = end - (spec.count - 1) * spec.durationMs;
  return Array.from({ length: spec.count }, (_, index) => {
    const bucketStart = start + index * spec.durationMs;
    const row = buckets.get(bucketStart);
    return {
      label: formatBarLabel(bucketStart, spec.label),
      score: row ? Math.round(row.score) : 0,
      value: row?.value ?? 0,
    };
  });
}

function bucketMap(rows: BucketRow[], bucket: "hour" | "day"): Map<number, BucketRow> {
  return new Map(rows.filter((row) => row.bucket === bucket).map((row) => [row.time, row]));
}

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

function parseBucketRow(row: Record<string, unknown>): BucketRow | null {
  const bucket = row.bucket === "hour" || row.bucket === "day" ? row.bucket : null;
  const time = typeof row.bucket_start === "string" ? Date.parse(row.bucket_start) : NaN;
  const score = Number(row.avg_score);
  const value = Number(row.avg_oi);
  return bucket && Number.isFinite(time) && Number.isFinite(score) && Number.isFinite(value) ? { bucket, score, time, value } : null;
}

function normalizeAsset(asset: string): string { return asset.toUpperCase(); }
function floorTime(time: number, bucketMs: number): number { return Math.floor(time / bucketMs) * bucketMs; }
function formatBarLabel(time: number, mode: "hour" | "day"): string {
  const date = new Date(time);
  return mode === "hour" ? String(date.getHours()).padStart(2, "0") : `${date.getMonth() + 1}/${date.getDate()}`;
}
function isBucketRow(row: BucketRow | null): row is BucketRow { return row !== null; }
