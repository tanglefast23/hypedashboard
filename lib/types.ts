import type { FlowTimeframeId, HeaderTimeframeId, MarketTrade, TimeframeId, VolumeBar } from "./order-flow";

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
  asset: number;
  durationMs: number;
  endTime: number;
  hash: string;
  progress: number;
  remainingMs: number;
  side: "BUY" | "SELL";
  startTime: number;
  token: string;
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
  marketTrades: Record<FlowTimeframeId, { buys: MarketTrade[]; sells: MarketTrade[] }>;
  limitFills: Record<FlowTimeframeId, { buys: MarketTrade[]; sells: MarketTrade[] }>;
};

export type OrderFlowData = {
  hourlyVolume: VolumeBar[];
  weeklyVolume: VolumeBar[];
  dailyVolume: VolumeBar[];
  perps: VenueOrderFlowData;
  spot: VenueOrderFlowData;
};

export type AccountPerpPosition = {
  coin: string;
  entryPx: number | null;
  liquidationPx: number | null;
  marginUsed: number | null;
  positionValue: number;
  returnOnEquity: number | null;
  side: "LONG" | "SHORT";
  size: number;
  unrealizedPnl: number | null;
};

export type AccountPerpTwapGroup = {
  coin: string;
  position: AccountPerpPosition;
  rows: HypeTwap[];
};

export type AccountPerpWatchData = {
  address: string;
  groups: AccountPerpTwapGroup[];
};

export type DashboardData = {
  generatedAt: string;
  hype: HypeMarket;
  twaps: HypeTwapData;
  orderFlow: OrderFlowData;
  accountPerps: AccountPerpWatchData;
};
