# HYPE Dashboard

A public, read-only, desktop-first dashboard for HYPE token flow and Hyperliquid activity.

## V1 scope

- Header shows `HYPE` beside the live price
- First row: 5M, 15M, 30M, 1H, 4H, 12H, and 1D percentage change
- Second row: volume for the same time periods
- HYPE volume chart with Day, Week, and Month pills: Day shows 24 hourly bars; Week shows 7 daily bars; Month shows 30 daily bars
- Separate HYPE perps and HYPE/USDC spot market buy/sell trade panels with timeframe pills; each side shows the top 50 trades by USD value with scrolling after 10 rows
- Separate HYPE perps and HYPE/USDC spot filled limit buy/sell panels inferred from completed trades; each side shows the top 50 fills by USD value with scrolling after 10 rows
- Live HYPE TWAP buy pressure with SPOT / PERPS / S+P filters, Next 5m/15m/1h/24h flow, math-based per-second ticking between API refreshes, plus a scrollable active TWAP section
- Watched account perp section for `0x89c0fEe4b7CA37711219092CD1c0D2b4F7AF87c1`, showing its open perp positions and active TWAP pressure for each held perp market
- No wallet connect, auth, or trading actions

## Data sources

- Hyperliquid public API primary: `https://api.hyperliquid.xyz/info`
- Hyperliquid UI API fallback: `https://api-ui.hyperliquid.xyz/info`
- CoinGecko public API: `https://api.coingecko.com/api/v3/coins/hyperliquid`
- HypurrScan TWAP feed: `https://api.hypurrscan.io/twap/*`

## Refresh / rate limits

The dashboard refreshes every 30 seconds and Vercel caches `/api/dashboard` for 30 seconds with 90 seconds stale-while-revalidate, so concurrent viewers share one upstream rebuild. Hyperliquid `recentTrades` are collected into Supabase once per minute by the Hermes `collect-trades` cron (user requests only read, never collect), and completed trade panels query that history for the selected timeframe. Crowding history bars are read through an aggregated Supabase RPC (`hype_dashboard_crowding_bars`, see `supabase/crowding_bars_rpc.sql`). The Hermes prune cron runs every 30 minutes, deleting trades older than 30 hours and crowding snapshots older than 31 days.

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

Production uses server-only Supabase variables for the rolling 31-day trade history collector:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET`

Do not expose the service-role key with a `NEXT_PUBLIC_` prefix.
