#!/usr/bin/env node
/**
 * Generate Chrome Web Store screenshots (1280x800).
 * Composites existing popup screenshots onto a branded background.
 *
 * Usage: CDP_PORT=9224 node tests/generate-store-screenshots.js
 */

const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");

const CDP_PORT = process.env.CDP_PORT || "9224";
const EXT_ID = process.env.EXT_ID || "ijbfgbgiemjgcokigheihbihanhpejfm";
const OUT_DIR = path.join(__dirname, "..", "docs", "store-screenshots");
const POPUP_DIR = path.join(__dirname, "integration", "screenshots");

fs.mkdirSync(OUT_DIR, { recursive: true });

const SCREENSHOTS = [
  {
    name: "01-real-bbc",
    testUrl: "https://www.bbc.com",
    popupFallback: "01-bbc-human.png",
    bg: "#f0fdf4",
    titleHtml: "BBC News &mdash; <span style='color:#22c55e'>Real &#x2713;</span>",
    subtitle: "Trusted news detected as human-written content",
  },
  {
    name: "02-fake-tiktok",
    testUrl: "https://www.tiktok.com",
    popupFallback: "08-tiktok.png",
    bg: "#fef2f2",
    titleHtml: "TikTok &mdash; <span style='color:#ef4444'>AI Fake</span> detected",
    subtitle: "Community votes flag AI-generated content",
  },
  {
    name: "03-unclear-reddit",
    testUrl: "https://www.reddit.com",
    popupFallback: "04-reddit.png",
    bg: "#fffbeb",
    titleHtml: "Reddit &mdash; <span style='color:#f59e0b'>Unclear</span>, your vote decides",
    subtitle: "When the scanner is uncertain, the community weighs in",
  },
  {
    name: "04-openai-fake",
    testUrl: "https://chat.openai.com",
    popupFallback: "10-openai.png",
    bg: "#fef2f2",
    titleHtml: "OpenAI &mdash; <span style='color:#ef4444'>AI Fake</span> &#x1F534;",
    subtitle: "Known AI platforms flagged automatically",
  },
  {
    name: "05-fresh-page",
    testUrl: "https://example.com/fresh-page",
    popupFallback: "14-no-data.png",
    bg: "#f8fafc",
    titleHtml: "New page &mdash; <span style='color:#94a3b8'>Not checked yet</span>",
    subtitle: "Be the first to vote and help the community",
  },
];

async function cdpConnect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl, { handshakeTimeout: 5000 });
    let nextId = 1;
    const pending = new Map();
    ws.on("open", () =>
      resolve({
        send(method, params = {}) {
          return new Promise((res) => {
            const id = nextId++;
            pending.set(id, res);
            ws.send(JSON.stringify({ id, method, params }));
          });
        },
        close() { ws.close(); },
      })
    );
    ws.on("message", (raw) => {
      const msg = JSON.parse(raw);
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    });
    ws.on("error", reject);
  });
}

async function generateScreenshot(shot) {
  // Use the pre-existing popup screenshot as an embedded image
  const popupPath = path.join(POPUP_DIR, shot.popupFallback);
  let popupB64 = "";
  if (fs.existsSync(popupPath)) {
    popupB64 = fs.readFileSync(popupPath, "base64");
  }

  const browserRes = await fetch(`http://localhost:${CDP_PORT}/json/version`);
  const info = await browserRes.json();
  const browser = await cdpConnect(info.webSocketDebuggerUrl);

  // Build the HTML as a file to avoid encoding issues with data: URLs
  const tmpHtml = path.join(OUT_DIR, `_tmp_${shot.name}.html`);
  fs.writeFileSync(tmpHtml, `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1280px; height: 800px;
    background: ${shot.bg};
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    display: flex;
    overflow: hidden;
  }
  .left {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 60px 20px 60px 60px;
  }
  .left h1 {
    font-size: 34px;
    color: #0f172a;
    margin-bottom: 10px;
    line-height: 1.3;
  }
  .left p {
    font-size: 17px;
    color: #64748b;
    line-height: 1.5;
    margin-bottom: 20px;
  }
  .badge {
    display: inline-block;
    background: #0f172a;
    color: white;
    padding: 8px 20px;
    border-radius: 24px;
    font-size: 14px;
    font-weight: 600;
  }
  .right {
    width: 420px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 30px 50px 30px 10px;
  }
  .popup-frame {
    width: 330px;
    border-radius: 12px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.12), 0 4px 16px rgba(0,0,0,0.08);
    overflow: hidden;
  }
  .popup-frame img {
    width: 100%;
    display: block;
  }
</style>
</head>
<body>
  <div class="left">
    <h1>${shot.titleHtml}</h1>
    <p>${shot.subtitle}</p>
    <span class="badge">&#x1F978; AI Fake Or Real</span>
  </div>
  <div class="right">
    <div class="popup-frame">
      ${popupB64 ? `<img src="data:image/png;base64,${popupB64}" alt="popup">` : '<div style="width:330px;height:500px;background:#f8fafc;display:flex;align-items:center;justify-content:center;color:#94a3b8">Popup</div>'}
    </div>
  </div>
</body>
</html>`);

  const result = await browser.send("Target.createTarget", { url: `file://${tmpHtml}` });
  const targetId = result.result.targetId;

  await new Promise((r) => setTimeout(r, 2000));

  const page = await cdpConnect(`ws://localhost:${CDP_PORT}/devtools/page/${targetId}`);
  await page.send("Emulation.setDeviceMetricsOverride", {
    width: 1280, height: 800, deviceScaleFactor: 2, mobile: false,
  });
  await new Promise((r) => setTimeout(r, 500));

  const screenshot = await page.send("Page.captureScreenshot", {
    format: "png",
    clip: { x: 0, y: 0, width: 1280, height: 800, scale: 1 },
  });

  const outPath = path.join(OUT_DIR, `${shot.name}.png`);
  fs.writeFileSync(outPath, Buffer.from(screenshot.result.data, "base64"));
  console.log(`  ✓ ${shot.name}.png`);

  page.close();
  await browser.send("Target.closeTarget", { targetId });
  browser.close();

  // Clean up temp file
  fs.unlinkSync(tmpHtml);
}

async function main() {
  console.log("Generating Chrome Web Store screenshots (1280×800)...\n");

  for (const shot of SCREENSHOTS) {
    try {
      await generateScreenshot(shot);
    } catch (e) {
      console.log(`  ✗ ${shot.name}: ${e.message}`);
    }
  }

  console.log(`\nDone! Screenshots in: ${OUT_DIR}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
