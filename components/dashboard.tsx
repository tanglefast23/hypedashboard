"use client";

import { RefreshCcw } from "lucide-react";
import { useEffect, useState } from "react";

type SortKey = "date" | "price" | "size" | "value";
type SortDirection = "asc" | "desc";
type SortState = { key: SortKey; direction: SortDirection } | null;
type SeenMap = Record<string, number>;
type VolumeRange = "day" | "month";
import { FLOW_TIMEFRAMES, HEADER_TIMEFRAMES, PERFORMANCE_TIMEFRAMES, type FlowTimeframeId, type HeaderTimeframeId, type LimitOrderLevel, type MarketTrade } from "../lib/order-flow";
import { formatCompactUsd, formatCompactUsdOneDecimal, formatNumber, formatPercent, formatUsd } from "../lib/format";
import type { DashboardData, HypeTwap } from "../lib/types";

type Status = { data: DashboardData | null; error: string | null; loading: boolean };

type Props = { initialData: DashboardData };

export function Dashboard({ initialData }: Props) {
  const [status, setStatus] = useState<Status>({ data: initialData, error: null, loading: false });
  const [limitFrame, setLimitFrame] = useState<FlowTimeframeId>("5m");
  const [marketFrame, setMarketFrame] = useState<FlowTimeframeId>("5m");
  const [volumeRange, setVolumeRange] = useState<VolumeRange>("day");
  const [seenMap, setSeenMap] = useState<SeenMap>(() => addLimitRowsToSeenMap({}, initialData));

  useEffect(() => {
    const timer = window.setInterval(() => { void refresh(setStatus, setSeenMap); }, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const data = status.data ?? initialData;

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-5 md:px-8 md:py-8">
      <Header data={data} loading={status.loading} onRefresh={() => void refresh(setStatus, setSeenMap)} />
      {status.error ? <ErrorBanner message={status.error} /> : null}
      <PerformanceGrid data={data} />
      <VolumeBarChart data={data} range={volumeRange} onRange={setVolumeRange} />
      <section className="grid gap-6 xl:grid-cols-2">
        <OrderFlowCard frame={limitFrame} kind="limit" onFrame={setLimitFrame} seenMap={seenMap} title="Perps Limit Buys / Sells" buys={data.orderFlow.perps.limitBook[limitFrame].buys} sells={data.orderFlow.perps.limitBook[limitFrame].sells} venue="HYPE perps" />
        <OrderFlowCard frame={limitFrame} kind="limit" onFrame={setLimitFrame} seenMap={seenMap} title="Spot Limit Buys / Sells" buys={data.orderFlow.spot.limitBook[limitFrame].buys} sells={data.orderFlow.spot.limitBook[limitFrame].sells} venue="HYPE/USDC spot" />
        <OrderFlowCard frame={marketFrame} kind="market" onFrame={setMarketFrame} seenMap={seenMap} title="Perps Market Buys / Sells" buys={data.orderFlow.perps.marketTrades[marketFrame].buys} sells={data.orderFlow.perps.marketTrades[marketFrame].sells} venue="HYPE perps" />
        <OrderFlowCard frame={marketFrame} kind="market" onFrame={setMarketFrame} seenMap={seenMap} title="Spot Market Buys / Sells" buys={data.orderFlow.spot.marketTrades[marketFrame].buys} sells={data.orderFlow.spot.marketTrades[marketFrame].sells} venue="HYPE/USDC spot" />
      </section>
      <section className="grid gap-6 xl:grid-cols-[minmax(360px,0.72fr)_minmax(0,1.28fr)]">
        <HypeTwapPanel data={data} />
      </section>
    </main>
  );
}

async function refresh(setStatus: React.Dispatch<React.SetStateAction<Status>>, setSeenMap: React.Dispatch<React.SetStateAction<SeenMap>>) {
  setStatus((current) => ({ ...current, loading: true, error: null }));
  try {
    const response = await fetch("/api/dashboard", { cache: "no-store" });
    if (!response.ok) throw new Error(`Dashboard refresh failed: ${response.status}`);
    const data = await response.json() as DashboardData;
    setSeenMap((current) => addLimitRowsToSeenMap(current, data));
    setStatus({ data, error: null, loading: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Refresh failed";
    setStatus((current) => ({ ...current, error: message, loading: false }));
  }
}

function Header({ data, loading, onRefresh }: { data: DashboardData; loading: boolean; onRefresh: () => void }) {
  return (
    <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:gap-4"><h1 className="text-4xl font-semibold tracking-tight md:text-6xl">HYPE</h1><div className="flex flex-wrap items-baseline gap-x-3 gap-y-2"><p className="mono text-3xl font-semibold text-emerald-300 md:text-5xl">{formatUsd(data.hype.price, 4)}</p><HeaderChangePills changes={data.hype.headerChanges} /></div></div>
      <button aria-label="Refresh dashboard" className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-700/80 bg-slate-900/60 text-slate-200 hover:bg-slate-800" onClick={onRefresh}>
        <RefreshCcw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
      </button>
    </header>
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

function VolumeBarChart({ data, onRange, range }: { data: DashboardData; onRange: (range: VolumeRange) => void; range: VolumeRange }) {
  const bars = range === "day" ? data.orderFlow.hourlyVolume : data.orderFlow.dailyVolume;
  const max = Math.max(...bars.map((bar) => bar.volumeUsd), 1);
  const subtitle = range === "day" ? "Last 24 one-hour bars from Hyperliquid candles." : "Last 30 daily bars from Hyperliquid candles.";
  return (
    <section className="rounded-3xl border border-slate-700/50 bg-slate-950/60 p-5 shadow-2xl shadow-black/20 backdrop-blur">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-xl font-semibold">HYPE Volume</h2><p className="mt-1 text-sm text-slate-400">{subtitle}</p></div><VolumeRangePills active={range} onRange={onRange} /></div>
      <div className="flex h-52 items-end gap-1 sm:gap-2">{bars.map((bar, index) => <div className="group flex h-full min-w-0 flex-1 flex-col justify-end gap-2" key={`${bar.label}-${index}`}><div className="flex min-h-0 flex-1 items-end"><div className="w-full rounded-t bg-emerald-300/70 transition group-hover:bg-emerald-200" style={{ height: `${Math.max(4, (bar.volumeUsd / max) * 100)}%` }} title={`${bar.label} ${formatCompactUsdOneDecimal(bar.volumeUsd)}`} /></div><span className="mono hidden text-center text-[10px] text-slate-500 sm:block">{bar.label}</span></div>)}</div>
    </section>
  );
}

function VolumeRangePills({ active, onRange }: { active: VolumeRange; onRange: (range: VolumeRange) => void }) {
  return <div className="flex gap-2"><button className={pillClass(active === "day")} onClick={() => onRange("day")}>Day</button><button className={pillClass(active === "month")} onClick={() => onRange("month")}>Month</button></div>;
}

function OrderFlowCard({ buys, frame, kind, onFrame, seenMap, sells, title, venue }: { buys: LimitOrderLevel[] | MarketTrade[]; frame: FlowTimeframeId; kind: "limit" | "market"; onFrame: (frame: FlowTimeframeId) => void; seenMap: SeenMap; sells: LimitOrderLevel[] | MarketTrade[]; title: string; venue: string }) {
  return (
    <section className="rounded-3xl border border-slate-700/50 bg-slate-950/60 p-5 shadow-2xl shadow-black/20 backdrop-blur">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><h2 className="text-xl font-semibold">{title}</h2><p className="mt-1 text-sm text-slate-400">Top 15 {venue} {kind === "limit" ? "book levels" : "recent executed trades"}.</p></div><Pills active={frame} onFrame={onFrame} /></div>
      <div className="grid gap-4 md:grid-cols-2"><FlowTable kind={kind} rows={buys} seenMap={seenMap} side="BUY" /><FlowTable kind={kind} rows={sells} seenMap={seenMap} side="SELL" /></div>
    </section>
  );
}

function Pills({ active, onFrame }: { active: FlowTimeframeId; onFrame: (frame: FlowTimeframeId) => void }) {
  return <div className="flex flex-wrap gap-2">{FLOW_TIMEFRAMES.map((frame) => <button className={pillClass(frame.id === active)} key={frame.id} onClick={() => onFrame(frame.id)}>{frame.label}</button>)}</div>;
}

function pillClass(active: boolean): string {
  const base = "mono rounded-full border px-3 py-1.5 text-xs transition";
  return active ? `${base} border-emerald-300 bg-emerald-300 text-slate-950` : `${base} border-slate-700 bg-slate-900/70 text-slate-300 hover:border-slate-500`;
}

function FlowTable({ kind, rows, seenMap, side }: { kind: "limit" | "market"; rows: (LimitOrderLevel | MarketTrade)[]; seenMap: SeenMap; side: "BUY" | "SELL" }) {
  const [sort, setSort] = useState<SortState>(null);
  const sortedRows = sortRows(rows, sort, kind, side, seenMap);
  return (
    <div><div className={`mb-2 mono text-sm font-semibold ${side === "BUY" ? "text-emerald-300" : "text-rose-300"}`}>{side}</div><div className="overflow-hidden rounded-2xl border border-slate-800"><table className="w-full text-left text-xs"><thead className="bg-slate-900/70 text-slate-500"><tr><SortableHead label="Date" sortKey="date" sort={sort} onSort={setSort} padded /><SortableHead label="Price" sortKey="price" sort={sort} onSort={setSort} /><SortableHead label="Size" sortKey="size" sort={sort} onSort={setSort} /><SortableHead label="Value" sortKey="value" sort={sort} onSort={setSort} /></tr></thead><tbody>{sortedRows.map((row, index) => <tr className="border-t border-slate-800/80" key={`${side}-${rowKey(row)}-${index}`}><td className="mono px-3 py-2 text-slate-400">{formatElapsed(getRowTime(row, kind, side, seenMap))}</td><td className="mono">{formatUsd(row.price, 4)}</td><td className="mono">{formatNumber(row.size)}</td><td className="mono">{formatCompactUsd(row.value)}</td></tr>)}</tbody></table></div></div>
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

function sortRows(rows: (LimitOrderLevel | MarketTrade)[], sort: SortState, kind: "limit" | "market", side: "BUY" | "SELL", seenMap: SeenMap) {
  if (!sort) return rows;
  return [...rows].sort((a, b) => (valueForSort(a, sort.key, kind, side, seenMap) - valueForSort(b, sort.key, kind, side, seenMap)) * (sort.direction === "asc" ? 1 : -1));
}

function valueForSort(row: LimitOrderLevel | MarketTrade, key: SortKey, kind: "limit" | "market", side: "BUY" | "SELL", seenMap: SeenMap): number {
  if (key === "date") return getRowTime(row, kind, side, seenMap);
  return row[key];
}

function getRowTime(row: LimitOrderLevel | MarketTrade, kind: "limit" | "market", side: "BUY" | "SELL", seenMap: SeenMap): number {
  if (kind === "market" && "time" in row) return row.time;
  return seenMap[seenKey(side, row)] ?? Date.now();
}

function rowKey(row: LimitOrderLevel | MarketTrade): string {
  return `${row.price}-${row.size}-${row.value}`;
}

function seenKey(side: "BUY" | "SELL", row: LimitOrderLevel | MarketTrade): string {
  return `${side}-${rowKey(row)}`;
}

function addLimitRowsToSeenMap(current: SeenMap, data: DashboardData): SeenMap {
  const now = Date.now();
  const next = { ...current };
  [data.orderFlow.perps, data.orderFlow.spot].forEach((venue) => {
    Object.values(venue.limitBook).forEach((book) => {
      book.buys.forEach((row) => { next[seenKey("BUY", row)] ??= now; });
      book.sells.forEach((row) => { next[seenKey("SELL", row)] ??= now; });
    });
  });
  return next;
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
  return (
    <Card title="TWAPs HYPE Buy Pressure" subtitle="Live active TWAP flow from HypurrScan, filtered to HYPE spot + HYPE-USD perps.">
      <div className="grid gap-3 sm:grid-cols-2"><TwapStat label="Next 1h" value={signedUsd(data.twaps.pressure.next1h)} tone={valueTone(data.twaps.pressure.next1h)} /><TwapStat label="Next 24h" value={signedUsd(data.twaps.pressure.next24h)} tone={valueTone(data.twaps.pressure.next24h)} /></div>
      <div className="mt-5 space-y-3"><div className="flex items-center justify-between text-sm"><span className="text-slate-400">Active HYPE TWAPs</span><span className="mono text-slate-500">{data.twaps.rows.length}</span></div>{data.twaps.rows.length ? data.twaps.rows.map((twap) => <TwapRow key={twap.hash} twap={twap} />) : <p className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 text-sm text-slate-500">No active HYPE TWAPs right now.</p>}</div>
    </Card>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return <section className="rounded-3xl border border-slate-700/50 bg-slate-950/60 p-5 shadow-2xl shadow-black/20 backdrop-blur"><div className="mb-5"><h2 className="text-xl font-semibold">{title}</h2><p className="mt-1 text-sm text-slate-400">{subtitle}</p></div>{children}</section>;
}

function TwapRow({ twap }: { twap: HypeTwap }) {
  return <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-3"><div className="mb-2 flex items-start justify-between gap-3"><div><span className={`mono text-xs font-semibold ${twap.side === "BUY" ? "text-emerald-300" : "text-rose-300"}`}>{twap.side}</span><p className="mono mt-1 text-sm text-slate-200">{twap.token}</p></div><div className="text-right"><p className="mono text-sm font-semibold">{formatCompactUsd(twap.value)}</p><p className="mono text-xs text-slate-500">{formatNumber(twap.amount)} HYPE</p></div></div><div className="h-1.5 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-emerald-300" style={{ width: `${Math.round(twap.progress * 100)}%` }} /></div><div className="mt-2 flex justify-between gap-3 text-xs text-slate-500"><span className="mono">{shortAddress(twap.user)}</span><span>{formatDuration(twap.remainingMs)} left</span></div></div>;
}

function TwapStat({ label, tone, value }: { label: string; tone: string; value: string }) {
  return <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-3"><p className="text-xs text-slate-500">{label}</p><p className={`mono mt-1 text-2xl font-semibold ${tone}`}>{value}</p></div>;
}

function signedUsd(value: number): string { return `${value >= 0 ? "+" : "-"}${formatCompactUsd(Math.abs(value))}`; }
function shortAddress(address: string): string { return address.length > 18 ? `${address.slice(0, 8)}...${address.slice(-6)}` : address; }
function formatDuration(ms: number): string { const minutes = Math.max(0, Math.round(ms / 60_000)); if (minutes < 60) return `${minutes}m`; const hours = Math.floor(minutes / 60); const remainingMinutes = minutes % 60; return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`; }
function valueTone(value: number | null): string { if (value === null) return "text-slate-300"; if (value > 0) return "text-emerald-300"; if (value < 0) return "text-rose-300"; return "text-slate-300"; }
