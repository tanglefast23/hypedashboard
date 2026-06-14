import type { FlowTimeframeId, HeaderTimeframeId, HourlyVolumeBar, LimitOrderLevel, MarketTrade, TimeframeId } from "./order-flow";

export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type HypeMarket = {
  price: number;
  headerChanges: Record<HeaderTimeframeId, number | null>;
  changes: Record<TimeframeId, number | null>;
  volumes: Record<TimeframeId, number | null>;
  marketCap: number | null;
  fdv: number | null;
  volume24h: number | null;
};

export type HypeTwap = {
  amount: number;
  endTime: number;
  hash: string;
  progress: number;
  remainingMs: number;
  side: "BUY" | "SELL";
  startTime: number;
  token: "HYPE" | "HYPE-USD";
  user: string;
  value: number;
};

export type HypeTwapData = {
  pressure: {
    next1h: number;
    next24h: number;
  };
  rows: HypeTwap[];
};

export type VenueOrderFlowData = {
  limitBook: Record<FlowTimeframeId, { buys: LimitOrderLevel[]; sells: LimitOrderLevel[] }>;
  marketTrades: Record<FlowTimeframeId, { buys: MarketTrade[]; sells: MarketTrade[] }>;
};

export type OrderFlowData = {
  hourlyVolume: HourlyVolumeBar[];
  perps: VenueOrderFlowData;
  spot: VenueOrderFlowData;
};

export type DashboardData = {
  generatedAt: string;
  hype: HypeMarket;
  twaps: HypeTwapData;
  orderFlow: OrderFlowData;
};
