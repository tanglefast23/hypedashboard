export function formatUsd(value: number | null, maximumFractionDigits = 2): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits,
  }).format(value);
}

export function formatCompactUsd(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `$${formatCompact(value)}`;
}

export function formatPercent(value: number | null, digits = 2): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

export function formatNumber(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return formatCompact(value);
}

function formatCompact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${trimDecimals(value / 1_000_000_000)}B`;
  if (abs >= 1_000_000) return `${trimDecimals(value / 1_000_000)}M`;
  if (abs >= 1_000) return `${trimDecimals(value / 1_000)}K`;
  return trimDecimals(value);
}

function trimDecimals(value: number): string {
  return value.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}
