"use client";

import Link from "next/link";
import { List, RefreshCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { HEADER_TIMEFRAMES, PERFORMANCE_TIMEFRAMES } from "../lib/order-flow";
import type { HeaderTimeframeId } from "../lib/order-flow";
import { formatCompactUsd, formatCompactUsdOneDecimal, formatNumber, formatPercent, formatUsd } from "../lib/format";
import type { HoldingDashboardData, HypeTwap } from "../lib/types";

type VolumeRange = "day" | "week" | "month";
type LiveTwap = HypeTwap & { liveProgress: number; liveRemainingMs: number; liveValue: number; snapshotElapsedMs: number };
type Status = { data: HoldingDashboardData | null; error: string | null; loading: boolean };

const FIRST_CLASS_DASHBOARDS = [
  { href: "/", label: "HYPE", logo: "/logos/hype.jpg", logoClass: "h-full w-full scale-[0.89]", tone: "border-emerald-300/50 bg-emerald-300/10" },
  { href: "/crypto/NEAR", label: "NEAR", logo: "/logos/near.jpg", logoClass: "h-full w-full scale-[1.01]", tone: "border-lime-300/50 bg-lime-300/10" },
  { href: "/crypto/ZEC", label: "ZEC", logo: "/logos/zec.png", logoClass: "h-full w-full scale-[0.92]", tone: "border-amber-300/50 bg-amber-300/10" },
  { href: "/crypto/SPCX", label: "SpaceX", logo: "/logos/spacex.svg", logoClass: "h-9 w-28 max-w-none translate-x-1 scale-[0.95]", tone: "border-sky-300/50 bg-sky-300/10" },
] as const;

const FIRST_CLASS_SYMBOLS = new Set(["HYPE", "NEAR", "ZEC", "SPCX", "SPX"]);

export function HoldingDashboard({ initialData }: { initialData: HoldingDashboardData }) {
  const [status, setStatus] = useState<Status>({ data: initialData, error: null, loading: false });
  const [range, setRange] = useState<VolumeRange>("day");
  useEffect(() => {
    const timer = window.setInterval(() => { void refresh(initialData.asset.coin, setStatus); }, 30_000);
    return () => window.clearInterval(timer);
  }, [initialData.asset.coin]);
  const data = status.data ?? initialData;
  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-5 md:px-8 md:py-8">
      <HoldingHeader data={data} loading={status.loading} onRefresh={() => void refresh(data.asset.coin, setStatus)} />
      {status.error ? <div className="rounded-2xl border border-rose-400/30 bg-rose-950/30 px-4 py-3 text-sm text-rose-100">{status.error}</div> : null}
      <PerformanceGrid data={data} />
      <TwapPanel data={data} />
      <VolumeChart data={data} range={range} onRange={setRange} />
    </main>
  );
}

async function refresh(coin: string, setStatus: React.Dispatch<React.SetStateAction<Status>>) {
  setStatus((current) => ({ ...current, loading: true, error: null }));
  try {
    const response = await fetch(`/api/holding?coin=${encodeURIComponent(coin)}&t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Holding refresh failed: ${response.status}`);
    const data = await response.json() as HoldingDashboardData;
    setStatus({ data, error: null, loading: false });
  } catch (error) {
    setStatus((current) => ({ ...current, loading: false, error: error instanceof Error ? error.message : "Refresh failed" }));
  }
}

function HoldingHeader({ data, loading, onRefresh }: { data: HoldingDashboardData; loading: boolean; onRefresh: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:gap-4"><h1 className="text-4xl font-semibold tracking-tight md:text-6xl">{displayCoin(data.asset.coin)}</h1><div className="flex flex-wrap items-baseline gap-x-3 gap-y-2"><p className="mono text-3xl font-semibold text-emerald-300 md:text-5xl">{formatUsd(data.asset.price, 4)}</p><HeaderChangePills changes={data.asset.headerChanges} /></div></div>
      <div className="relative flex flex-wrap justify-end gap-2 self-start md:self-auto">
        <FirstClassDashboardButtons active={displayCoin(data.asset.coin)} />
        <button aria-label="Show watched holdings" className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-700/80 bg-slate-900/60 text-slate-200 hover:bg-slate-800" onClick={() => setOpen((volumeUsd) => !volumeUsd)}><List className="h-4 w-4" /></button>
        <button aria-label="Refresh holding dashboard" className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-700/80 bg-slate-900/60 text-slate-200 hover:bg-slate-800" onClick={onRefresh}><RefreshCcw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} /></button>
        {open ? <HoldingsMenu data={data} /> : null}
      </div>
    </header>
  );
}

