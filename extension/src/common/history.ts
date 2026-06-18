// Local browsing history for AI exposure tracking.
// All data stays in chrome.storage.local — never sent to the server.

import { ext } from "./browser";

const HISTORY_KEY = "aifr_history";
const MAX_ENTRIES = 5000;

export interface HistoryEntry {
  url: string;
  domain: string;
  score: number;
  timestamp: number;
}

export interface ExposureStats {
  totalPages: number;
  aiPages: number;
  humanPages: number;
  mixedPages: number;
  aiPercentage: number;
}

/** Append a page visit to local history. Evicts oldest entries if over cap. */
export async function logPageVisit(
  url: string,
  domain: string,
  score: number,
): Promise<void> {
  const stored = await ext.storage.local.get(HISTORY_KEY);
  const history: HistoryEntry[] = stored[HISTORY_KEY] || [];

  // Don't log duplicate URLs within the last 5 minutes (tab re-activations).
  const fiveMinAgo = Date.now() - 5 * 60 * 1000;
  const isDupe = history.some(
    (e) => e.url === url && e.timestamp > fiveMinAgo,
  );
  if (isDupe) return;

  history.push({ url, domain, score, timestamp: Date.now() });

  // FIFO eviction
  if (history.length > MAX_ENTRIES) {
    history.splice(0, history.length - MAX_ENTRIES);
  }

  await ext.storage.local.set({ [HISTORY_KEY]: history });
}

/** Compute exposure stats for a given time window (in milliseconds). */
export async function getExposureStats(windowMs: number): Promise<ExposureStats> {
  const stored = await ext.storage.local.get(HISTORY_KEY);
  const history: HistoryEntry[] = stored[HISTORY_KEY] || [];
  const cutoff = Date.now() - windowMs;

  const entries = history.filter((e) => e.timestamp >= cutoff);
  const totalPages = entries.length;
  const aiPages = entries.filter((e) => e.score > 0.7).length;
  const humanPages = entries.filter((e) => e.score <= 0.3).length;
  const mixedPages = totalPages - aiPages - humanPages;
  const aiPercentage = totalPages > 0 ? Math.round((aiPages / totalPages) * 100) : 0;

  return { totalPages, aiPages, humanPages, mixedPages, aiPercentage };
}

/** Time windows used in the UI. */
export const TIME_WINDOWS = [
  { label: "1D", ms: 24 * 60 * 60 * 1000 },
  { label: "7D", ms: 7 * 24 * 60 * 60 * 1000 },
  { label: "30D", ms: 30 * 24 * 60 * 60 * 1000 },
  { label: "1Y", ms: 365 * 24 * 60 * 60 * 1000 },
] as const;

/** Get all exposure stats for the standard time windows. */
export async function getAllExposureStats(): Promise<
  Array<{ label: string; stats: ExposureStats }>
> {
  const results = [];
  for (const w of TIME_WINDOWS) {
    results.push({ label: w.label, stats: await getExposureStats(w.ms) });
  }
  return results;
}

/** Check if there's any history at all. */
export async function hasHistory(): Promise<boolean> {
  const stored = await ext.storage.local.get(HISTORY_KEY);
  const history: HistoryEntry[] = stored[HISTORY_KEY] || [];
  return history.length > 0;
}
