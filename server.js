import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { KiteConnect } from "kiteconnect";
import { Redis } from "@upstash/redis";
import express from "express";
import { z } from "zod";
import dotenv from "dotenv";
dotenv.config();

const API_KEY = process.env.KITE_API_KEY;
const API_SECRET = process.env.KITE_API_SECRET;
const PORT = process.env.PORT || 3000;

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

async function getAccessToken() {
  const data = await redis.get("kite_token");
  if (!data) throw new Error("No access token. Visit /auth to login.");
  const parsed = typeof data === "string" ? JSON.parse(data) : data;
  const tokenDate = new Date(parsed.timestamp).toDateString();
  const today = new Date().toDateString();
  if (tokenDate !== today) throw new Error("Token expired. Visit /auth to refresh.");
  return parsed.access_token;
}

async function getKite() {
  const kc = new KiteConnect({ api_key: API_KEY });
  kc.setAccessToken(await getAccessToken());
  return kc;
}

const server = new McpServer({ name: "kite-mcp", version: "1.0.0" });

// ── MARKET DATA ──────────────────────────────────────────────
server.tool("get_quote", "Get full market quote for instruments", {
  instruments: z.array(z.string()).describe("e.g. ['NSE:RELIANCE','NSE:INFY']"),
}, async ({ instruments }) => {
  const kc = await getKite();
  const data = await kc.getQuote(instruments);
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
});

server.tool("get_ltp", "Get Last Traded Price for instruments", {
  instruments: z.array(z.string()),
}, async ({ instruments }) => {
  const kc = await getKite();
  const data = await kc.getLTP(instruments);
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
});

server.tool("get_ohlc", "Get OHLC data for instruments", {
  instruments: z.array(z.string()),
}, async ({ instruments }) => {
  const kc = await getKite();
  const data = await kc.getOHLC(instruments);
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
});

server.tool("get_historical_data", "Get historical candle data", {
  instrument_token: z.number(),
  from_date: z.string().describe("YYYY-MM-DD"),
  to_date: z.string().describe("YYYY-MM-DD"),
  interval: z.enum(["minute","3minute","5minute","10minute","15minute","30minute","60minute","day"]),
  continuous: z.boolean().optional().default(false),
}, async ({ instrument_token, from_date, to_date, interval, continuous }) => {
  const kc = await getKite();
  const data = await kc.getHistoricalData(instrument_token, interval, from_date, to_date, continuous);
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
});

// ── INSTRUMENTS ───────────────────────────────────────────────
server.tool("search_instruments", "Search instruments by exchange and symbol", {
  exchange: z.enum(["NSE","BSE","NFO","BFO","MCX","CDS"]).optional(),
  query: z.string(),
}, async ({ exchange, query }) => {
  const kc = await getKite();
  const instruments = await kc.getInstruments(exchange ? [exchange] : undefined);
  const results = instruments
    .filter(i => i.tradingsymbol.includes(query.toUpperCase()) || i.name.toUpperCase().includes(query.toUpperCase()))
    .slice(0, 20);
  return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
});

// ── PORTFOLIO ─────────────────────────────────────────────────
server.tool("get_positions", "Get current day and net positions", {}, async () => {
  const kc = await getKite();
  const data = await kc.getPositions();
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
});

server.tool("get_holdings", "Get long-term holdings in demat", {}, async () => {
  const kc = await getKite();
  const data = await kc.getHoldings();
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
});

server.tool("get_margins", "Get available margins", {
  segment: z.enum(["equity","commodity"]).optional(),
}, async ({ segment }) => {
  const kc = await getKite();
  const data = await kc.getMargins(segment);
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
});

// ── ORDERS ────────────────────────────────────────────────────
server.tool("get_orders", "Get all orders for today", {}, async () => {
  const kc = await getKite();
  const data = await kc.getOrders();
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
});

server.tool("get_trades", "Get all trades for today", {}, async () => {
  const kc = await getKite();
  const data = await kc.getTrades();
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
});

