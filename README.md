# HYPE Dashboard

A public, read-only, desktop-first dashboard for the HYPE token and Hyperliquid ecosystem.

## V1 scope

- HYPE price plus 5M, 30M, 1H, and 24H change, market cap, FDV, and volume
- Interactive HYPE candle chart with 30M, 1H, 4H, 1D, 7D, and 30D timeline controls
- Live HYPE TWAP buy pressure for the next 1h and 24h, plus active HYPE TWAP rows
- Hyperliquid ecosystem TVL and top protocols from DefiLlama
- No wallet connect, auth, database, or trading actions

## Data sources

- Hyperliquid public API: `https://api.hyperliquid.xyz/info`
- CoinGecko public API: `https://api.coingecko.com/api/v3/coins/hyperliquid`
- DefiLlama public API: `https://api.llama.fi`

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
