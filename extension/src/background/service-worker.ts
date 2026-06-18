import { ext } from "../common/browser";
import { getApiUrl, getAutoCheck } from "../common/config";
import { logPageVisit } from "../common/history";
import type { ScanResult } from "../content/local-scanner";

// Show welcome page on first install.
ext.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    ext.tabs.create({ url: "https://github.com/Mingling94/AIFakeOrReal#readme" });
  }
});

// Set uninstall feedback URL.
ext.runtime.setUninstallURL("https://forms.gle/placeholder-feedback-form");

const CACHE_TTL_MS = 60 * 60 * 1000;

interface CachedResult {
  /** Combined score from API (crowd + analysis). null = no data. */
  apiScore: number | null;
  /** Local scanner result, if available. */
  localScan: ScanResult | null;
  timestamp: number;
}

function setBadge(tabId: number, result: CachedResult | null): void {
  // Prefer local scan if it ran; fall back to API score.
  const score = result?.localScan?.score ?? result?.apiScore ?? null;

  if (score === null) {
    ext.action.setBadgeText({ tabId, text: "—" });
    ext.action.setBadgeBackgroundColor({ tabId, color: "#94a3b8" });
    return;
  }
  const pct = Math.round(score * 100);
  if (pct <= 30) {
    ext.action.setBadgeText({ tabId, text: "✓" });
    ext.action.setBadgeBackgroundColor({ tabId, color: "#22c55e" });
  } else if (pct <= 70) {
    ext.action.setBadgeText({ tabId, text: "?" });
    ext.action.setBadgeBackgroundColor({ tabId, color: "#f59e0b" });
  } else {
    ext.action.setBadgeText({ tabId, text: "AI" });
    ext.action.setBadgeBackgroundColor({ tabId, color: "#ef4444" });
  }
}

async function fetchApiScore(url: string): Promise<number | null> {
  try {
    const base = await getApiUrl();
    const response = await fetch(`${base}/score?url=${encodeURIComponent(url)}`);
    if (!response.ok) return null;
    const data = await response.json();
    return data.combined_score;
  } catch {
    return null;
  }
}

/** Ask the content script to run the local scanner on the page. */
async function requestLocalScan(tabId: number): Promise<ScanResult | null> {
  try {
    const resp = await ext.tabs.sendMessage(tabId, { type: "LOCAL_SCAN" }) as
      | { ok: true; scan: ScanResult }
      | { ok: false }
      | undefined;
    return resp?.ok ? resp.scan : null;
  } catch {
    return null;
  }
}

function cacheKey(url: string): string {
  return `result_${url}`;
}

async function getCached(url: string): Promise<CachedResult | null> {
  const key = cacheKey(url);
  const stored = await ext.storage.local.get(key);
  const cached = stored[key] as CachedResult | undefined;
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) return cached;
  return null;
}

async function saveResult(url: string, result: CachedResult): Promise<void> {
  await ext.storage.local.set({ [cacheKey(url)]: result });
}

function isCheckable(url: string | undefined): url is string {
  return !!url && /^https?:\/\//.test(url);
}

/**
 * Full check: run local scan (instant) + fetch API score (network) in parallel.
 * Updates badge as soon as local scan finishes, then refines when API responds.
 */
async function fullCheck(tabId: number, url: string): Promise<CachedResult> {
  // Fire both in parallel
  const [localScan, apiScore] = await Promise.all([
    requestLocalScan(tabId),
    fetchApiScore(url),
  ]);
  const result: CachedResult = { apiScore, localScan, timestamp: Date.now() };
  await saveResult(url, result);

  // Log to local history for AI exposure tracking.
  const score = localScan?.score ?? apiScore;
  if (score !== null) {
    try {
      const domain = new URL(url).hostname;
      await logPageVisit(url, domain, score);
    } catch { /* non-critical */ }
  }

  return result;
}

// --- Event listeners ---

ext.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" || !isCheckable(tab.url)) return;
  if (!(await getAutoCheck())) {
    setBadge(tabId, null);
    return;
  }

  // Show cached result immediately while re-checking in background
  const cached = await getCached(tab.url);
  if (cached) setBadge(tabId, cached);

  // Run full check (local scan + API) in background
  const result = await fullCheck(tabId, tab.url);
  setBadge(tabId, result);
});

ext.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await ext.tabs.get(activeInfo.tabId);
    if (!isCheckable(tab.url)) return;
    const cached = await getCached(tab.url);
    if (cached) {
      setBadge(activeInfo.tabId, cached);
    } else {
      const result = await fullCheck(activeInfo.tabId, tab.url);
      setBadge(activeInfo.tabId, result);
    }
  } catch {
    // tabs.get may fail if tabs permission not granted — badge just won't update on tab switch
  }
});

ext.runtime.onMessage.addListener(
  (message: { type?: string; url?: string }): boolean => {
    if (
      (message?.type === "VOTE_SUBMITTED" || message?.type === "REFRESH_SCORE") &&
      message.url
    ) {
      const url = message.url;
      ext.storage.local.remove(cacheKey(url));
      ext.tabs.query({ active: true, currentWindow: true }).then(async (tabs) => {
        const tab = tabs[0];
        if (tab?.id && tab.url === url) {
          const result = await fullCheck(tab.id, url);
          setBadge(tab.id, result);
        }
      });
    }
    return false;
  }
);
