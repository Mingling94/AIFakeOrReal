import { ext } from "../common/browser";
import { getApiUrl, getAutoCheck } from "../common/config";

const CACHE_TTL_MS = 60 * 60 * 1000;

interface CachedScore {
  score: number | null;
  timestamp: number;
}

function setBadge(tabId: number, score: number | null): void {
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

async function fetchScore(url: string): Promise<number | null> {
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

async function getScoreWithCache(url: string): Promise<number | null> {
  const cacheKey = `score_${url}`;
  const result = await ext.storage.local.get(cacheKey);
  const cached = result[cacheKey] as CachedScore | undefined;
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.score;
  }
  const score = await fetchScore(url);
  await ext.storage.local.set({
    [cacheKey]: { score, timestamp: Date.now() } as CachedScore,
  });
  return score;
}

function isCheckable(url: string | undefined): url is string {
  return !!url && /^https?:\/\//.test(url);
}

ext.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" || !isCheckable(tab.url)) return;
  if (!(await getAutoCheck())) {
    setBadge(tabId, null);
    return;
  }
  setBadge(tabId, await getScoreWithCache(tab.url));
});

ext.tabs.onActivated.addListener(async (activeInfo) => {
  const tab = await ext.tabs.get(activeInfo.tabId);
  if (!isCheckable(tab.url)) return;
  setBadge(activeInfo.tabId, await getScoreWithCache(tab.url));
});

ext.runtime.onMessage.addListener(
  (message: { type?: string; url?: string }): boolean => {
    if (
      (message?.type === "VOTE_SUBMITTED" || message?.type === "REFRESH_SCORE") &&
      message.url
    ) {
      const url = message.url;
      ext.storage.local.remove(`score_${url}`);
      ext.tabs.query({ active: true, currentWindow: true }).then(async (tabs) => {
        const tab = tabs[0];
        if (tab?.id && tab.url === url) {
          const score = await fetchScore(url);
          setBadge(tab.id, score);
          await ext.storage.local.set({
            [`score_${url}`]: { score, timestamp: Date.now() },
          });
        }
      });
    }
    return false;
  }
);
