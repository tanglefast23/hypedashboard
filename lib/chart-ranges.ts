export type ChartRangeId = "30m" | "1h" | "4h" | "1d" | "7d" | "30d";

export type ChartRange = {
  id: ChartRangeId;
  label: string;
  interval: "1m" | "5m" | "15m" | "1h" | "4h";
  durationMs: number;
};

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const CHART_RANGES: ChartRange[] = [
  { id: "30m", label: "30M", interval: "1m", durationMs: 30 * MINUTE },
  { id: "1h", label: "1H", interval: "1m", durationMs: HOUR },
  { id: "4h", label: "4H", interval: "5m", durationMs: 4 * HOUR },
  { id: "1d", label: "1D", interval: "15m", durationMs: DAY },
  { id: "7d", label: "7D", interval: "1h", durationMs: 7 * DAY },
  { id: "30d", label: "30D", interval: "4h", durationMs: 30 * DAY },
];

export function getChartRangeOptions(): ChartRange[] {
  return CHART_RANGES;
}

export function getChartRange(id: string | null | undefined): ChartRange {
  return CHART_RANGES.find((range) => range.id === id) ?? CHART_RANGES[3];
}
