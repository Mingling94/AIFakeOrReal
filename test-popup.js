#!/usr/bin/env node
// Quick test helper: opens the extension popup with a testUrl and takes a screenshot.
// Usage: node test-popup.js [url] [output.png]
//   node test-popup.js https://www.bbc.com popup-bbc.png
//   node test-popup.js  # defaults to bbc.com

const WebSocket = require("ws");
const fs = require("fs");

const CDP_PORT = process.env.CDP_PORT || "9224";
const EXT_ID = process.env.EXT_ID || "ijbfgbgiemjgcokigheihbihanhpejfm";
const testUrl = process.argv[2] || "https://www.bbc.com";
const outFile = process.argv[3] || "docs/screenshots/browser/popup-test-latest.png";

async function main() {
  const browserRes = await fetch(`http://localhost:${CDP_PORT}/json/version`);
  const browserInfo = await browserRes.json();

  const ws = new WebSocket(browserInfo.webSocketDebuggerUrl, { handshakeTimeout: 3000 });
  const popupUrl = `chrome-extension://${EXT_ID}/popup.html?testUrl=${encodeURIComponent(testUrl)}`;

  await new Promise((resolve) => {
    ws.on("open", () => {
      ws.send(JSON.stringify({ id: 1, method: "Target.createTarget", params: { url: popupUrl } }));
    });

    ws.on("message", async (data) => {
      const msg = JSON.parse(data);
      if (msg.id === 1) {
        const targetId = msg.result.targetId;
        console.log(`Popup opened (target: ${targetId}), waiting for render...`);
        await new Promise((r) => setTimeout(r, 4000));

        const ws2 = new WebSocket(`ws://localhost:${CDP_PORT}/devtools/page/${targetId}`, { handshakeTimeout: 3000 });
        ws2.on("open", () => {
          ws2.send(JSON.stringify({ id: 1, method: "Emulation.setDeviceMetricsOverride",
            params: { width: 360, height: 540, deviceScaleFactor: 2, mobile: false } }));
        });
        ws2.on("message", (d2) => {
          const m2 = JSON.parse(d2);
          if (m2.id === 1) {
            setTimeout(() => {
              ws2.send(JSON.stringify({ id: 2, method: "Page.captureScreenshot",
                params: { format: "png", clip: { x: 0, y: 0, width: 360, height: 540, scale: 1 } } }));
            }, 500);
          }
          if (m2.id === 2 && m2.result?.data) {
            fs.writeFileSync(outFile, Buffer.from(m2.result.data, "base64"));
            console.log(`Screenshot saved: ${outFile}`);
            ws2.close(); ws.close(); resolve();
          }
        });
      }
    });
  });
}

main().catch((e) => { console.error(e); process.exit(1); });
