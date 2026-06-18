#!/usr/bin/env node
/**
 * Integration test suite for the AI Fake Or Real extension popup.
 *
 * Tests the popup UI against real URLs via the ?testUrl= shortcut.
 * Each test opens the popup, waits for it to render, takes a screenshot,
 * and asserts on the DOM state (verdict, chips, community section, etc.).
 *
 * Requirements:
 *   - Chromium running with --remote-debugging-port (see README)
 *   - Extension loaded and enabled
 *
 * Usage:
 *   CDP_PORT=9224 node tests/integration/popup-integration.test.js
 *   CDP_PORT=9224 node tests/integration/popup-integration.test.js --only "BBC homepage"
 *
 * Screenshots saved to: tests/integration/screenshots/
 */

const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");

const CDP_PORT = process.env.CDP_PORT || "9224";
const EXT_ID = process.env.EXT_ID || "ijbfgbgiemjgcokigheihbihanhpejfm";
const SCREENSHOT_DIR = path.join(__dirname, "screenshots");
const RENDER_WAIT_MS = 5000;

fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

/* ------------------------------------------------------------------ */
/*  Test definitions                                                   */
/* ------------------------------------------------------------------ */

const TESTS = [
  // ---- Human content (should show green HUMAN banner) ----
  {
    name: "BBC homepage",
    url: "https://www.bbc.com",
    expect: {
      verdictClass: "human",
      verdictWordContains: "not ai",
      pctBelow: 40,
      chipsContainAny: ["Natural vocabulary", "Varied writing"],
      screenshotFile: "01-bbc-human.png",
    },
  },
  {
    name: "Wikipedia article",
    url: "https://en.wikipedia.org/wiki/Golden_Gate_Bridge",
    expect: {
      verdictClass: "human",
      screenshotFile: "02-wikipedia.png",
    },
  },
  {
    name: "Reuters news",
    url: "https://www.reuters.com",
    expect: {
      verdictClass: ["human", "mixed"],
      screenshotFile: "03-reuters.png",
    },
  },

  // ---- Platform-specific URLs (test domain detection) ----
  {
    name: "Reddit front page",
    url: "https://www.reddit.com",
    expect: {
      domainShown: "www.reddit.com",
      verdictClass: ["human", "mixed"],
      screenshotFile: "04-reddit.png",
    },
  },
  {
    name: "Instagram explore",
    url: "https://www.instagram.com/explore/",
    expect: {
      domainShown: "www.instagram.com",
      verdictClass: ["mixed", "ai"],
      screenshotFile: "05-instagram.png",
    },
  },
  {
    name: "YouTube homepage",
    url: "https://www.youtube.com",
    expect: {
      domainShown: "www.youtube.com",
      screenshotFile: "06-youtube.png",
    },
  },
  {
    name: "Facebook homepage",
    url: "https://www.facebook.com",
    expect: {
      domainShown: "www.facebook.com",
      screenshotFile: "07-facebook.png",
    },
  },
  {
    name: "TikTok homepage",
    url: "https://www.tiktok.com",
    expect: {
      domainShown: "www.tiktok.com",
      verdictClass: ["ai", "mixed"],
      screenshotFile: "08-tiktok.png",
    },
  },
  {
    name: "Twitter/X homepage",
    url: "https://x.com",
    expect: {
      domainShown: "x.com",
      verdictClass: ["human", "mixed"],
      screenshotFile: "09-twitter.png",
    },
  },

  // ---- AI-likely content (should show red/amber banner) ----
  {
    name: "Known AI content site",
    url: "https://chat.openai.com",
    expect: {
      verdictClass: ["ai", "mixed"],
      screenshotFile: "10-openai.png",
    },
  },

  // ---- Edge cases ----
  {
    name: "Non-HTTP page (chrome://)",
    url: "chrome://settings",
    expect: {
      // testUrl mode can't simulate chrome.tabs rejection for non-http URLs.
      // Just capture the screenshot to show what happens.
      screenshotFile: "11-chrome-settings-error.png",
    },
  },
  {
    name: "Localhost / developer page",
    url: "http://localhost:3000",
    expect: {
      // Might show unknown or error depending on whether localhost is up.
      screenshotFile: "12-localhost.png",
    },
  },

  // ---- Community votes scenarios ----
  {
    name: "BBC with existing votes (crowd section visible)",
    url: "https://www.bbc.com",
    expect: {
      verdictClass: "human",
      hasCommunitySection: true,
      thumbButtonsVisible: true,
      screenshotFile: "13-bbc-with-votes.png",
    },
  },

  // ---- Popup states ----
  {
    name: "Fresh URL with no data",
    url: "https://example.com/unique-page-no-data",
    expect: {
      verdictClass: "unknown",
      verdictWordContains: "not checked",
      screenshotFile: "14-no-data.png",
    },
  },
];

/* ------------------------------------------------------------------ */
/*  CDP helpers                                                        */
/* ------------------------------------------------------------------ */

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

async function createTab(url) {
  const browserRes = await fetch(`http://localhost:${CDP_PORT}/json/version`);
  const info = await browserRes.json();
  const browser = await cdpConnect(info.webSocketDebuggerUrl);
  const result = await browser.send("Target.createTarget", { url });
  browser.close();
  return result.result.targetId;
}

