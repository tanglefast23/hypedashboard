# HYPE Dashboard

A public, read-only, desktop-first dashboard for HYPE token flow and Hyperliquid activity.

## V1 scope

- Header shows `HYPE` beside the live price
- First row: 5M, 15M, 30M, 1H, 4H, 12H, and 1D percentage change
- Second row: volume for the same time periods
- 24 hourly volume bars for the past day
- Separate HYPE perps and HYPE/USDC spot limit buy/sell book panels with timeframe pills
- Separate HYPE perps and HYPE/USDC spot recent market buy/sell trade panels with timeframe pills
- Live HYPE TWAP buy pressure for the next 1h and 24h, plus active HYPE TWAP rows
- No wallet connect, auth, database, or trading actions

## Data sources

- Hyperliquid public API primary: `https://api.hyperliquid.xyz/info`
- Hyperliquid UI API fallback: `https://api-ui.hyperliquid.xyz/info`
- CoinGecko public API: `https://api.coingecko.com/api/v3/coins/hyperliquid`
- HypurrScan TWAP feed: `https://api.hypurrscan.io/twap/*`

## Refresh / rate limits

The dashboard refreshes every 30 seconds and Vercel caches `/api/dashboard` for 30 seconds with 90 seconds stale-while-revalidate. This keeps the UI fresh without hammering Hyperliquid's public API. Hyperliquid `recentTrades` returns only the latest public trades, not a full historical 1D trade tape; full-day market trade rows require storing trades over time.

## Local development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Environment variables

None are required for v1. If a CoinGecko API key is added later, keep it server-side and do not prefix it with `NEXT_PUBLIC_`.
