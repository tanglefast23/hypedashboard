export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type PerpMarket = {
  name: string;
  markPrice: number;
  openInterest: number;
  volume24h: number;
  fundingRate: number;
};

export type HypeMarket = {
  price: number;
  change5m: number | null;
  change30m: number | null;
  change1h: number | null;
  change24h: number | null;
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

export type DashboardData = {
  generatedAt: string;
  hype: HypeMarket;
  candles: Candle[];
  perps: PerpMarket[];
  twaps: HypeTwapData;
};
