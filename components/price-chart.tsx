"use client";

import { useEffect, useRef } from "react";
import { CandlestickSeries, createChart, HistogramSeries, type IChartApi } from "lightweight-charts";
import type { Candle } from "../lib/types";

type Props = { candles: Candle[] };

export function PriceChart({ candles }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const height = container.clientHeight || 520;
    const chart = createChart(container, chartOptions(container.clientWidth, height));
    const candleSeries = chart.addSeries(CandlestickSeries, candleOptions);
    const volumeSeries = chart.addSeries(HistogramSeries, volumeOptions);
    candleSeries.setData(candles.map(toCandlePoint));
    volumeSeries.setData(candles.map(toVolumePoint));
    chart.timeScale().fitContent();
    chartRef.current = chart;
    const observer = new ResizeObserver(() => chart.applyOptions({ width: container.clientWidth }));
    observer.observe(container);
    return () => { observer.disconnect(); chart.remove(); chartRef.current = null; };
  }, [candles]);

  return <div ref={containerRef} className="h-[420px] w-full md:h-[520px]" />;
}

const candleOptions = {
  upColor: "#34d399",
  downColor: "#fb7185",
  borderVisible: false,
  wickUpColor: "#34d399",
  wickDownColor: "#fb7185",
};

const volumeOptions = {
  priceFormat: { type: "volume" as const },
  priceScaleId: "",
};

function chartOptions(width: number, height: number) {
  return {
    width,
    height,
    layout: { background: { color: "transparent" }, textColor: "#8793a3" },
    grid: { vertLines: { color: "rgba(148,163,184,0.08)" }, horzLines: { color: "rgba(148,163,184,0.08)" } },
    rightPriceScale: { borderColor: "rgba(148,163,184,0.16)" },
    timeScale: { borderColor: "rgba(148,163,184,0.16)" },
  };
}

function toCandlePoint(candle: Candle) {
  return { time: candle.time as never, open: candle.open, high: candle.high, low: candle.low, close: candle.close };
}

function toVolumePoint(candle: Candle) {
  const color = candle.close >= candle.open ? "rgba(52, 211, 153, 0.28)" : "rgba(251, 113, 133, 0.28)";
  return { time: candle.time as never, value: candle.volume, color };
}
