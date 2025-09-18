# x402 Gateway Worker

Bootstrap Cloudflare Worker for the x402 payment gateway MVP.

## Prerequisites
- Node.js 18+
- Cloudflare account with Wrangler CLI access

## Setup
1. Install dependencies: `npm install`
2. Update `wrangler.jsonc` variables if you need a different upstream base URL, protected prefix, or payment offer defaults (price, currency, network, receiver, timeout).
3. Start local dev server: `npm run dev`
4. Visit `http://localhost:8787/api/anything` to see a 402 Payment Required response without payment headers, or hit an unprotected path like `/health` to see proxying to the upstream (`https://httpbin.org` by default).

## Deploy
- Run `npm run deploy` when ready. Wrangler will prompt for authentication if necessary.
