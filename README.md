# HYPE Dashboard

A public, read-only, desktop-first dashboard for the HYPE token and Hyperliquid activity.

## V1 scope

- HYPE price plus 5M, 30M, 1H, and 24H change, market cap, FDV, and volume
- Live HYPE TWAP buy pressure for the next 1h and 24h, plus active HYPE TWAP rows
- Top Hyperliquid perp markets by 24H notional volume
- No wallet connect, auth, database, or trading actions

## Data sources

- Hyperliquid public API: `https://api.hyperliquid.xyz/info`
- CoinGecko public API: `https://api.coingecko.com/api/v3/coins/hyperliquid`
- HypurrScan TWAP feed: `https://api.hypurrscan.io/twap/*`

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
