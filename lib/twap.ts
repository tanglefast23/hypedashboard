export type TwapInput = {
  totalSize: number;
  durationMinutes: number;
  price: number;
};

export type TwapPlan = {
  durationMinutes: number;
  estimatedNotional: number;
  maxSlippagePercent: number;
  sliceCount: number;
  sliceIntervalSeconds: number;
  sliceNotional: number;
  sliceSize: number;
  totalSize: number;
};

const SLICE_INTERVAL_SECONDS = 30;
const MAX_SLIPPAGE_PERCENT = 3;
const MIN_DURATION_MINUTES = 1;
const MAX_DURATION_MINUTES = 1440;

export function calculateTwapPlan(input: TwapInput): TwapPlan {
  const durationMinutes = clamp(input.durationMinutes, MIN_DURATION_MINUTES, MAX_DURATION_MINUTES);
  const sliceCount = Math.max(1, Math.floor((durationMinutes * 60) / SLICE_INTERVAL_SECONDS));
  const totalSize = Math.max(0, input.totalSize);
  const estimatedNotional = totalSize * Math.max(0, input.price);
  return {
    durationMinutes,
    estimatedNotional,
    maxSlippagePercent: MAX_SLIPPAGE_PERCENT,
    sliceCount,
    sliceIntervalSeconds: SLICE_INTERVAL_SECONDS,
    sliceNotional: estimatedNotional / sliceCount,
    sliceSize: totalSize / sliceCount,
    totalSize,
  };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
