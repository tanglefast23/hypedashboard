"use client";

import { Activity, Database, RefreshCcw, TrendingUp, Waves } from "lucide-react";
import { useEffect, useState } from "react";
import { getChartRangeOptions, type ChartRange } from "../lib/chart-ranges";
import { formatCompactUsd, formatNumber, formatPercent, formatUsd } from "../lib/format";
import type { Candle, DashboardData, HypeTwap } from "../lib/types";
import { PriceChart } from "./price-chart";

type Status = { data: DashboardData | null; error: string | null; loading: boolean };
type ChartStatus = { candles: Candle[]; range: ChartRange; loading: boolean; error: string | null };

type Props = { initialData: DashboardData };

export function Dashboard({ initialData }: Props) {
  const [status, setStatus] = useState<Status>({ data: initialData, error: null, loading: false });
  const [chart, setChart] = useState<ChartStatus>({
    candles: initialData.candles,
    range: getChartRangeOptions()[3],
    loading: false,
    error: null,
  });

  useEffect(() => {
    const timer = window.setInterval(() => { void refresh(setStatus); }, 15_000);
    return () => window.clearInterval(timer);
  }, []);

  const data = status.data ?? initialData;
  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-5 md:px-8 md:py-8">
      <Header data={data} loading={status.loading} onRefresh={() => void refresh(setStatus)} />
      {status.error ? <ErrorBanner message={status.error} /> : null}
      {chart.error ? <ErrorBanner message={chart.error} /> : null}
      <HeroGrid data={data} />
      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(360px,0.7fr)]">
        <Card title="Interactive HYPE Price Chart" subtitle="Drag, scroll, pinch, and use the timeline buttons for 30M to 30D views.">
          <ChartToolbar chart={chart} onSelect={(range) => void loadCandles(range, setChart)} />
          <PriceChart candles={chart.candles} />
        </Card>
        <div className="grid gap-6">
          <HypeTwapPanel data={data} />
          <PerpsTable data={data} />
        </div>
      </section>
      <Ecosystem data={data} />
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

async function loadCandles(range: ChartRange, setChart: React.Dispatch<React.SetStateAction<ChartStatus>>) {
  setChart((current) => ({ ...current, range, loading: true, error: null }));
  try {
    const response = await fetch(`/api/candles?range=${range.id}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Candle refresh failed: ${response.status}`);
    const payload = await response.json() as { candles: Candle[]; range: ChartRange };
    setChart({ candles: payload.candles, range: payload.range, loading: false, error: null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Candle refresh failed";
    setChart((current) => ({ ...current, error: message, loading: false }));
  }
}

function ChartToolbar({ chart, onSelect }: { chart: ChartStatus; onSelect: (range: ChartRange) => void }) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-slate-400">Showing <span className="mono text-emerald-300">{chart.range.label}</span> HYPE candles from Hyperliquid.</p>
      <div className="flex flex-wrap gap-2">{getChartRangeOptions().map((range) => <RangeButton key={range.id} active={range.id === chart.range.id} disabled={chart.loading} range={range} onSelect={onSelect} />)}</div>
    </div>
  );
}

function RangeButton({ active, disabled, range, onSelect }: { active: boolean; disabled: boolean; range: ChartRange; onSelect: (range: ChartRange) => void }) {
  return <button className={rangeButtonClass(active)} disabled={disabled} onClick={() => onSelect(range)}>{range.label}</button>;
}

function rangeButtonClass(active: boolean): string {
  const base = "mono rounded-full border px-3 py-1.5 text-xs transition disabled:cursor-wait disabled:opacity-50";
  return active ? `${base} border-emerald-300 bg-emerald-300 text-slate-950` : `${base} border-slate-700 bg-slate-900/70 text-slate-300 hover:border-slate-500`;
}

