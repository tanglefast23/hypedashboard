"use client";

import Link from "next/link";
import { List, RefreshCcw } from "lucide-react";
import { useEffect, useState } from "react";

type SortKey = "date" | "price" | "size" | "value";
type SortDirection = "asc" | "desc";
type SortState = { key: SortKey; direction: SortDirection } | null;
type VolumeRange = "day" | "week" | "month";
type TwapFilter = "spot" | "perps" | "combined";
type LiveTwap = HypeTwap & { liveProgress: number; liveRemainingMs: number; liveValue: number; snapshotElapsedMs: number };
import { FLOW_TIMEFRAMES, HEADER_TIMEFRAMES, PERFORMANCE_TIMEFRAMES, type FlowTimeframeId, type HeaderTimeframeId, type MarketTrade } from "../lib/order-flow";
import { formatCompactUsd, formatCompactUsdOneDecimal, formatNumber, formatPercent, formatUsd } from "../lib/format";
import type { DashboardData, HypeTwap } from "../lib/types";

type Status = { data: DashboardData | null; error: string | null; loading: boolean };

type Props = { initialData: DashboardData };

export function Dashboard({ initialData }: Props) {
  const [status, setStatus] = useState<Status>({ data: initialData, error: null, loading: false });
  const [flowFrame, setFlowFrame] = useState<FlowTimeframeId>("5m");
  const [volumeRange, setVolumeRange] = useState<VolumeRange>("day");
  const [crowdingRange, setCrowdingRange] = useState<VolumeRange>("day");

  useEffect(() => {
    const timer = window.setInterval(() => { void refresh(initialData.asset.symbol, setStatus); }, 30_000);
    return () => window.clearInterval(timer);
  }, [initialData.asset.symbol]);

  const data = status.data ?? initialData;
  const handleFlowFrame = (frame: FlowTimeframeId) => {
    setFlowFrame(frame);
    void refresh(data.asset.symbol, setStatus);
  };

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-5 md:px-8 md:py-8">
      <Header data={data} loading={status.loading} onRefresh={() => void refresh(data.asset.symbol, setStatus)} />
      {status.error ? <ErrorBanner message={status.error} /> : null}
      <PerformanceGrid data={data} />
      <CrowdingPanel data={data} range={crowdingRange} onRange={setCrowdingRange} />
      <HypeTwapPanel data={data} />
      <VolumeBarChart data={data} range={volumeRange} onRange={setVolumeRange} />
      <section className="grid gap-8 2xl:grid-cols-2">
        <OrderFlowCard frame={flowFrame} onFrame={handleFlowFrame} title="Perps Market Buys / Sells" buys={data.orderFlow.perps.marketTrades[flowFrame].buys} sells={data.orderFlow.perps.marketTrades[flowFrame].sells} subtitle={`Completed aggressive taker trades on ${data.asset.symbol} perps.`} />
        <OrderFlowCard frame={flowFrame} onFrame={handleFlowFrame} title="Spot Market Buys / Sells" buys={data.orderFlow.spot.marketTrades[flowFrame].buys} sells={data.orderFlow.spot.marketTrades[flowFrame].sells} subtitle={data.asset.spotSymbol ? `Completed aggressive taker trades on ${spotDisplayPair(data.asset.symbol)}` : `${data.asset.symbol} spot tape is not available from the current Hyperliquid source.`} />
      </section>
    </main>
  );
}