server.tool("get_order_trades", "Get trades for a specific order", {
  order_id: z.string(),
}, async ({ order_id }) => {
  const kc = await getKite();
  const data = await kc.getOrderTrades(order_id);
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
});

server.tool("place_order", "Place a buy or sell order", {
  tradingsymbol: z.string(),
  exchange: z.enum(["NSE","BSE","NFO","BFO","MCX","CDS"]),
  transaction_type: z.enum(["BUY","SELL"]),
  quantity: z.number(),
  order_type: z.enum(["MARKET","LIMIT","SL","SL-M"]),
  product: z.enum(["CNC","MIS","NRML"]),
  price: z.number().optional(),
  trigger_price: z.number().optional(),
  validity: z.enum(["DAY","IOC","TTL"]).optional().default("DAY"),
  tag: z.string().optional(),
}, async (params) => {
  const kc = await getKite();
  const data = await kc.placeOrder(kc.VARIETY_REGULAR, {
    tradingsymbol: params.tradingsymbol,
    exchange: params.exchange,
    transaction_type: params.transaction_type,
    quantity: params.quantity,
    order_type: params.order_type,
    product: params.product,
    price: params.price,
    trigger_price: params.trigger_price,
    validity: params.validity,
    tag: params.tag,
  });
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
});

server.tool("modify_order", "Modify an existing pending order", {
  order_id: z.string(),
  quantity: z.number().optional(),
  price: z.number().optional(),
  order_type: z.enum(["MARKET","LIMIT","SL","SL-M"]).optional(),
  trigger_price: z.number().optional(),
  validity: z.enum(["DAY","IOC"]).optional(),
}, async ({ order_id, ...params }) => {
  const kc = await getKite();
  const data = await kc.modifyOrder(kc.VARIETY_REGULAR, order_id, params);
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
});

server.tool("cancel_order", "Cancel a pending order", {
  order_id: z.string(),
}, async ({ order_id }) => {
  const kc = await getKite();
  const data = await kc.cancelOrder(kc.VARIETY_REGULAR, order_id);
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
});

// ── GTT ───────────────────────────────────────────────────────
server.tool("get_gtts", "Get all GTT orders", {}, async () => {
  const kc = await getKite();
  const data = await kc.getGTTs();
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
});

server.tool("place_gtt", "Place a GTT order", {
  trigger_type: z.enum(["single","two-leg"]),
  tradingsymbol: z.string(),
  exchange: z.enum(["NSE","BSE"]),
  trigger_values: z.array(z.number()),
  last_price: z.number(),
  orders: z.array(z.object({
    transaction_type: z.enum(["BUY","SELL"]),
    quantity: z.number(),
    order_type: z.enum(["LIMIT","MARKET"]),
    product: z.enum(["CNC","MIS","NRML"]),
    price: z.number(),
  })),
}, async (params) => {
  const kc = await getKite();
  const data = await kc.placeGTT({
    trigger_type: params.trigger_type === "single" ? kc.GTT_TYPE_SINGLE : kc.GTT_TYPE_OCO,
    tradingsymbol: params.tradingsymbol,
    exchange: params.exchange,
    trigger_values: params.trigger_values,
    last_price: params.last_price,
    orders: params.orders,
  });
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
});

server.tool("modify_gtt", "Modify an existing GTT order", {
  trigger_id: z.number(),
  trigger_type: z.enum(["single","two-leg"]),
  tradingsymbol: z.string(),
  exchange: z.enum(["NSE","BSE"]),
  trigger_values: z.array(z.number()),
  last_price: z.number(),
  orders: z.array(z.object({
    transaction_type: z.enum(["BUY","SELL"]),
    quantity: z.number(),
    order_type: z.enum(["LIMIT","MARKET"]),
    product: z.enum(["CNC","MIS","NRML"]),
    price: z.number(),
  })),
}, async ({ trigger_id, ...params }) => {
  const kc = await getKite();
  const data = await kc.modifyGTT(trigger_id, {
    trigger_type: params.trigger_type === "single" ? kc.GTT_TYPE_SINGLE : kc.GTT_TYPE_OCO,
    tradingsymbol: params.tradingsymbol,
    exchange: params.exchange,
    trigger_values: params.trigger_values,
    last_price: params.last_price,
    orders: params.orders,
  });
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
});

