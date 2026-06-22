import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { KiteConnect } from "kiteconnect";
import express from "express";
import { readFileSync, existsSync } from "fs";
import { z } from "zod";
import dotenv from "dotenv";
dotenv.config();

const API_KEY = process.env.KITE_API_KEY;
const PORT = process.env.PORT || 3000;

function getAccessToken() {
  const tokenFile = ".access_token";
  if (!existsSync(tokenFile)) {
    throw new Error("No access token found. Run: npm run auth");
  }
  const data = JSON.parse(readFileSync(tokenFile, "utf8"));
  const tokenDate = new Date(data.timestamp).toDateString();
  const today = new Date().toDateString();
  if (tokenDate !== today) {
    throw new Error("Access token expired. Run: npm run auth to get a new one.");
  }
  return data.access_token;
}

function getKite() {
  const kc = new KiteConnect({ api_key: API_KEY });
  kc.setAccessToken(getAccessToken());
  return kc;
}

const server = new McpServer({
  name: "kite-mcp",
  version: "1.0.0",
});

// ── MARKET DATA ──────────────────────────────────────────────
server.tool("get_quote", "Get full market quote for instruments (e.g. NSE:RELIANCE)", {
  instruments: z.array(z.string()).describe("e.g. ['NSE:RELIANCE','NSE:INFY']"),
}, async ({ instruments }) => {
  const kc = getKite();
  const data = await kc.getQuote(instruments);
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
});

server.tool("get_ltp", "Get Last Traded Price for instruments", {
  instruments: z.array(z.string()).describe("e.g. ['NSE:RELIANCE']"),
}, async ({ instruments }) => {
  const kc = getKite();
  const data = await kc.getLTP(instruments);
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
});

server.tool("get_ohlc", "Get OHLC data for instruments", {
  instruments: z.array(z.string()).describe("e.g. ['NSE:NIFTY 50']"),
}, async ({ instruments }) => {
  const kc = getKite();
  const data = await kc.getOHLC(instruments);
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
});

server.tool("get_historical_data", "Get historical candle data for an instrument", {
  instrument_token: z.number().describe("Instrument token (get from search_instruments)"),
  from_date: z.string().describe("From date YYYY-MM-DD"),
  to_date: z.string().describe("To date YYYY-MM-DD"),
  interval: z.enum(["minute","3minute","5minute","10minute","15minute","30minute","60minute","day"]),
  continuous: z.boolean().optional().default(false),
}, async ({ instrument_token, from_date, to_date, interval, continuous }) => {
  const kc = getKite();
  const data = await kc.getHistoricalData(instrument_token, interval, from_date, to_date, continuous);
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
});

// ── INSTRUMENTS ───────────────────────────────────────────────
server.tool("search_instruments", "Search instruments by exchange and symbol name", {
  exchange: z.enum(["NSE","BSE","NFO","BFO","MCX","CDS"]).optional(),
  query: z.string().describe("Symbol name to search e.g. RELIANCE"),
}, async ({ exchange, query }) => {
  const kc = getKite();
  const instruments = await kc.getInstruments(exchange ? [exchange] : undefined);
  const results = instruments
    .filter(i => i.tradingsymbol.includes(query.toUpperCase()) || i.name.toUpperCase().includes(query.toUpperCase()))
    .slice(0, 20);
  return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
});

// ── PORTFOLIO ─────────────────────────────────────────────────
server.tool("get_positions", "Get current day and net positions", {}, async () => {
  const kc = getKite();
  const data = await kc.getPositions();
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
});

server.tool("get_holdings", "Get long-term holdings in demat", {}, async () => {
  const kc = getKite();
  const data = await kc.getHoldings();
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
});

server.tool("get_margins", "Get available margins (equity and commodity)", {
  segment: z.enum(["equity","commodity"]).optional(),
}, async ({ segment }) => {
  const kc = getKite();
  const data = await kc.getMargins(segment);
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
});