function Header({ data, loading, onRefresh }: { data: DashboardData; loading: boolean; onRefresh: () => void }) {
  return (
    <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div>
        <p className="mb-2 text-sm font-semibold uppercase tracking-[0.32em] text-emerald-300">Hyperliquid Mission Control</p>
        <h1 className="text-3xl font-semibold tracking-tight md:text-5xl">HYPE Dashboard</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400 md:text-base">
          Public read-only dashboard for HYPE token, Hyperliquid perps, and ecosystem TVL.
        </p>
      </div>
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

function HeroGrid({ data }: { data: DashboardData }) {
  const tiles = [
    { label: "HYPE Price", value: formatUsd(data.hype.price, 4), icon: TrendingUp, tone: "text-emerald-300" },
    { label: "24H Change", value: formatPercent(data.hype.change24h), icon: Activity, tone: valueTone(data.hype.change24h) },
    { label: "Market Cap", value: formatCompactUsd(data.hype.marketCap), icon: Database, tone: "text-slate-100" },
    { label: "24H Volume", value: formatCompactUsd(data.hype.volume24h), icon: Waves, tone: "text-slate-100" },
  ];
  return <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{tiles.map((tile) => <MetricCard key={tile.label} {...tile} />)}</section>;
}

function MetricCard({ label, value, icon: Icon, tone }: { label: string; value: string; icon: typeof Activity; tone: string }) {
  return (
    <div className="rounded-3xl border border-slate-700/50 bg-slate-950/60 p-5 shadow-2xl shadow-black/20 backdrop-blur">
      <div className="mb-6 flex items-center justify-between text-slate-400"><span className="text-sm">{label}</span><Icon className="h-5 w-5" /></div>
      <p className={`mono text-3xl font-semibold ${tone}`}>{value}</p>
    </div>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-slate-700/50 bg-slate-950/60 p-5 shadow-2xl shadow-black/20 backdrop-blur">
      <div className="mb-5"><h2 className="text-xl font-semibold">{title}</h2><p className="mt-1 text-sm text-slate-400">{subtitle}</p></div>
      {children}
    </section>
  );
}

function HypeTwapPanel({ data }: { data: DashboardData }) {
  return (
    <Card title="TWAPs HYPE Buy Pressure" subtitle="Live active TWAP flow from HypurrScan, filtered to HYPE spot + HYPE-USD perps.">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
        <TwapStat label="Next 1h" value={signedUsd(data.twaps.pressure.next1h)} tone={valueTone(data.twaps.pressure.next1h)} />
        <TwapStat label="Next 24h" value={signedUsd(data.twaps.pressure.next24h)} tone={valueTone(data.twaps.pressure.next24h)} />
      </div>
      <div className="mt-5 space-y-3">
        <div className="flex items-center justify-between text-sm"><span className="text-slate-400">Active HYPE TWAPs</span><span className="mono text-slate-500">{data.twaps.rows.length}</span></div>
        {data.twaps.rows.length ? data.twaps.rows.map((twap) => <TwapRow key={twap.hash} twap={twap} />) : <p className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 text-sm text-slate-500">No active HYPE TWAPs right now.</p>}
      </div>
    </Card>
  );
}

function TwapRow({ twap }: { twap: HypeTwap }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-3">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div><span className={`mono text-xs font-semibold ${twap.side === "BUY" ? "text-emerald-300" : "text-rose-300"}`}>{twap.side}</span><p className="mono mt-1 text-sm text-slate-200">{twap.token}</p></div>
        <div className="text-right"><p className="mono text-sm font-semibold">{formatCompactUsd(twap.value)}</p><p className="mono text-xs text-slate-500">{formatNumber(twap.amount)} HYPE</p></div>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-emerald-300" style={{ width: `${Math.round(twap.progress * 100)}%` }} /></div>
      <div className="mt-2 flex justify-between gap-3 text-xs text-slate-500"><span className="mono">{shortAddress(twap.user)}</span><span>{formatDuration(twap.remainingMs)} left</span></div>
    </div>
  );
}

function TwapStat({ label, tone, value }: { label: string; tone: string; value: string }) {
  return <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-3"><p className="text-xs text-slate-500">{label}</p><p className={`mono mt-1 text-2xl font-semibold ${tone}`}>{value}</p></div>;
}

function signedUsd(value: number): string {
  return `${value >= 0 ? "+" : "-"}${formatCompactUsd(Math.abs(value))}`;
}

function shortAddress(address: string): string {
  return address.length > 18 ? `${address.slice(0, 8)}...${address.slice(-6)}` : address;
}

function formatDuration(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

function PerpsTable({ data }: { data: DashboardData }) {
  return (
    <Card title="Top Perps" subtitle="Ranked by 24H notional volume">
      <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-sm"><thead className="text-slate-500"><tr><th className="py-3">Market</th><th>Mark</th><th>Funding</th><th>Volume</th><th>OI</th></tr></thead>
        <tbody>{data.perps.map((market) => <tr className="border-t border-slate-800/80" key={market.name}><td className="py-3 font-semibold">{market.name}</td><td className="mono">{formatUsd(market.markPrice, 4)}</td><td className={`mono ${valueTone(market.fundingRate)}`}>{formatPercent(market.fundingRate, 4)}</td><td className="mono">{formatCompactUsd(market.volume24h)}</td><td className="mono">{formatNumber(market.openInterest)}</td></tr>)}</tbody>
      </table></div>
    </Card>
  );
}

function Ecosystem({ data }: { data: DashboardData }) {
  return (
    <section className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
      <Card title="Ecosystem TVL" subtitle="DefiLlama Hyperliquid L1 chain TVL"><p className="mono text-4xl font-semibold text-emerald-300">{formatCompactUsd(data.ecosystem.chainTvl)}</p><p className="mt-4 text-sm text-slate-400">Top protocols below are filtered by DefiLlama chains containing Hyperliquid.</p></Card>
      <Card title="Top Hyperliquid Protocols" subtitle="Protocol TVL and daily change"><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{data.ecosystem.protocols.map((protocol) => <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4" key={protocol.name}><p className="font-semibold">{protocol.name}</p><p className="mono mt-3 text-2xl">{formatCompactUsd(protocol.tvl)}</p><p className={`mono mt-2 text-sm ${valueTone(protocol.change1d)}`}>{formatPercent(protocol.change1d)} 1D</p></div>)}</div></Card>
    </section>
  );
}

function valueTone(value: number | null): string {
  if (value === null) return "text-slate-300";
  if (value > 0) return "text-emerald-300";
  if (value < 0) return "text-rose-300";
  return "text-slate-300";
}
