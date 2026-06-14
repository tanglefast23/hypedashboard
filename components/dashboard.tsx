"use client";

import { RefreshCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { FLOW_TIMEFRAMES, PERFORMANCE_TIMEFRAMES, type FlowTimeframeId, type LimitOrderLevel, type MarketTrade } from "../lib/order-flow";
import { formatCompactUsd, formatNumber, formatPercent, formatUsd } from "../lib/format";
import type { DashboardData, HypeTwap } from "../lib/types";

type Status = { data: DashboardData | null; error: string | null; loading: boolean };

type Props = { initialData: DashboardData };

export function Dashboard({ initialData }: Props) {
  const [status, setStatus] = useState<Status>({ data: initialData, error: null, loading: false });
  const [limitFrame, setLimitFrame] = useState<FlowTimeframeId>("5m");
  const [marketFrame, setMarketFrame] = useState<FlowTimeframeId>("5m");

  useEffect(() => {
    const timer = window.setInterval(() => { void refresh(setStatus); }, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const data = status.data ?? initialData;
  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-5 md:px-8 md:py-8">
      <Header data={data} loading={status.loading} onRefresh={() => void refresh(setStatus)} />
      {status.error ? <ErrorBanner message={status.error} /> : null}
      <PerformanceGrid data={data} />
      <VolumeBarChart data={data} />
      <section className="grid gap-6 xl:grid-cols-2">
        <OrderFlowCard frame={limitFrame} kind="limit" onFrame={setLimitFrame} title="Limit Buys / Sells" buys={data.orderFlow.limitBook[limitFrame].buys} sells={data.orderFlow.limitBook[limitFrame].sells} />
        <OrderFlowCard frame={marketFrame} kind="market" onFrame={setMarketFrame} title="Market Buys / Sells" buys={data.orderFlow.marketTrades[marketFrame].buys} sells={data.orderFlow.marketTrades[marketFrame].sells} />
      </section>
      <section className="grid gap-6 xl:grid-cols-[minmax(360px,0.72fr)_minmax(0,1.28fr)]">
        <HypeTwapPanel data={data} />
      </section>
    </main>
  );
}

async function refresh(setStatus: React.Dispatch<React.SetStateAction<Status>>) {
  setStatus((current) => ({ ...current, loading: true, error: null }));
  try {
    const response = await fetch("/api/dashboard", { cache: "no-store" });
    if (!response.ok) throw new Error(`Dashboard refresh failed: ${response.status}`);
    const data = await response.json() as DashboardData;
    setStatus({ data, error: null, loading: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Refresh failed";
    setStatus((current) => ({ ...current, error: message, loading: false }));
  }
}

function Header({ data, loading, onRefresh }: { data: DashboardData; loading: boolean; onRefresh: () => void }) {
  return (
    <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div className="flex items-end gap-4"><h1 className="text-4xl font-semibold tracking-tight md:text-6xl">HYPE</h1><p className="mono pb-1 text-3xl font-semibold text-emerald-300 md:text-5xl">{formatUsd(data.hype.price, 4)}</p></div>
      <button className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-700/80 bg-slate-900/60 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800" onClick={onRefresh}>
        <RefreshCcw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
        <span className="mono">{new Date(data.generatedAt).toLocaleTimeString()}</span>
      </button>
    </header>
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

function VolumeBarChart({ data }: { data: DashboardData }) {
  const max = Math.max(...data.orderFlow.hourlyVolume.map((bar) => bar.volumeUsd), 1);
  return (
    <section className="rounded-3xl border border-slate-700/50 bg-slate-950/60 p-5 shadow-2xl shadow-black/20 backdrop-blur">
      <div className="mb-4"><h2 className="text-xl font-semibold">Hourly HYPE Volume</h2><p className="mt-1 text-sm text-slate-400">Last 24 one-hour bars from Hyperliquid candles.</p></div>
      <div className="flex h-52 items-end gap-1 sm:gap-2">{data.orderFlow.hourlyVolume.map((bar) => <div className="group flex min-w-0 flex-1 flex-col items-center gap-2" key={bar.label}><div className="w-full rounded-t bg-emerald-300/70 transition group-hover:bg-emerald-200" style={{ height: `${Math.max(4, (bar.volumeUsd / max) * 100)}%` }} title={`${bar.label}:00 ${formatCompactUsd(bar.volumeUsd)}`} /><span className="mono hidden text-[10px] text-slate-500 sm:block">{bar.label}</span></div>)}</div>
    </section>
  );
}

function OrderFlowCard({ buys, frame, kind, onFrame, sells, title }: { buys: LimitOrderLevel[] | MarketTrade[]; frame: FlowTimeframeId; kind: "limit" | "market"; onFrame: (frame: FlowTimeframeId) => void; sells: LimitOrderLevel[] | MarketTrade[]; title: string }) {
  return (
    <section className="rounded-3xl border border-slate-700/50 bg-slate-950/60 p-5 shadow-2xl shadow-black/20 backdrop-blur">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><h2 className="text-xl font-semibold">{title}</h2><p className="mt-1 text-sm text-slate-400">Top 15 HYPE {kind === "limit" ? "book levels" : "executed trades"}.</p></div><Pills active={frame} onFrame={onFrame} /></div>
      <div className="grid gap-4 md:grid-cols-2"><FlowTable rows={buys} side="BUY" /><FlowTable rows={sells} side="SELL" /></div>
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

function FlowTable({ rows, side }: { rows: (LimitOrderLevel | MarketTrade)[]; side: "BUY" | "SELL" }) {
  return (
    <div><div className={`mb-2 mono text-sm font-semibold ${side === "BUY" ? "text-emerald-300" : "text-rose-300"}`}>{side}</div><div className="overflow-hidden rounded-2xl border border-slate-800"><table className="w-full text-left text-xs"><thead className="bg-slate-900/70 text-slate-500"><tr><th className="px-3 py-2">Price</th><th>Size</th><th>Value</th></tr></thead><tbody>{rows.map((row, index) => <tr className="border-t border-slate-800/80" key={`${side}-${index}`}><td className="mono px-3 py-2">{formatUsd(row.price, 4)}</td><td className="mono">{formatNumber(row.size)}</td><td className="mono">{formatCompactUsd(row.value)}</td></tr>)}</tbody></table></div></div>
  );
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
