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
  dex: string;
  displayCoin: string;
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

export type HoldingDashboardData = {
  generatedAt: string;
  asset: {
    coin: string;
    price: number;
    headerChanges: Record<HeaderTimeframeId, number | null>;
    changes: Record<TimeframeId, number | null>;
    volumes: Record<TimeframeId, number | null>;
  };
  position: AccountPerpPosition | null;
  twaps: HypeTwapData;
  volume: {
    hourlyVolume: VolumeBar[];
    weeklyVolume: VolumeBar[];
    dailyVolume: VolumeBar[];
  };
  holdings: AccountPerpWatchData;
};

export type CrowdingBar = {
  label: string;
  score: number;
  value: number;
};

export type CrowdingData = {
  bars: Record<"day" | "week" | "month", CrowdingBar[]>;
  breakdown: {
    flow: number;
    fundingOi: number;
    liquidation: number;
    oiPrice: number;
    twap: number;
  };
  generatedAt: string;
  label: "Crowded Long" | "Long-Leaning" | "Balanced" | "Short-Leaning" | "Crowded Short";
  score: number;
  metrics: {
    flowNetUsd: number;
    liquidationImbalanceUsd: number | null;
    oiChange24hPercent: number | null;
    priceChange24hPercent: number | null;
    rsi14: number | null;
    rsiModifier: number;
    twapPressure1hUsd: number;
    weightedFunding: number | null;
  };
  sources: {
    funding: number | null;
    name: string;
    oiUsd: number;
    source: string;
  }[];
  summary: string;
  totalOiUsd: number;
};

export type DashboardData = {
  generatedAt: string;
  asset: { symbol: string; spotSymbol: string | null };
  hype: HypeMarket;
  twaps: HypeTwapData;
  orderFlow: OrderFlowData;
  accountPerps: AccountPerpWatchData;
  crowding: CrowdingData;
};
