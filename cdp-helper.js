// CDP helper for driving Chrome via DevTools Protocol
const WebSocket = require('ws');

const CDP_URL = 'http://localhost:9222';

async function getTabWs(filter = () => true) {
  const res = await fetch(`${CDP_URL}/json`);
  const tabs = await res.json();
  const tab = tabs.find(filter) || tabs.find(t => t.type === 'page');
  return tab?.webSocketDebuggerUrl;
}

function cdp(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let nextId = 1;
    const pending = new Map();

    ws.on('open', () => {
      resolve({
        send(method, params = {}) {
          return new Promise((res, rej) => {
            const id = nextId++;
            pending.set(id, { res, rej });
            ws.send(JSON.stringify({ id, method, params }));
          });
        },
        close() { ws.close(); },
        ws,
      });
    });

    ws.on('message', (data) => {
      const msg = JSON.parse(data);
      if (msg.id && pending.has(msg.id)) {
        const { res } = pending.get(msg.id);
        pending.delete(msg.id);
        res(msg.result || msg);
      }
    });

    ws.on('error', reject);
  });
}

async function navigate(url, waitMs = 3000) {
  const wsUrl = await getTabWs(t => t.type === 'page' && !t.url.startsWith('chrome-extension://'));
  const c = await cdp(wsUrl);
  await c.send('Page.navigate', { url });
  await new Promise(r => setTimeout(r, waitMs));
  return c;
}

async function screenshot(c, path) {
  const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
  require('fs').writeFileSync(path, Buffer.from(data, 'base64'));
  console.log(`Screenshot saved: ${path}`);
}

async function evaluate(c, expression) {
  const result = await c.send('Runtime.evaluate', { expression, returnByValue: true });
  return result?.result?.value;
}

module.exports = { getTabWs, cdp, navigate, screenshot, evaluate };
