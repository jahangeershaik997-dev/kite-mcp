# Kite MCP Server — Setup Guide

## Prerequisites
- Node.js 18+ installed
- ngrok account (free at ngrok.com)
- Zerodha Kite Connect app credentials

---

## Step 1 — Install dependencies
```
npm install
```

---

## Step 2 — Add your API Secret to .env
Open `.env` and replace `your_api_secret_here` with your actual API secret from:
https://developers.kite.trade/apps → click Jahangeer Shaik app → copy API Secret

---

## Step 3 — Set Redirect URL in Kite Connect
Go to your app settings on developers.kite.trade and set:
**Redirect URL:** `http://127.0.0.1:5000/callback`

---

## Step 4 — Get daily access token (do this every morning)
```
npm run auth
```
This opens Zerodha login in your browser → logs in → saves token automatically.

---

## Step 5 — Start MCP server
```
npm start
```
Server runs on: http://localhost:3000/mcp

---

## Step 6 — Start ngrok tunnel
```
ngrok http 3000
```
Copy the HTTPS URL shown e.g: `https://abc123.ngrok-free.app`

---

## Step 7 — Add to Claude.ai
1. Go to Claude.ai → Settings → Connectors → Add custom connector
2. Name: `Kite Zerodha`
3. URL: `https://abc123.ngrok-free.app/mcp`
4. Click Add ✅

---

## Daily Routine (market days)
1. `npm run auth` → login once
2. `npm start` → keep running
3. `ngrok http 3000` → keep running
4. Start chatting with Claude about your trades!

---

## Available Tools in Claude
- get_quote, get_ltp, get_ohlc, get_historical_data
- get_positions, get_holdings, get_margins
- get_orders, get_trades, place_order, modify_order, cancel_order
- get_gtts, place_gtt, modify_gtt, delete_gtt
- search_instruments