server.tool("delete_gtt", "Delete a GTT order", {
  trigger_id: z.number(),
}, async ({ trigger_id }) => {
  const kc = await getKite();
  const data = await kc.deleteGTT(trigger_id);
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
});

// ── EXPRESS APP ───────────────────────────────────────────────
const app = express();
app.use(express.json());

// MCP endpoint
app.post("/mcp", async (req, res) => {
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => transport.close());
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});
app.get("/mcp", async (req, res) => {
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => transport.close());
  await server.connect(transport);
  await transport.handleRequest(req, res);
});
app.delete("/mcp", async (req, res) => {
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => transport.close());
  await server.connect(transport);
  await transport.handleRequest(req, res);
});

// Health check
app.get("/health", (_, res) => res.json({ status: "ok", server: "kite-mcp" }));

// Auth page - step 1: redirect to Zerodha login
app.get("/auth", (req, res) => {
  const kc = new KiteConnect({ api_key: API_KEY });
  const loginUrl = kc.getLoginURL();
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Kite MCP Auth</title>
      <style>
        body { font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f5f5f5; }
        .card { background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); text-align: center; max-width: 400px; }
        h2 { color: #333; margin-bottom: 8px; }
        p { color: #666; margin-bottom: 24px; }
        a.btn { background: #ff6600; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-size: 16px; font-weight: bold; display: inline-block; }
        a.btn:hover { background: #e55a00; }
        .logo { font-size: 48px; margin-bottom: 16px; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="logo">📈</div>
        <h2>Kite MCP Server</h2>
        <p>Login with Zerodha to generate today's access token for Claude AI</p>
        <a href="${loginUrl}" class="btn">Login with Zerodha</a>
      </div>
    </body>
    </html>
  `);
});

// Auth callback - step 2: receive request_token, generate session, save to Redis
app.get("/callback", async (req, res) => {
  const { request_token, status } = req.query;
  if (status !== "success" || !request_token) {
    return res.send("<h2>❌ Login failed. <a href='/auth'>Try again</a></h2>");
  }
  try {
    const kc = new KiteConnect({ api_key: API_KEY });
    const session = await kc.generateSession(request_token, API_SECRET);
    const tokenData = {
      access_token: session.access_token,
      timestamp: new Date().toISOString(),
      user_name: session.user_name,
      user_id: session.user_id,
    };
    // Save to Redis with 28 hour expiry
    await redis.set("kite_token", JSON.stringify(tokenData), { ex: 28 * 60 * 60 });
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Kite MCP - Connected!</title>
        <style>
          body { font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f5f5f5; }
          .card { background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); text-align: center; max-width: 400px; }
          h2 { color: #2d7a2d; }
          .tick { font-size: 64px; }
          p { color: #555; }
          code { background: #f0f0f0; padding: 4px 8px; border-radius: 4px; font-size: 13px; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="tick">✅</div>
          <h2>Connected Successfully!</h2>
          <p>Welcome, <strong>${session.user_name}</strong></p>
          <p>Token saved to Redis. Claude can now access your Kite account all day!</p>
          <p style="margin-top:24px;font-size:13px;color:#999;">Come back tomorrow morning and visit <code>/auth</code> again to refresh.</p>
        </div>
      </body>
      </html>
    `);
  } catch (err) {
    res.send(`<h2>❌ Error: ${err.message}</h2><a href='/auth'>Try again</a>`);
  }
});

app.listen(PORT, () => {
  console.log(`✅ Kite MCP Server running on port ${PORT}`);
  console.log(`🔐 Auth page: http://localhost:${PORT}/auth`);
  console.log(`📡 MCP endpoint: http://localhost:${PORT}/mcp`);
});
