const API_BASE = "http://localhost:8000/api/v1";
const CACHE_TTL_MS = 60 * 60 * 1000;

interface CachedScore {
  score: number | null;
  timestamp: number;
}

function setBadge(tabId: number, score: number | null): void {
  if (score === null) {
    chrome.action.setBadgeText({ tabId, text: "?" });
    chrome.action.setBadgeBackgroundColor({ tabId, color: "#9e9e9e" });
    return;
  }

  const pct = Math.round(score * 100);
  if (pct <= 30) {
    chrome.action.setBadgeText({ tabId, text: "H" });
    chrome.action.setBadgeBackgroundColor({ tabId, color: "#4caf50" });
  } else if (pct <= 70) {
    chrome.action.setBadgeText({ tabId, text: "M" });
    chrome.action.setBadgeBackgroundColor({ tabId, color: "#ff9800" });
  } else {
    chrome.action.setBadgeText({ tabId, text: "A" });
    chrome.action.setBadgeBackgroundColor({ tabId, color: "#f44336" });
  }
}

async function fetchScore(url: string): Promise<number | null> {
  try {
    const response = await fetch(
      `${API_BASE}/score?url=${encodeURIComponent(url)}`
    );
    if (!response.ok) return null;
    const data = await response.json();
    return data.combined_score;
  } catch {
    return null;
  }
}

async function getScoreWithCache(url: string): Promise<number | null> {
  const cacheKey = `score_${url}`;
  const result = await chrome.storage.local.get(cacheKey);
  const cached = result[cacheKey] as CachedScore | undefined;

  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.score;
  }

  const score = await fetchScore(url);
  await chrome.storage.local.set({
    [cacheKey]: { score, timestamp: Date.now() } as CachedScore,
  });
  return score;
}

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" || !tab.url) return;
  if (tab.url.startsWith("chrome://") || tab.url.startsWith("chrome-extension://")) return;

  const autoCheck = await chrome.storage.local.get("autoCheck");
  if (autoCheck.autoCheck === false) {
    setBadge(tabId, null);
    return;
  }

  const score = await getScoreWithCache(tab.url);
  setBadge(tabId, score);
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const tab = await chrome.tabs.get(activeInfo.tabId);
  if (!tab.url || tab.url.startsWith("chrome://")) return;

  const score = await getScoreWithCache(tab.url);
  setBadge(activeInfo.tabId, score);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "VOTE_SUBMITTED" || message.type === "REFRESH_SCORE") {
    const url = message.url as string;
    const cacheKey = `score_${url}`;
    chrome.storage.local.remove(cacheKey);

    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      if (tabs[0]?.id && tabs[0].url === url) {
        const score = await fetchScore(url);
        setBadge(tabs[0].id, score);
        await chrome.storage.local.set({
          [cacheKey]: { score, timestamp: Date.now() },
        });
      }
    });
    sendResponse({ ok: true });
  }
  return true;
});
