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

export function formatCompactUsdOneDecimal(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `$${formatCompact(value, 1)}`;
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

function formatCompact(value: number, digits = 2): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${trimDecimals(value / 1_000_000_000, digits)}B`;
  if (abs >= 1_000_000) return `${trimDecimals(value / 1_000_000, digits)}M`;
  if (abs >= 1_000) return `${trimDecimals(value / 1_000, digits)}K`;
  return trimDecimals(value, digits);
}

function trimDecimals(value: number, digits = 2): string {
  return value.toFixed(digits).replace(/\.0+$/, "").replace(/(\.\d*[1-9])0+$/, "$1");
}
