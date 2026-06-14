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
  change24h: number | null;
  marketCap: number | null;
  fdv: number | null;
  volume24h: number | null;
};

export type EcosystemProtocol = {
  name: string;
  tvl: number;
  change1d: number | null;
};

export type EcosystemTvl = {
  chainTvl: number | null;
  protocols: EcosystemProtocol[];
};

export type DashboardData = {
  generatedAt: string;
  hype: HypeMarket;
  candles: Candle[];
  perps: PerpMarket[];
  ecosystem: EcosystemTvl;
};
