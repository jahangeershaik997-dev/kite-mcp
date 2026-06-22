import { KiteConnect } from "kiteconnect";
import express from "express";
import { writeFileSync } from "fs";
import dotenv from "dotenv";
dotenv.config();

const API_KEY = process.env.KITE_API_KEY;
const API_SECRET = process.env.KITE_API_SECRET;
const PORT = 5000;

if (!API_KEY || !API_SECRET) {
  console.error("❌ Missing KITE_API_KEY or KITE_API_SECRET in .env file");
  process.exit(1);
}

const kc = new KiteConnect({ api_key: API_KEY });
const loginUrl = kc.getLoginURL();

const app = express();

app.get("/callback", async (req, res) => {
  const { request_token, status } = req.query;

  if (status !== "success" || !request_token) {
    res.send("❌ Login failed. Please try again.");
    return;
  }

  try {
    const session = await kc.generateSession(request_token, API_SECRET);
    const tokenData = {
      access_token: session.access_token,
      timestamp: new Date().toISOString(),
      user_name: session.user_name,
      user_id: session.user_id,
    };

    writeFileSync(".access_token", JSON.stringify(tokenData, null, 2));

    console.log(`\n✅ Access token saved for ${session.user_name} (${session.user_id})`);
    console.log(`🔑 Token: ${session.access_token}`);
    console.log(`\n🚀 Now start the MCP server: npm start\n`);

    res.send(`
      <html><body style="font-family:sans-serif;text-align:center;padding:50px">
        <h2>✅ Kite Connected Successfully!</h2>
        <p>Welcome, <strong>${session.user_name}</strong></p>
        <p>Access token saved. You can close this window.</p>
        <p>Now run: <code>npm start</code> in your terminal</p>
      </body></html>
    `);

    setTimeout(() => process.exit(0), 2000);
  } catch (err) {
    console.error("❌ Session generation failed:", err.message);
    res.send(`❌ Error: ${err.message}`);
  }
});

app.listen(PORT, () => {
  console.log(`\n🔐 Kite Auth Server started`);
  console.log(`\n👉 Opening Zerodha login in your browser...`);
  console.log(`   If it doesn't open, go to:\n   ${loginUrl}\n`);

  // Open browser
  import("open").then(({ default: open }) => open(loginUrl));
});