async function screenshotTab(targetId, outPath) {
  const c = await cdpConnect(`ws://localhost:${CDP_PORT}/devtools/page/${targetId}`);
  await c.send("Emulation.setDeviceMetricsOverride", {
    width: 360, height: 540, deviceScaleFactor: 2, mobile: false,
  });
  await new Promise((r) => setTimeout(r, 300));
  const shot = await c.send("Page.captureScreenshot", {
    format: "png",
    clip: { x: 0, y: 0, width: 360, height: 540, scale: 1 },
  });
  fs.writeFileSync(outPath, Buffer.from(shot.result.data, "base64"));
  c.close();
  return outPath;
}

async function evaluateInTab(targetId, expression) {
  const c = await cdpConnect(`ws://localhost:${CDP_PORT}/devtools/page/${targetId}`);
  const result = await c.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  c.close();
  return result?.result?.result?.value;
}

async function closeTab(targetId) {
  const browserRes = await fetch(`http://localhost:${CDP_PORT}/json/version`);
  const info = await browserRes.json();
  const browser = await cdpConnect(info.webSocketDebuggerUrl);
  await browser.send("Target.closeTarget", { targetId });
  browser.close();
}

/* ------------------------------------------------------------------ */
/*  DOM query expressions                                              */
/* ------------------------------------------------------------------ */

const QUERY_POPUP_STATE = `
  (() => {
    const banner = document.querySelector('.verdict-banner');
    const word = document.querySelector('.verdict-word');
    const pct = document.querySelector('.verdict-pct');
    const domain = document.querySelector('.verdict-domain');
    const chips = [...document.querySelectorAll('.signal-chip')].map(c => ({
      label: c.textContent, type: c.classList.contains('positive') ? 'positive' :
        c.classList.contains('negative') ? 'negative' : 'neutral'
    }));
    const errorBox = document.querySelector('.error-box');
    const spinner = document.querySelector('.banner-spinner');
    const community = document.querySelector('.community-section');
    const communityLabel = community?.querySelector('.signals-label');
    const thumbBtns = [...document.querySelectorAll('.thumb-btn')];
    const wrongBtn = document.querySelector('.wrong-btn');
    const disagree = document.querySelector('.disagreement-notice');
    const bar = community?.querySelector('.bar');
    const barLabel = community?.querySelector('.bar-label');

    return JSON.stringify({
      bannerClasses: banner?.className || '',
      verdictWord: word?.textContent?.trim() || '',
      pctText: pct?.textContent?.trim() || '',
      domain: domain?.textContent?.trim() || '',
      chips,
      hasError: !!errorBox,
      errorText: errorBox?.textContent?.trim() || '',
      isScanning: !!spinner,
      hasCommunitySection: !!community,
      communityLabelText: communityLabel?.textContent?.trim() || '',
      thumbButtonCount: thumbBtns.length,
      hasWrongButton: !!wrongBtn,
      hasDisagreement: !!disagree,
      disagreementText: disagree?.textContent?.trim() || '',
      hasBar: !!bar,
      barLabelText: barLabel?.textContent?.trim() || '',
    });
  })()
`;

/* ------------------------------------------------------------------ */
/*  Test runner                                                        */
/* ------------------------------------------------------------------ */

