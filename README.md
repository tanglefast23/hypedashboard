# HYPE Dashboard

A public, read-only, desktop-first dashboard for HYPE token flow and Hyperliquid activity.

## V1 scope

- Header shows `HYPE` beside the live price
- First row: 5M, 15M, 30M, 1H, 4H, 12H, and 1D percentage change
- Second row: volume for the same time periods
- HYPE volume chart with Day, Week, and Month pills: Day shows 24 hourly bars; Week shows 7 daily bars; Month shows 30 daily bars
- Separate HYPE perps and HYPE/USDC spot market buy/sell trade panels with timeframe pills; each side shows the top 50 trades by USD value with scrolling after 10 rows
- Separate HYPE perps and HYPE/USDC spot filled limit buy/sell panels inferred from completed trades; each side shows the top 50 fills by USD value with scrolling after 10 rows
- Live HYPE TWAP buy pressure with SPOT / PERPS / S+P filters, Next 5m/15m/1h/24h flow, plus a scrollable active TWAP section
- No wallet connect, auth, database, or trading actions

## Data sources

- Hyperliquid public API primary: `https://api.hyperliquid.xyz/info`
- Hyperliquid UI API fallback: `https://api-ui.hyperliquid.xyz/info`
- CoinGecko public API: `https://api.coingecko.com/api/v3/coins/hyperliquid`
- HypurrScan TWAP feed: `https://api.hypurrscan.io/twap/*`

## Refresh / rate limits

The dashboard refreshes every 30 seconds and Vercel caches `/api/dashboard` for 30 seconds with 90 seconds stale-while-revalidate. This keeps the UI fresh without hammering Hyperliquid's public API. Hyperliquid `recentTrades` returns only the latest public trades, not a full historical 1D trade tape; full-day market and filled-limit trade rows require storing trades over time.

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