// ── ORDERS ────────────────────────────────────────────────────
server.tool("get_orders", "Get all orders for today", {}, async () => {
  const kc = getKite();
  const data = await kc.getOrders();
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
});

server.tool("get_trades", "Get all trades (filled orders) for today", {}, async () => {
  const kc = getKite();
  const data = await kc.getTrades();
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
});

server.tool("get_order_trades", "Get trades for a specific order", {
  order_id: z.string(),
}, async ({ order_id }) => {
  const kc = getKite();
  const data = await kc.getOrderTrades(order_id);
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
});

server.tool("place_order", "Place a buy or sell order", {
  tradingsymbol: z.string().describe("e.g. RELIANCE"),
  exchange: z.enum(["NSE","BSE","NFO","BFO","MCX","CDS"]),
  transaction_type: z.enum(["BUY","SELL"]),
  quantity: z.number(),
  order_type: z.enum(["MARKET","LIMIT","SL","SL-M"]),
  product: z.enum(["CNC","MIS","NRML"]).describe("CNC=delivery, MIS=intraday, NRML=F&O"),
  price: z.number().optional().describe("Required for LIMIT orders"),
  trigger_price: z.number().optional().describe("Required for SL/SL-M orders"),
  validity: z.enum(["DAY","IOC","TTL"]).optional().default("DAY"),
  disclosed_quantity: z.number().optional(),
  tag: z.string().optional().describe("Optional tag for the order"),
}, async (params) => {
  const kc = getKite();
  const variety = params.order_type === "MARKET" ? kc.VARIETY_REGULAR : kc.VARIETY_REGULAR;
  const data = await kc.placeOrder(variety, {
    tradingsymbol: params.tradingsymbol,
    exchange: params.exchange,
    transaction_type: params.transaction_type,
    quantity: params.quantity,
    order_type: params.order_type,
    product: params.product,
    price: params.price,
    trigger_price: params.trigger_price,
    validity: params.validity,
    disclosed_quantity: params.disclosed_quantity,
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
  const kc = getKite();
  const data = await kc.modifyOrder(kc.VARIETY_REGULAR, order_id, params);
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
});

server.tool("cancel_order", "Cancel a pending order", {
  order_id: z.string(),
}, async ({ order_id }) => {
  const kc = getKite();
  const data = await kc.cancelOrder(kc.VARIETY_REGULAR, order_id);
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
});

// ── GTT ORDERS ────────────────────────────────────────────────
server.tool("get_gtts", "Get all GTT (Good Till Triggered) orders", {}, async () => {
  const kc = getKite();
  const data = await kc.getGTTs();
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
});

server.tool("place_gtt", "Place a GTT order (single or OCO)", {
  trigger_type: z.enum(["single","two-leg"]).describe("single=one trigger, two-leg=OCO (SL+Target)"),
  tradingsymbol: z.string(),
  exchange: z.enum(["NSE","BSE"]),
  trigger_values: z.array(z.number()).describe("For single: [price]. For two-leg: [stoploss_price, target_price]"),
  last_price: z.number().describe("Current LTP of the instrument"),
  orders: z.array(z.object({
    transaction_type: z.enum(["BUY","SELL"]),
    quantity: z.number(),
    order_type: z.enum(["LIMIT","MARKET"]),
    product: z.enum(["CNC","MIS","NRML"]),
    price: z.number(),
  })),
}, async (params) => {
  const kc = getKite();
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
  const kc = getKite();
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

server.tool("delete_gtt", "Delete/cancel a GTT order", {
  trigger_id: z.number(),
}, async ({ trigger_id }) => {
  const kc = getKite();
  const data = await kc.deleteGTT(trigger_id);
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
});

// ── START SERVER ──────────────────────────────────────────────
const app = express();
app.use(express.json());

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

app.get("/health", (_, res) => res.json({ status: "ok", server: "kite-mcp" }));

app.listen(PORT, () => {
  console.log(`✅ Kite MCP Server running on port ${PORT}`);
  console.log(`📡 MCP endpoint: http://localhost:${PORT}/mcp`);
});