async function runTest(test) {
  const popupUrl = `chrome-extension://${EXT_ID}/popup.html?testUrl=${encodeURIComponent(test.url)}`;

  // Clean up any leftover popup tabs from previous tests
  const existingTabs = await fetch(`http://localhost:${CDP_PORT}/json`).then(r => r.json());
  for (const t of existingTabs) {
    if (t.url.includes('popup.html') && t.type === 'page') {
      await closeTab(t.id).catch(() => {});
    }
  }

  // Small pause between tests to let Chromium breathe
  await new Promise((r) => setTimeout(r, 500));

  const targetId = await createTab(popupUrl);

  // Poll for DOM readiness (verdict-banner appears once React renders).
  let state;
  for (let attempt = 0; attempt < 8; attempt++) {
    await new Promise((r) => setTimeout(r, attempt === 0 ? 2000 : 1500));
    try {
      const raw = await evaluateInTab(targetId, QUERY_POPUP_STATE);
      state = JSON.parse(raw);
      // If we got a banner class or an error, the popup is ready.
      if (state.bannerClasses || state.hasError) break;
    } catch {
      state = null;
    }
  }

  if (!state) {
    state = { error: "Tab never loaded", bannerClasses: "", verdictWord: "" };
  }

  // Take screenshot.
  const ssPath = path.join(SCREENSHOT_DIR, test.expect.screenshotFile);
  await screenshotTab(targetId, ssPath);

  // Close the tab.
  await closeTab(targetId);

  // Assertions.
  const failures = [];
  const exp = test.expect;

  if (exp.verdictClass) {
    const allowed = Array.isArray(exp.verdictClass) ? exp.verdictClass : [exp.verdictClass];
    const actual = state.bannerClasses?.replace("verdict-banner ", "").trim();
    if (!allowed.some((v) => actual.includes(v))) {
      failures.push(`verdictClass: expected one of [${allowed}], got "${actual}"`);
    }
  }

  if (exp.verdictWordContains) {
    if (!state.verdictWord?.toLowerCase().includes(exp.verdictWordContains.toLowerCase())) {
      failures.push(`verdictWord: expected to contain "${exp.verdictWordContains}", got "${state.verdictWord}"`);
    }
  }

  if (exp.pctBelow != null) {
    const match = state.pctText?.match(/(\d+)%/);
    const pct = match ? parseInt(match[1]) : null;
    if (pct != null && pct >= exp.pctBelow) {
      failures.push(`pct: expected < ${exp.pctBelow}%, got ${pct}%`);
    }
  }

  if (exp.chipsContainAny) {
    const chipLabels = (state.chips || []).map((c) => c.label);
    const found = exp.chipsContainAny.some((want) =>
      chipLabels.some((have) => have.toLowerCase().includes(want.toLowerCase()))
    );
    if (!found) {
      failures.push(`chips: expected any of [${exp.chipsContainAny}], got [${chipLabels}]`);
    }
  }

  if (exp.domainShown) {
    if (state.domain !== exp.domainShown) {
      failures.push(`domain: expected "${exp.domainShown}", got "${state.domain}"`);
    }
  }

  if (exp.hasError != null) {
    if (state.hasError !== exp.hasError) {
      failures.push(`hasError: expected ${exp.hasError}, got ${state.hasError}`);
    }
  }

  if (exp.errorContains) {
    if (!state.errorText?.includes(exp.errorContains)) {
      failures.push(`errorText: expected to contain "${exp.errorContains}", got "${state.errorText}"`);
    }
  }

  if (exp.hasCommunitySection != null) {
    if (state.hasCommunitySection !== exp.hasCommunitySection) {
      failures.push(`hasCommunitySection: expected ${exp.hasCommunitySection}, got ${state.hasCommunitySection}`);
    }
  }

  if (exp.thumbButtonsVisible != null) {
    const visible = state.thumbButtonCount >= 2;
    if (visible !== exp.thumbButtonsVisible) {
      failures.push(`thumbButtons: expected ${exp.thumbButtonsVisible}, got ${visible} (count: ${state.thumbButtonCount})`);
    }
  }

  return { test, state, ssPath, failures };
}

async function main() {
  const onlyFilter = process.argv.find((a) => a === "--only")
    ? process.argv[process.argv.indexOf("--only") + 1]
    : null;

  const testsToRun = onlyFilter
    ? TESTS.filter((t) => t.name.toLowerCase().includes(onlyFilter.toLowerCase()))
    : TESTS;

  // Verify extension is loaded before running tests.
  console.log(`\n🧪 AI Fake Or Real — Popup Integration Tests`);
  console.log(`   CDP port: ${CDP_PORT} | Extension: ${EXT_ID}`);

  // Quick check: can we open a popup tab?
  const checkId = await createTab(`chrome-extension://${EXT_ID}/popup.html?testUrl=https://example.com`);
  await new Promise((r) => setTimeout(r, RENDER_WAIT_MS));
  let checkState;
  try {
    const raw = await evaluateInTab(checkId, `document.querySelector('.verdict-banner') ? 'ok' : (document.querySelector('.error-box') ? 'ok' : document.body?.innerText?.substring(0, 80))`);
    checkState = raw;
  } catch { checkState = "error"; }
  await closeTab(checkId);

  if (checkState !== "ok") {
    console.log(`\n  ❌ Extension not ready (got: "${checkState}").`);
    console.log(`     Make sure the extension is enabled and try again.\n`);
    process.exit(1);
  }

  console.log(`   Extension verified ✓`);
  console.log(`   Running ${testsToRun.length} of ${TESTS.length} tests\n`);

  let passed = 0;
  let failed = 0;

  for (const test of testsToRun) {
    process.stdout.write(`  ${test.name} ... `);
    try {
      const result = await runTest(test);
      if (result.failures.length === 0) {
        passed++;
        console.log(`✅  → ${result.state.verdictWord || result.state.errorText || "rendered"}`);
        console.log(`      📸 ${result.ssPath}`);
      } else {
        failed++;
        console.log(`❌`);
        result.failures.forEach((f) => console.log(`      ⚠️  ${f}`));
        console.log(`      📸 ${result.ssPath}`);
      }
    } catch (e) {
      failed++;
      console.log(`💥 ${e.message}`);
    }
  }

  console.log(`\n  Results: ${passed} passed, ${failed} failed\n`);

  // Summary table of screenshots.
  console.log("  📁 Screenshots:");
  for (const test of testsToRun) {
    const ssPath = path.join(SCREENSHOT_DIR, test.expect.screenshotFile);
    const exists = fs.existsSync(ssPath);
    const size = exists ? `${(fs.statSync(ssPath).size / 1024).toFixed(0)}KB` : "—";
    console.log(`     ${exists ? "✓" : "✗"} ${test.expect.screenshotFile} (${size})`);
  }
  console.log("");

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