function HoldingsMenu({ data }: { data: HoldingDashboardData }) {
  const holdings = data.holdings.groups.filter((group) => !FIRST_CLASS_SYMBOLS.has(group.position.displayCoin.toUpperCase()));
  return (
    <div className="absolute right-0 top-12 z-20 w-80 rounded-2xl border border-slate-700 bg-slate-950/95 p-3 shadow-2xl shadow-black/50 backdrop-blur">
      <div className="mb-2 flex items-center justify-between"><p className="text-sm font-semibold">Watched holdings</p><span className="mono text-xs text-slate-500">{holdings.length}</span></div>
      <div className="space-y-2">
        {holdings.length ? holdings.map((group) => <Link className="block rounded-xl border border-slate-800 bg-slate-900/60 p-3 hover:border-emerald-400/50" href={`/holdings/${encodeURIComponent(group.coin)}`} key={group.coin}><div className="flex items-center justify-between"><span className="font-semibold">{group.position.displayCoin}</span><span className={`mono text-xs ${group.position.side === "LONG" ? "text-emerald-300" : "text-rose-300"}`}>{group.position.side}</span></div></Link>) : <p className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-sm text-slate-500">No non-dashboard holdings found.</p>}
      </div>
    </div>
  );
}

function FirstClassDashboardButtons({ active }: { active: string }) {
  return <div className="flex gap-2">{FIRST_CLASS_DASHBOARDS.map((item) => <Link aria-label={`${item.label} dashboard`} className={`inline-flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border shadow-lg shadow-black/20 transition hover:scale-105 ${item.tone} ${active === item.label || (active === "SPCX" && item.label === "SpaceX") ? "ring-2 ring-white/40" : ""}`} href={item.href} key={item.label} title={item.label}><img alt="" className={`${item.logoClass} object-cover`} src={item.logo} /></Link>)}</div>;
}

function HeaderChangePills({ changes }: { changes: Record<HeaderTimeframeId, number | null> }) {
  return <div className="flex flex-wrap gap-2 pb-1">{HEADER_TIMEFRAMES.map((frame) => <span className={`mono rounded-full border border-slate-800 bg-slate-900/70 px-2.5 py-1 text-xs font-semibold ${volumeUsdTone(changes[frame.id])}`} key={frame.id}>({frame.label} {formatPercent(changes[frame.id])})</span>)}</div>;
}

function PerformanceGrid({ data }: { data: HoldingDashboardData }) {
  return <section className="grid gap-3 rounded-3xl border border-slate-800 bg-slate-950/50 p-4 shadow-2xl shadow-black/20 md:grid-cols-7">{PERFORMANCE_TIMEFRAMES.map((frame) => <MetricCard key={frame.id} label={frame.label} volumeUsd={formatPercent(data.asset.changes[frame.id])} tone={volumeUsdTone(data.asset.changes[frame.id])} />)}{PERFORMANCE_TIMEFRAMES.map((frame) => <MetricCard key={`${frame.id}-vol`} label={`${frame.label} Vol`} volumeUsd={formatCompactUsd(data.asset.volumes[frame.id])} tone="text-slate-100" />)}</section>;
}

function MetricCard({ label, volumeUsd, tone }: { label: string; volumeUsd: string; tone: string }) {
  return <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-3"><p className="text-xs uppercase tracking-wide text-slate-500">{label}</p><p className={`mono mt-2 text-xl font-semibold ${tone}`}>{volumeUsd}</p></div>;
}

function TwapPanel({ data }: { data: HoldingDashboardData }) {
  const now = useSecondTicker();
  const snapshotTime = Date.parse(data.generatedAt);
  const rows = data.twaps.rows.map((twap) => liveTwap(twap, now, snapshotTime));
  const pressure = buildPressure(rows);
  const label = displayCoin(data.asset.coin);
  return <Card title={`${label} Perp TWAP Pressure`} action={<span className="mono text-xs text-slate-500">{rows.length} active</span>}><div className="grid gap-5 lg:grid-cols-[minmax(260px,0.32fr)_minmax(0,0.68fr)]"><div className="grid grid-cols-2 gap-3"><TwapStat label="Next 5m" volumeUsd={signedUsd(pressure.next5m)} tone={volumeUsdTone(pressure.next5m)} /><TwapStat label="Next 15m" volumeUsd={signedUsd(pressure.next15m)} tone={volumeUsdTone(pressure.next15m)} /><TwapStat label="Next 1h" volumeUsd={signedUsd(pressure.next1h)} tone={volumeUsdTone(pressure.next1h)} /><TwapStat label="Next 24h" volumeUsd={signedUsd(pressure.next24h)} tone={volumeUsdTone(pressure.next24h)} /></div><div className="min-w-0 rounded-2xl border border-slate-800 bg-slate-950/30 p-4"><div className="mb-3 flex items-center justify-between text-sm"><span className="text-slate-400">Active TWAPs</span><span className="mono text-slate-500">{rows.length}</span></div><div className="max-h-72 space-y-3 overflow-y-auto pr-2">{rows.length ? rows.map((twap) => <TwapRow key={twap.hash} twap={twap} />) : <p className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 text-sm text-slate-500">No active {data.asset.coin} perp TWAPs right now.</p>}</div></div></div></Card>;
}

function VolumeChart({ data, range, onRange }: { data: HoldingDashboardData; range: VolumeRange; onRange: (range: VolumeRange) => void }) {
  const bars = range === "day" ? data.volume.hourlyVolume : range === "week" ? data.volume.weeklyVolume : data.volume.dailyVolume;
  const projectedBars = bars.map((bar, index) => ({ bar, projection: getVolumeProjection(bar.volumeUsd, index, bars.length, range, data.generatedAt) }));
  const max = Math.max(...projectedBars.map(({ bar, projection }) => bar.volumeUsd + projection), 1);
  const subtitle = range === "day" ? "Last 24 one-hour bars from Hyperliquid candles." : range === "week" ? "Last 7 daily bars from Hyperliquid candles." : "Last 30 daily bars from Hyperliquid candles.";
  return <Card title={`${displayCoin(data.asset.coin)} Volume`} subtitle={subtitle} action={<div className="flex gap-2">{(["day", "week", "month"] as VolumeRange[]).map((option) => <button className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${range === option ? "bg-emerald-300 text-slate-950" : "border border-slate-700 text-slate-400 hover:text-slate-100"}`} key={option} onClick={() => onRange(option)}>{option}</button>)}</div>}><div className="h-56"><div className="flex h-full items-end gap-2 rounded-2xl border border-slate-800 bg-slate-950/40 p-4">{projectedBars.map(({ bar, projection }) => <div className="group flex h-full flex-1 flex-col justify-end gap-2" key={bar.label}><div className="relative flex flex-1 items-end"><VolumeStack bar={bar.volumeUsd} max={max} projection={projection} label={bar.label} /></div><span className="truncate text-center text-[10px] text-slate-500">{bar.label}</span></div>)}</div></div></Card>;
}

function VolumeStack({ bar, label, max, projection }: { bar: number; label: string; max: number; projection: number }) {
  const actualHeight = Math.max(4, (bar / max) * 100);
  const projectionHeight = projection > 0 ? Math.max(2, (projection / max) * 100) : 0;
  const title = projection > 0 ? `${label} ${formatCompactUsdOneDecimal(bar)} actual · ${formatCompactUsdOneDecimal(bar + projection)} projected` : `${label} ${formatCompactUsdOneDecimal(bar)}`;
  return <div className="flex h-full w-full flex-col justify-end" title={title}>{projection > 0 ? <div className="w-full rounded-t-md border border-dashed border-emerald-100/60 bg-emerald-200/25 transition group-hover:bg-emerald-100/35" style={{ height: `${projectionHeight}%` }} /> : null}<div className={projection > 0 ? "w-full bg-emerald-300/80 transition-all group-hover:bg-emerald-200" : "w-full rounded-t-md bg-emerald-300/80 transition-all group-hover:bg-emerald-200"} style={{ height: `${actualHeight}%` }} /></div>;
}

function getVolumeProjection(value: number, index: number, count: number, range: VolumeRange, generatedAt: string): number {
  if (index !== count - 1 || value <= 0) return 0;
  const now = new Date(generatedAt);
  const elapsedMs = range === "day" ? ((now.getUTCMinutes() * 60 + now.getUTCSeconds()) * 1_000 + now.getUTCMilliseconds()) : ((now.getUTCHours() * 3_600 + now.getUTCMinutes() * 60 + now.getUTCSeconds()) * 1_000 + now.getUTCMilliseconds());
  const bucketMs = range === "day" ? 3_600_000 : 86_400_000;
  const elapsedRatio = Math.min(0.98, Math.max(0.02, elapsedMs / bucketMs));
  return Math.max(0, value / elapsedRatio - value);
}

function Card({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return <section className="rounded-3xl border border-slate-800 bg-slate-950/60 p-5 shadow-2xl shadow-black/20"><div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between"><div><h2 className="text-2xl font-semibold tracking-tight">{title}</h2>{subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}</div>{action}</div>{children}</section>;
}

function TwapStat({ label, tone, volumeUsd }: { label: string; tone: string; volumeUsd: string }) {
  return <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-3"><p className="text-xs text-slate-500">{label}</p><p className={`mono mt-2 text-2xl font-semibold ${tone}`}>{volumeUsd}</p></div>;
}

function TwapRow({ twap }: { twap: LiveTwap }) {
  const sideTone = twap.side === "BUY" ? "text-emerald-300" : "text-rose-300";
  const progressTone = twap.side === "BUY" ? "bg-emerald-300" : "bg-rose-300";
  return <a className="block rounded-2xl border border-slate-800 bg-slate-900/50 p-3 transition hover:border-slate-600 hover:bg-slate-900/80 focus:outline-none focus:ring-2 focus:ring-emerald-300/40" href={hypurrscanTwapUrl(twap)} rel="noreferrer" target="_blank"><div className="mb-2 flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-1.5"><span className={`mono text-xs font-semibold ${sideTone}`}>{twap.side}</span><TwapVenueTag token={twap.token} /></div><p className="mt-1 font-semibold">{twap.token}</p></div><div className="text-right"><p className="mono font-semibold">{formatCompactUsd(twap.liveValue)}</p><p className="mono text-sm text-slate-400">{formatNumber(twap.amount)} {displayCoin(twap.token)}</p></div></div><div className="h-2 overflow-hidden rounded-full bg-slate-800"><div className={`h-full ${progressTone} transition-all duration-1000 ease-linear`} style={{ width: `${Math.max(3, twap.liveProgress * 100)}%` }} /></div><div className="mt-2 flex justify-between gap-3 text-xs text-slate-500"><span className="mono truncate">{shortAddress(twap.user)}</span><span className="mono whitespace-nowrap">{formatDuration(twap.liveRemainingMs)} left</span></div></a>;
}

function hypurrscanTwapUrl(twap: HypeTwap): string {
  const section = twap.token.endsWith("-USD") ? "perps" : "spot";
  return `https://hypurrscan.io/address/${twap.user}#${section}`;
}

function TwapVenueTag({ token }: { token: string }) {
  const isPerp = token.endsWith("-USD");
  const label = isPerp ? "PERP" : "SPOT";
  const tone = isPerp ? "border-sky-400/30 bg-sky-400/10 text-sky-200" : "border-emerald-400/30 bg-emerald-400/10 text-emerald-200";
  return <span className={`mono rounded-full border px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.14em] ${tone}`}>{label}</span>;
}

function useSecondTicker(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1_000); return () => window.clearInterval(timer); }, []);
  return now;
}

function liveTwap(twap: HypeTwap, now: number, snapshotTime: number): LiveTwap {
  const durationMs = Math.max(1, twap.durationMs);
  const liveRemainingMs = Math.max(0, twap.endTime - now);
  const liveProgress = clamp((now - twap.startTime) / durationMs, 0, 1);
  const snapshotElapsedMs = Math.max(0, now - (Number.isFinite(snapshotTime) ? snapshotTime : now));
  return { ...twap, liveProgress, liveRemainingMs, liveValue: twap.value, snapshotElapsedMs };
}

function buildPressure(rows: LiveTwap[]) {
  return { next5m: calcPressure(rows, 5 * 60_000), next15m: calcPressure(rows, 15 * 60_000), next1h: calcPressure(rows, 60 * 60_000), next24h: calcPressure(rows, 24 * 60 * 60_000) };
}
function calcPressure(rows: LiveTwap[], windowMs: number): number { return rows.reduce((total, row) => total + (row.side === "BUY" ? 1 : -1) * (row.liveValue / Math.max(1, row.durationMs)) * Math.max(0, Math.min(row.remainingMs, windowMs) - row.snapshotElapsedMs), 0); }
function signedUsd(volumeUsd: number): string { return `${volumeUsd >= 0 ? "+" : "-"}${formatCompactUsd(Math.abs(volumeUsd))}`; }
function volumeUsdTone(volumeUsd: number | null): string { if (volumeUsd === null || volumeUsd === 0) return "text-slate-300"; return volumeUsd > 0 ? "text-emerald-300" : "text-rose-300"; }
function shortAddress(address: string): string { return address.length > 18 ? `${address.slice(0, 8)}...${address.slice(-6)}` : address; }
function clamp(volumeUsd: number, min: number, max: number): number { return Math.min(max, Math.max(min, volumeUsd)); }
function displayCoin(coin: string): string { return coin.includes(":") ? coin.split(":").at(-1) ?? coin : coin; }
function formatDuration(ms: number): string { const s = Math.max(0, Math.round(ms / 1000)); const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const sec = s % 60; if (h > 0) return `${h}h ${m}m ${sec}s`; if (m > 0) return `${m}m ${sec}s`; return `${sec}s`; }