async function refresh(symbol: string, setStatus: React.Dispatch<React.SetStateAction<Status>>) {
  setStatus((current) => ({ ...current, loading: true, error: null }));
  try {
    const response = await fetch(`/api/dashboard?coin=${encodeURIComponent(symbol)}&t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Dashboard refresh failed: ${response.status}`);
    const data = await response.json() as DashboardData;
    setStatus({ data, error: null, loading: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Refresh failed";
    setStatus((current) => ({ ...current, error: message, loading: false }));
  }
}

function Header({ data, loading, onRefresh }: { data: DashboardData; loading: boolean; onRefresh: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:gap-4"><h1 className="text-4xl font-semibold tracking-tight md:text-6xl">{data.asset.symbol}</h1><div className="flex flex-wrap items-baseline gap-x-3 gap-y-2"><p className="mono text-3xl font-semibold text-emerald-300 md:text-5xl">{formatUsd(data.hype.price, 4)}</p><HeaderChangePills changes={data.hype.headerChanges} /></div></div>
      <div className="relative flex gap-2 self-start md:self-auto">
        <button aria-label="Show watched holdings" className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-700/80 bg-slate-900/60 text-slate-200 hover:bg-slate-800" onClick={() => setOpen((value) => !value)}>
          <List className="h-4 w-4" />
        </button>
        <button aria-label="Refresh dashboard" className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-700/80 bg-slate-900/60 text-slate-200 hover:bg-slate-800" onClick={onRefresh}>
          <RefreshCcw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
        </button>
        {open ? <HoldingsMenu data={data} /> : null}
      </div>
    </header>
  );
}

function HoldingsMenu({ data }: { data: DashboardData }) {
  const holdings = data.accountPerps.groups.filter((group) => group.position.displayCoin !== "HYPE");
  return (
    <div className="absolute right-0 top-12 z-20 w-80 rounded-2xl border border-slate-700 bg-slate-950/95 p-3 shadow-2xl shadow-black/50 backdrop-blur">
      <div className="mb-2 flex items-center justify-between"><p className="text-sm font-semibold">Watched holdings</p><span className="mono text-xs text-slate-500">{holdings.length + 2}</span></div>
      <div className="space-y-2">
        <Link className="block rounded-xl border border-emerald-400/30 bg-emerald-300/10 p-3 hover:border-emerald-300/70" href="/">
          <div className="flex items-center justify-between gap-3"><span className="font-semibold text-emerald-200">HOME</span><span className="mono text-xs text-emerald-300">HYPE</span></div>
        </Link>
        <Link className="block rounded-xl border border-slate-800 bg-slate-900/60 p-3 hover:border-emerald-400/50" href="/crypto/NEAR">
          <div className="flex items-center justify-between gap-3"><span className="font-semibold">NEAR</span><span className="mono text-xs text-emerald-300">CRYPTO</span></div>
        </Link>
        <Link className="block rounded-xl border border-slate-800 bg-slate-900/60 p-3 hover:border-emerald-400/50" href="/crypto/ZEC">
          <div className="flex items-center justify-between gap-3"><span className="font-semibold">ZEC</span><span className="mono text-xs text-emerald-300">CRYPTO</span></div>
        </Link>
        {holdings.length ? holdings.map((group) => (
          <Link className="block rounded-xl border border-slate-800 bg-slate-900/60 p-3 hover:border-emerald-400/50" href={`/holdings/${encodeURIComponent(group.coin)}`} key={group.coin}>
            <div className="flex items-center justify-between gap-3"><span className="font-semibold">{group.position.displayCoin}</span><span className={`mono text-xs ${group.position.side === "LONG" ? "text-emerald-300" : "text-rose-300"}`}>{group.position.side}</span></div>
          </Link>
        )) : <p className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-sm text-slate-500">No non-HYPE perp holdings found.</p>}
      </div>
    </div>
  );
}

function HeaderChangePills({ changes }: { changes: Record<HeaderTimeframeId, number | null> }) {
  return (
    <div className="flex flex-wrap gap-2 pb-1">
      {HEADER_TIMEFRAMES.map((frame) => {
        const value = changes[frame.id];
        return <span className={`mono rounded-full border border-slate-800 bg-slate-900/70 px-2.5 py-1 text-xs font-semibold ${valueTone(value)}`} key={frame.id}>({frame.label} {formatPercent(value)})</span>;
      })}
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return <div className="rounded-2xl border border-rose-400/30 bg-rose-950/30 px-4 py-3 text-sm text-rose-100">{message}</div>;
}

function PerformanceGrid({ data }: { data: DashboardData }) {
  return (
    <section className="rounded-3xl border border-slate-700/50 bg-slate-950/60 p-5 shadow-2xl shadow-black/20 backdrop-blur">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        {PERFORMANCE_TIMEFRAMES.map((frame) => <MetricTile key={frame.id} label={frame.label} value={formatPercent(data.hype.changes[frame.id])} tone={valueTone(data.hype.changes[frame.id])} />)}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        {PERFORMANCE_TIMEFRAMES.map((frame) => <MetricTile key={frame.id} label={`${frame.label} Vol`} value={formatCompactUsd(data.hype.volumes[frame.id])} tone="text-slate-100" />)}
      </div>
    </section>
  );
}

function MetricTile({ label, tone, value }: { label: string; tone: string; value: string }) {
  return <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4"><p className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</p><p className={`mono mt-2 text-xl font-semibold ${tone}`}>{value}</p></div>;
}

function CrowdingPanel({ data, onRange, range }: { data: DashboardData; onRange: (range: VolumeRange) => void; range: VolumeRange }) {
  const crowding = data.crowding;
  const bars = crowding.bars[range];
  const maxAbs = Math.max(...bars.map((bar) => Math.abs(bar.score)), 20);
  const scoreTone = crowding.score > 20 ? "text-amber-200" : crowding.score < -20 ? "text-cyan-200" : "text-slate-200";
  const risk = crowding.score > 20 ? "Downside unwind risk" : crowding.score < -20 ? "Upside squeeze risk" : "No clear unwind side";
  return (
    <section className="grid gap-5 rounded-3xl border border-slate-700/50 bg-slate-950/60 p-5 shadow-2xl shadow-black/20 backdrop-blur lg:grid-cols-[minmax(240px,0.34fr)_minmax(0,0.66fr)]">
      <div className="flex flex-col justify-between gap-5">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{data.asset.symbol} Perp Crowding</p>
          <div className="mt-3 flex items-end gap-3"><p className={`mono text-5xl font-semibold ${scoreTone}`}>{signedScore(crowding.score)}</p><p className="pb-2 text-lg font-semibold text-slate-100">{crowding.label}</p></div>
          <p className="mt-2 text-sm text-slate-400">{risk}</p>
          <p className="mt-3 text-sm leading-6 text-slate-300">{crowding.summary}</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <CrowdingMini label="Combined OI" value={formatCompactUsd(crowding.totalOiUsd)} tone="text-slate-100" />
          <CrowdingMini label="Venues" value={String(crowding.sources.length)} tone="text-slate-100" />
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-3">
          <p className="mb-2 text-xs uppercase tracking-[0.18em] text-slate-500">Score weights</p>
          <CrowdingWeightRow label="OI/Funding crowding" metric={formatFundingMetric(crowding.metrics.weightedFunding)} score={crowding.breakdown.fundingOi} weight="35%" />
          <CrowdingWeightRow label="Liquidation imbalance" metric={formatLiquidationMetric(crowding.metrics.liquidationImbalanceUsd)} note={crowding.metrics.liquidationImbalanceUsd === null ? "needs COINALYZE_API_KEY" : "1h realized long-short liqs"} score={crowding.breakdown.liquidation} weight="25%" />
          <CrowdingWeightRow label="Price/OI trap behavior" metric={formatOiPriceMetric(crowding.metrics.oiChange24hPercent, crowding.metrics.priceChange24hPercent)} score={crowding.breakdown.oiPrice} weight="20%" />
          <CrowdingWeightRow label="Taker-flow reversal" metric={signedUsd(crowding.metrics.flowNetUsd)} score={crowding.breakdown.flow} weight="15%" />
          <CrowdingWeightRow label="TWAP pressure" metric={signedUsd(crowding.metrics.twapPressure1hUsd)} score={crowding.breakdown.twap} weight="5%" />
          <div className="border-t border-slate-800/80 pt-2"><p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">RSI modifier</p><p className="mono mt-1 text-sm font-medium text-slate-400">{formatRsiModifier(crowding.metrics.rsi14, crowding.metrics.rsiModifier)}</p></div>
        </div>
      </div>
      <div className="min-w-0 rounded-2xl border border-slate-800 bg-slate-900/30 p-4">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-xl font-semibold">Crowding History</h2><p className="mt-1 text-sm text-slate-400">Supabase snapshots when available; free OI history fills until enough data accumulates.</p></div><VolumeRangePills active={range} onRange={onRange} /></div>
        <div className="flex h-52 items-center gap-1 sm:gap-2">{bars.map((bar, index) => <CrowdingBar key={`${bar.label}-${index}`} bar={bar} maxAbs={maxAbs} />)}</div>
      </div>
    </section>
  );
}

function CrowdingMini({ label, tone, value }: { label: string; tone: string; value: string }) {
  return <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-3"><p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">{label}</p><p className={`mono mt-1 text-lg font-semibold ${tone}`}>{value}</p></div>;
}

function CrowdingWeightRow({ label, metric, note, score, weight }: { label: string; metric: string; note?: string; score: number; weight: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-slate-800/80 py-2 first:border-t-0">
      <div className="min-w-0"><p className="truncate text-sm text-slate-200"><span className="mono text-slate-500">{weight}</span> {label}</p><p className="mono mt-1 truncate text-sm font-medium text-slate-400">{metric}{note ? ` · ${note}` : ""}</p></div>
      <span className={`mono text-2xl font-semibold ${scoreToneForCrowding(score)}`}>{signedScore(score)}</span>
    </div>
  );
}

function formatFundingMetric(value: number | null): string {
  return value === null ? "funding n/a" : `weighted funding ${signedPercent(value * 100)}`;
}

function formatLiquidationMetric(value: number | null): string {
  return value === null ? "liq imbalance n/a" : `liq imbalance ${signedUsd(value)}`;
}

function formatOiPriceMetric(oiChange: number | null, priceChange: number | null): string {
  return `OI ${signedPercent(oiChange)} · price ${signedPercent(priceChange)}`;
}

function formatRsiModifier(rsi: number | null, modifier: number): string {
  const rsiText = rsi === null ? "RSI n/a" : `RSI ${rsi.toFixed(1)}`;
  if (modifier > 1) return `${modifier.toFixed(2)}x · ${rsiText} confirms gated exhaustion`;
  if (modifier < 1) return `${modifier.toFixed(2)}x · ${rsiText} dampens confirmed setup`;
  return `1.00x · ${rsiText} mixed position/flow/base`;
}

function signedPercent(value: number | null): string {
  if (value === null) return "n/a";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function CrowdingBar({ bar, maxAbs }: { bar: DashboardData["crowding"]["bars"]["day"][number]; maxAbs: number }) {
  const height = Math.max(3, Math.abs(bar.score) / maxAbs * 42);
  const isLongCrowded = bar.score >= 0;
  const labelClass = `mono absolute left-1/2 z-10 -translate-x-1/2 text-[10px] font-semibold ${scoreToneForCrowding(bar.score)}`;
  const labelStyle = isLongCrowded ? { bottom: `calc(50% + ${height}% + 4px)` } : { top: `calc(50% + ${height}% + 4px)` };
  return (
    <div className="group flex h-full min-w-0 flex-1 flex-col items-center justify-center gap-2" title={`${bar.label} ${signedScore(bar.score)} · ${formatCompactUsdOneDecimal(bar.value)} OI`}>
      <div className="relative flex h-44 w-full items-center pt-6 pb-6">
        <div className="absolute left-0 right-0 top-1/2 h-px bg-slate-700/80" />
        <div className={isLongCrowded ? "absolute bottom-1/2 w-full rounded-t bg-amber-300/70 group-hover:bg-amber-200" : "absolute top-1/2 w-full rounded-b bg-cyan-300/70 group-hover:bg-cyan-200"} style={{ height: `${height}%` }} />
        <span className={labelClass} style={labelStyle}>{signedScore(bar.score)}</span>
      </div>
      <span className="mono hidden text-center text-[10px] text-slate-500 sm:block">{bar.label}</span>
    </div>
  );
}

function scoreToneForCrowding(value: number): string {
  if (value >= 20) return "text-amber-200";
  if (value <= -20) return "text-cyan-200";
  return "text-slate-300";
}

function signedScore(value: number): string { return `${value > 0 ? "+" : ""}${Math.round(value)}`; }

function VolumeBarChart({ data, onRange, range }: { data: DashboardData; onRange: (range: VolumeRange) => void; range: VolumeRange }) {
  const bars = getVolumeBars(data, range);
  const projectedBars = bars.map((bar, index) => ({ bar, projection: getVolumeProjection(bar.volumeUsd, index, bars.length, range, data.generatedAt) }));
  const max = Math.max(...projectedBars.map(({ bar, projection }) => bar.volumeUsd + projection), 1);
  const subtitle = getVolumeSubtitle(range);
  return (
    <section className="rounded-3xl border border-slate-700/50 bg-slate-950/60 p-5 shadow-2xl shadow-black/20 backdrop-blur">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-xl font-semibold">{data.asset.symbol} Volume</h2><p className="mt-1 text-sm text-slate-400">{subtitle}</p></div><VolumeRangePills active={range} onRange={onRange} /></div>
      <div className="flex h-56 items-end gap-1 sm:gap-2">{projectedBars.map(({ bar, projection }, index) => <div className="group flex h-full min-w-0 flex-1 flex-col justify-end gap-2" key={`${bar.label}-${index}`}><div className="flex min-h-0 flex-1 items-end pt-6"><VolumeStack bar={bar.volumeUsd} max={max} projection={projection} label={bar.label} /></div><span className="mono hidden text-center text-[10px] text-slate-500 sm:block">{bar.label}</span></div>)}</div>
    </section>
  );
}

function getVolumeBars(data: DashboardData, range: VolumeRange) {
  if (range === "day") return data.orderFlow.hourlyVolume;
  if (range === "week") return data.orderFlow.weeklyVolume;
  return data.orderFlow.dailyVolume;
}

function getVolumeSubtitle(range: VolumeRange): string {
  if (range === "day") return "Last 24 one-hour bars from Hyperliquid candles.";
  if (range === "week") return "Last 7 daily bars from Hyperliquid candles.";
  return "Last 30 daily bars from Hyperliquid candles.";
}

function VolumeStack({ bar, label, max, projection }: { bar: number; label: string; max: number; projection: number }) {
  const actualHeight = Math.max(4, (bar / max) * 100);
  const projectionHeight = projection > 0 ? Math.max(2, (projection / max) * 100) : 0;
  const totalHeight = Math.min(100, actualHeight + projectionHeight);
  const valueLabel = projection > 0 ? formatCompactUsdOneDecimal(bar + projection) : formatCompactUsdOneDecimal(bar);
  const title = projection > 0 ? `${label} ${formatCompactUsdOneDecimal(bar)} actual · ${formatCompactUsdOneDecimal(bar + projection)} projected` : `${label} ${formatCompactUsdOneDecimal(bar)}`;
  return (
    <div className="relative flex h-full w-full flex-col justify-end" title={title}>
      <span className="mono pointer-events-none absolute left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap text-[9px] font-medium text-emerald-100/80 sm:block" style={{ bottom: `calc(${totalHeight}% + 4px)` }}>{valueLabel}</span>
      {projection > 0 ? <div className="w-full rounded-t border border-dashed border-emerald-100/60 bg-emerald-200/25 transition group-hover:bg-emerald-100/35" style={{ height: `${projectionHeight}%` }} /> : null}
      <div className={projection > 0 ? "w-full bg-emerald-300/70 transition group-hover:bg-emerald-200" : "w-full rounded-t bg-emerald-300/70 transition group-hover:bg-emerald-200"} style={{ height: `${actualHeight}%` }} />
    </div>
  );
}

function getVolumeProjection(value: number, index: number, count: number, range: VolumeRange, generatedAt: string): number {
  if (index !== count - 1 || value <= 0) return 0;
  const now = new Date(generatedAt);
  const elapsedMs = range === "day" ? ((now.getUTCMinutes() * 60 + now.getUTCSeconds()) * 1_000 + now.getUTCMilliseconds()) : ((now.getUTCHours() * 3_600 + now.getUTCMinutes() * 60 + now.getUTCSeconds()) * 1_000 + now.getUTCMilliseconds());
  const bucketMs = range === "day" ? 3_600_000 : 86_400_000;
  const elapsedRatio = Math.min(0.98, Math.max(0.02, elapsedMs / bucketMs));
  return Math.max(0, value / elapsedRatio - value);
}

function VolumeRangePills({ active, onRange }: { active: VolumeRange; onRange: (range: VolumeRange) => void }) {
  return <div className="flex gap-2"><button className={pillClass(active === "day")} onClick={() => onRange("day")}>Day</button><button className={pillClass(active === "week")} onClick={() => onRange("week")}>Week</button><button className={pillClass(active === "month")} onClick={() => onRange("month")}>Month</button></div>;
}

function OrderFlowCard({ buys, frame, onFrame, sells, subtitle, title }: { buys: MarketTrade[]; frame: FlowTimeframeId; onFrame: (frame: FlowTimeframeId) => void; sells: MarketTrade[]; subtitle: string; title: string }) {
  const netValue = sumTradeValue(buys) - sumTradeValue(sells);
  const largestBuy = largestTradeValue(buys);
  const largestSell = largestTradeValue(sells);
  return (
    <section className="rounded-3xl border border-slate-700/50 bg-slate-950/60 p-6 shadow-2xl shadow-black/20 backdrop-blur">
      <div className="mb-5 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-slate-400">{subtitle}</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <FlowStat label="Net" value={signedUsd(netValue)} tone={valueTone(netValue)} />
            <FlowStat label="Largest Buy" value={formatCompactUsd(largestBuy)} tone="text-emerald-300" />
            <FlowStat label="Largest Sell" value={formatCompactUsd(largestSell)} tone="text-rose-300" />
          </div>
        </div>
        <Pills active={frame} onFrame={onFrame} />
      </div>
      <div className="grid gap-6 md:grid-cols-2"><FlowTable rows={buys} side="BUY" /><FlowTable rows={sells} side="SELL" /></div>
    </section>
  );
}

function FlowStat({ label, tone, value }: { label: string; tone: string; value: string }) {
  return <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-3"><p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{label}</p><p className={`mono mt-1 text-2xl font-semibold ${tone}`}>{value}</p></div>;
}

function Pills({ active, onFrame }: { active: FlowTimeframeId; onFrame: (frame: FlowTimeframeId) => void }) {
  return <div className="flex flex-wrap gap-2">{FLOW_TIMEFRAMES.map((frame) => <button className={pillClass(frame.id === active)} key={frame.id} onClick={() => onFrame(frame.id)}>{frame.label}</button>)}</div>;
}

function pillClass(active: boolean): string {
  const base = "mono rounded-full border px-3 py-1.5 text-xs transition";
  return active ? `${base} border-emerald-300 bg-emerald-300 text-slate-950` : `${base} border-slate-700 bg-slate-900/70 text-slate-300 hover:border-slate-500`;
}

function FlowTable({ rows, side }: { rows: MarketTrade[]; side: "BUY" | "SELL" }) {
  const [sort, setSort] = useState<SortState>(null);
  const sortedRows = sortRows(rows, sort);
  const tableScrollClass = rows.length > 10 ? "max-h-[22rem] overflow-auto" : "overflow-x-auto";
  return (
    <div><div className={`mb-2 mono text-sm font-semibold ${side === "BUY" ? "text-emerald-300" : "text-rose-300"}`}>{side}</div><div className={`${tableScrollClass} rounded-2xl border border-slate-800`}><table className="min-w-[28rem] w-full text-left text-xs"><thead className="sticky top-0 z-10 bg-slate-900/95 text-slate-500"><tr><SortableHead label="Date" sortKey="date" sort={sort} onSort={setSort} padded /><SortableHead label="Price" sortKey="price" sort={sort} onSort={setSort} /><SortableHead label="Size" sortKey="size" sort={sort} onSort={setSort} /><SortableHead label="Value" sortKey="value" sort={sort} onSort={setSort} /></tr></thead><tbody>{sortedRows.map((row, index) => <tr className="border-t border-slate-800/80" key={`${side}-${rowKey(row)}-${index}`}><td className="mono px-3 py-2 text-slate-400">{formatElapsed(row.time)}</td><td className="mono px-3 py-2">{formatUsd(row.price, 4)}</td><td className="mono px-3 py-2">{formatNumber(row.size)}</td><td className="mono px-3 py-2">{formatCompactUsd(row.value)}</td></tr>)}</tbody></table></div></div>
  );
}

function SortableHead({ label, onSort, padded = false, sort, sortKey }: { label: string; onSort: (sort: SortState) => void; padded?: boolean; sort: SortState; sortKey: SortKey }) {
  const active = sort?.key === sortKey;
  return <th className={padded ? "px-3 py-2" : "py-2"}><button className={`inline-flex items-center gap-1 hover:text-slate-200 ${active ? "text-slate-200" : ""}`} onClick={() => onSort(nextSort(sort, sortKey))}>{label}{active ? <span>{sort.direction === "asc" ? "↑" : "↓"}</span> : null}</button></th>;
}

function nextSort(current: SortState, key: SortKey): SortState {
  if (current?.key !== key) return { key, direction: "desc" };
  return { key, direction: current.direction === "desc" ? "asc" : "desc" };
}

function sortRows(rows: MarketTrade[], sort: SortState) {
  if (!sort) return rows;
  return [...rows].sort((a, b) => (valueForSort(a, sort.key) - valueForSort(b, sort.key)) * (sort.direction === "asc" ? 1 : -1));
}

function valueForSort(row: MarketTrade, key: SortKey): number {
  if (key === "date") return row.time;
  return row[key];
}

function rowKey(row: MarketTrade): string {
  return `${row.time}-${row.price}-${row.size}-${row.value}`;
}

function formatElapsed(timestamp: number): string {
  const minutes = Math.max(0, (Date.now() - timestamp) / 60_000);
  if (minutes < 10) return `${minutes.toFixed(1)}m`;
  if (minutes < 60) return `${Math.floor(minutes)}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = Math.floor(minutes % 60);
  return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

function HypeTwapPanel({ data }: { data: DashboardData }) {
  const [filter, setFilter] = useState<TwapFilter>("combined");
  const now = useSecondTicker();
  const snapshotTime = Date.parse(data.generatedAt);
  const rows = filterTwapRows(data.twaps.rows, filter, data.asset.symbol).map((twap) => liveTwap(twap, now, snapshotTime));
  const pressure = buildFilteredTwapPressure(rows);
  return (
    <Card title={`TWAPs ${data.asset.symbol} Buy Pressure`} action={<TwapFilterPills active={filter} onFilter={setFilter} showSpot={data.asset.spotSymbol !== null} />}>
      <div className="grid gap-5 lg:grid-cols-[minmax(220px,0.32fr)_minmax(0,0.68fr)]">
        <section className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4">
          <div className="grid grid-cols-2 gap-3">
            <TwapStat label="Next 5m" value={signedUsd(pressure.next5m)} tone={valueTone(pressure.next5m)} />
            <TwapStat label="Next 15m" value={signedUsd(pressure.next15m)} tone={valueTone(pressure.next15m)} />
            <TwapStat label="Next 1h" value={signedUsd(pressure.next1h)} tone={valueTone(pressure.next1h)} />
            <TwapStat label="Next 24h" value={signedUsd(pressure.next24h)} tone={valueTone(pressure.next24h)} />
          </div>
        </section>
        <section className="min-w-0 rounded-2xl border border-slate-800 bg-slate-900/30 p-4">
          <div className="mb-3 flex items-center justify-between text-sm"><span className="text-slate-400">Active TWAPs</span><span className="mono text-slate-500">{rows.length}</span></div>
          <div className="max-h-52 space-y-3 overflow-y-auto pr-2">
            {rows.length ? rows.map((twap) => <TwapRow key={twap.hash} twap={twap} />) : <p className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 text-sm text-slate-500">No active TWAPs for this filter.</p>}
          </div>
        </section>
      </div>
    </Card>
  );
}

function TwapFilterPills({ active, onFilter, showSpot }: { active: TwapFilter; onFilter: (filter: TwapFilter) => void; showSpot: boolean }) {
  if (!showSpot) return <div className="flex flex-wrap gap-2"><button className={pillClass(active !== "spot")} onClick={() => onFilter("combined")}>PERPS</button></div>;
  return <div className="flex flex-wrap gap-2"><button className={pillClass(active === "spot")} onClick={() => onFilter("spot")}>SPOT</button><button className={pillClass(active === "perps")} onClick={() => onFilter("perps")}>PERPS</button><button className={pillClass(active === "combined")} onClick={() => onFilter("combined")}>S+P</button></div>;
}

function useSecondTicker(): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  return now;
}

function liveTwap(twap: HypeTwap, now: number, snapshotTime: number): LiveTwap {
  const durationMs = Math.max(1, twap.durationMs);
  const liveRemainingMs = Math.max(0, twap.endTime - now);
  const liveProgress = clamp((now - twap.startTime) / durationMs, 0, 1);
  const snapshotElapsedMs = Math.max(0, now - (Number.isFinite(snapshotTime) ? snapshotTime : now));
  return { ...twap, liveProgress, liveRemainingMs, liveValue: twap.value, snapshotElapsedMs };
}

function filterTwapRows(rows: HypeTwap[], filter: TwapFilter, symbol: string): HypeTwap[] {
  if (filter === "combined") return rows;
  if (filter === "spot") return rows.filter((row) => row.token === symbol);
  return rows.filter((row) => row.token === `${symbol}-USD` || (symbol !== "HYPE" && row.token === symbol));
}

function buildFilteredTwapPressure(rows: LiveTwap[]) {
  return {
    next5m: calculateFilteredTwapPressure(rows, 5 * 60 * 1000),
    next15m: calculateFilteredTwapPressure(rows, 15 * 60 * 1000),
    next1h: calculateFilteredTwapPressure(rows, 60 * 60 * 1000),
    next24h: calculateFilteredTwapPressure(rows, 24 * 60 * 60 * 1000),
  };
}

function calculateFilteredTwapPressure(rows: LiveTwap[], windowMs: number): number {
  return rows.reduce((total, row) => {
    const overlapMs = Math.max(0, Math.min(row.remainingMs, windowMs) - row.snapshotElapsedMs);
    const pressure = (row.liveValue / row.durationMs) * overlapMs;
    return total + (row.side === "BUY" ? pressure : -pressure);
  }, 0);
}

function Card({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return <section className="rounded-3xl border border-slate-700/50 bg-slate-950/60 p-5 shadow-2xl shadow-black/20 backdrop-blur"><div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><h2 className="text-xl font-semibold">{title}</h2>{action}</div>{children}</section>;
}

function TwapRow({ twap }: { twap: LiveTwap }) {
  const sideTone = twap.side === "BUY" ? "text-emerald-300" : "text-rose-300";
  const progressTone = twap.side === "BUY" ? "bg-emerald-300" : "bg-rose-300";
  return <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-3"><div className="mb-2 flex items-start justify-between gap-3"><div><span className={`mono text-xs font-semibold ${sideTone}`}>{twap.side}</span><p className="mono mt-1 text-sm text-slate-200">{twap.token}</p></div><div className="text-right"><p className="mono text-sm font-semibold transition-colors duration-300">{formatCompactUsd(twap.liveValue)}</p><p className="mono text-xs text-slate-500">{formatNumber(twap.amount)} {displayTwapUnit(twap.token)}</p></div></div><div className="h-1.5 overflow-hidden rounded-full bg-slate-800"><div className={`h-full rounded-full transition-all duration-1000 ease-linear ${progressTone}`} style={{ width: `${Math.round(twap.liveProgress * 100)}%` }} /></div><div className="mt-2 flex justify-between gap-3 text-xs text-slate-500"><span className="mono">{shortAddress(twap.user)}</span><span>{formatDuration(twap.liveRemainingMs)} left</span></div></div>;
}

function TwapStat({ label, tone, value }: { label: string; tone: string; value: string }) {
  return <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-3"><p className="text-xs text-slate-500">{label}</p><p className={`mono mt-1 text-2xl font-semibold transition-colors duration-300 ${tone}`}>{value}</p></div>;
}

function sumTradeValue(rows: MarketTrade[]): number { return rows.reduce((sum, row) => sum + row.value, 0); }
function largestTradeValue(rows: MarketTrade[]): number { return rows.reduce((max, row) => Math.max(max, row.value), 0); }
function signedUsd(value: number): string { return `${value >= 0 ? "+" : "-"}${formatCompactUsd(Math.abs(value))}`; }
function clamp(value: number, min: number, max: number): number { return Math.min(max, Math.max(min, value)); }
function shortAddress(address: string): string { return address.length > 18 ? `${address.slice(0, 8)}...${address.slice(-6)}` : address; }
function spotDisplayPair(symbol: string): string { return symbol === "ZEC" ? "uZEC/USDC spot" : `${symbol}/USDC spot`; }
function displayTwapUnit(token: string): string { return token.replace(/-USD$/, ""); }
function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1_000));
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}
function valueTone(value: number | null): string { if (value === null) return "text-slate-300"; if (value > 0) return "text-emerald-300"; if (value < 0) return "text-rose-300"; return "text-slate-300"; }
