import React, { useCallback, useEffect, useState } from "react";
import type {
  ContentData,
  ScoreResponse,
  VoteBreakdown,
  VoteType,
} from "../common/types";
import type { ScanResult } from "../content/local-scanner";
import type { ExposureStats } from "../common/history";
import { getAllExposureStats, hasHistory } from "../common/history";
import { api } from "../common/api";
import { ext } from "../common/browser";
import { shareVerdict } from "./share-card";
import "./popup.css";

interface ExtractResponse {
  ok: boolean;
  content?: Omit<ContentData, "url">;
  error?: string;
}

/* ------------------------------------------------------------------ */
/*  Verdict helpers                                                    */
/* ------------------------------------------------------------------ */

function verdictClass(score: number | null): string {
  if (score === null) return "unknown";
  if (score <= 0.3) return "human";
  if (score <= 0.7) return "mixed";
  return "ai";
}

function verdictWord(score: number | null, isScanning: boolean): string {
  if (isScanning) return "Scanning…";
  if (score === null) return "Not checked";
  if (score <= 0.3) return "Is Not AI";
  if (score <= 0.7) return "Unclear";
  return "Is AI";
}

type Chip = { label: string; type: "positive" | "negative" | "neutral" };

const FLAG_LABELS: Record<string, string> = {
  no_contractions: "No contractions detected",
  em_dash_overuse: "Em-dash overuse",
  repetitive_sentence_starters: "Repetitive sentence starters",
  tricolon_repetition: "Tricolon repetition",
  uniform_paragraph_length: "Uniform paragraph length",
  no_personal_voice: "No personal voice",
  excessive_hedging: "Excessive hedging",
  not_only_but_also_overuse: '"Not only X but also Y" overuse',
};

function buildSignalChips(
  scan: ScanResult | null,
  serverScore: ScoreResponse | null,
): Chip[] {
  const chips: Chip[] = [];

  // Local scan signals take priority — they ran instantly.
  if (scan) {
    if (scan.vocabTriggered) {
      chips.push({ label: "AI vocabulary detected", type: "negative" });
    } else if (scan.score <= 0.3) {
      chips.push({ label: "Natural vocabulary", type: "positive" });
    }
    if (scan.structureTriggered) {
      chips.push({ label: "Uniform structure", type: "negative" });
    } else if (scan.score <= 0.3) {
      chips.push({ label: "Varied writing style", type: "positive" });
    }
    if (scan.accusationTriggered) {
      chips.push({ label: "Comments flag as AI", type: "negative" });
    }
    return chips;
  }

  // Fall back to server-side signals.
  const sig = serverScore?.signals;
  if (sig) {
    if (sig.vocabulary_triggered) {
      const label =
        sig.vocabulary_tier1_count > 5
          ? `Heavy AI vocabulary (${sig.vocabulary_tier1_count} words)`
          : "Some AI-typical words";
      chips.push({ label, type: "negative" });
    } else {
      chips.push({ label: "Natural vocabulary", type: "positive" });
    }
    if (sig.structure_triggered) {
      const flag = sig.structure_flags[0];
      chips.push({
        label: FLAG_LABELS[flag] || "Uniform structure",
        type: "negative",
      });
    } else {
      chips.push({ label: "Varied writing style", type: "positive" });
    }
    if (sig.comment_triggered) {
      chips.push({
        label: `Comments call it AI (${sig.comment_examples.length})`,
        type: "negative",
      });
    }
  }

  if (chips.length === 0) {
    chips.push({ label: "Not enough data", type: "neutral" });
  }
  return chips;
}

/** The score we display to the user. Local scan wins, then API combined. */
function displayScore(
  scan: ScanResult | null,
  apiScore: ScoreResponse | null,
): number | null {
  if (scan) return scan.score;
  return apiScore?.combined_score ?? null;
}

/** Detect when the local scan and crowd votes disagree. */
function getDisagreement(
  scan: ScanResult | null,
  crowd: number | null,
): { show: boolean; scanLabel: string; crowdLabel: string } {
  if (!scan || crowd === null)
    return { show: false, scanLabel: "", crowdLabel: "" };
  const label = (v: number) => (v > 0.7 ? "Is AI" : v <= 0.3 ? "Not AI" : "Unclear");
  const sl = label(scan.score);
  const cl = label(crowd);
  return { show: sl !== cl && sl !== "Unclear" && cl !== "Unclear", scanLabel: sl, crowdLabel: cl };
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function Popup() {
  const [tabId, setTabId] = useState<number | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [apiScore, setApiScore] = useState<ScoreResponse | null>(null);
  const [localScan, setLocalScan] = useState<ScanResult | null>(null);
  const [votes, setVotes] = useState<VoteBreakdown | null>(null);
  const [scanning, setScanning] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [votedAs, setVotedAs] = useState<VoteType | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [reported, setReported] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [shared, setShared] = useState(false);
  const [firstRun, setFirstRun] = useState(false);
  const [exposure, setExposure] = useState<Array<{ label: string; stats: ExposureStats }> | null>(null);

  /** Fetch API score + votes (network). */
  const fetchApi = useCallback(async (pageUrl: string) => {
    try {
      const [scoreData, voteData] = await Promise.all([
        api.getScore(pageUrl),
        api.getVotes(pageUrl),
      ]);
      setApiScore(scoreData);
      setVotes(voteData);
    } catch {
      // API unavailable — local scan is still usable.
    }
  }, []);

  /** Run the local scanner via content script. */
  const runLocalScan = useCallback(async (tid: number): Promise<ScanResult | null> => {
    try {
      const resp = (await ext.tabs.sendMessage(tid, {
        type: "LOCAL_SCAN",
      })) as { ok: true; scan: ScanResult } | { ok: false } | undefined;
      return resp?.ok ? resp.scan : null;
    } catch {
      return null;
    }
  }, []);

  /** Send extracted content to the backend for server-side analysis. */
  const runServerAnalysis = useCallback(
    async (tid: number, pageUrl: string, force = false) => {
      try {
        const resp = (await ext.tabs.sendMessage(tid, {
          type: "EXTRACT_CONTENT",
        })) as ExtractResponse | undefined;
        if (resp?.ok && resp.content) {
          const { imageUrls, videoUrl, ...rest } = resp.content as any;
          await api.analyzeContent({
            url: pageUrl,
            ...rest,
            image_urls: imageUrls,
            video_url: videoUrl,
            force,
          });
        } else {
          await api.triggerAnalysis(pageUrl);
        }
        ext.runtime.sendMessage({ type: "REFRESH_SCORE", url: pageUrl });
        await fetchApi(pageUrl);
      } catch {
        // Silent — local scan already displayed.
      }
    },
    [fetchApi],
  );

  // Check first-run status.
  useEffect(() => {
    ext.storage.local.get("firstRunDone").then((r) => {
      if (!r.firstRunDone) setFirstRun(true);
    });
  }, []);

  // Load exposure stats.
  useEffect(() => {
    hasHistory().then((has) => {
      if (has) getAllExposureStats().then(setExposure);
    });
  }, []);

  // Auto-scan on popup open.
  // Supports ?testUrl= for testing in a standalone tab (bypasses chrome.tabs).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const testUrl = params.get("testUrl");

    if (testUrl) {
      // Test mode: skip chrome.tabs, just fetch API data for the given URL.
      setUrl(testUrl);
      (async () => {
        const apiPromise = fetchApi(testUrl);
        // No content script available in test mode, so skip local scan.
        setScanning(false);
        await apiPromise;
      })();
      return;
    }

    ext.tabs.query({ active: true, currentWindow: true }).then(async (tabs) => {
      const tab = tabs[0];
      if (!tab?.url || !/^https?:\/\//.test(tab.url)) {
        setScanning(false);
        setError("Can't check this page.");
        return;
      }

      setTabId(tab.id ?? null);
      setUrl(tab.url);

      // 1. Fire API fetch in background (may be slow).
      const apiPromise = fetchApi(tab.url);

      // 2. Run local scan (fast, no network).
      if (tab.id != null) {
        const scan = await runLocalScan(tab.id);
        if (scan) setLocalScan(scan);
      }

      // Show results as soon as local scan finishes.
      setScanning(false);

      // 3. Wait for API, then kick off full server analysis.
      await apiPromise;
      if (tab.id != null) {
        runServerAnalysis(tab.id, tab.url);
      }
    });
  }, [fetchApi, runLocalScan, runServerAnalysis]);

  const handleVote = async (vote: VoteType) => {
    if (!url || submitting || votedAs !== null) return;
    setSubmitting(true);
    try {
      await api.submitVote({ url, vote });
      setVotedAs(vote);
      ext.runtime.sendMessage({ type: "VOTE_SUBMITTED", url });
      await fetchApi(url);
    } catch { /* silent */ } finally {
      setSubmitting(false);
    }
  };

  const handleReport = async () => {
    if (!url || reported) return;
    const current = displayScore(localScan, apiScore);
    const opposite = current !== null && current > 0.5 ? "human" : "ai_generated";
    try {
      await api.reportIncorrect({ url, reported_verdict: opposite as VoteType });
      setReported(true);
      // Re-scan with force — the report invalidated the LLM cache server-side,
      // so the next analysis will re-run the LLM waterfall.
      if (tabId) runServerAnalysis(tabId, url, true);
    } catch { /* silent */ }
  };

  const handleRescan = async () => {
    if (!url || !tabId) return;
    setScanning(true);
    setLocalScan(null);
    const scan = await runLocalScan(tabId);
    if (scan) setLocalScan(scan);
    setScanning(false);
    // Force bypass the LLM cache — user explicitly wants a fresh check.
    runServerAnalysis(tabId, url, true);
  };

  /* ---- Derived state ---- */
  const combined = displayScore(localScan, apiScore);
  const vClass = scanning ? "scanning" : verdictClass(combined);
  const domain = url ? new URL(url).hostname : "";
  const chips = buildSignalChips(localScan, apiScore);
  const totalVotes = votes?.total ?? 0;
  const crowdScore = apiScore?.crowd_score ?? null;
  const lowConfidence =
    (localScan && localScan.score > 0.3 && localScan.score <= 0.7) ||
    (!localScan && (apiScore?.confidence === "none" || apiScore?.confidence === "low"));
  const showCrowd = totalVotes > 0 || lowConfidence;
  const disagree = getDisagreement(localScan, crowdScore);

  /* ---- Render ---- */

  if (error && !localScan && !apiScore) {
    return (
      <div className="error-box">
        <div>{error}</div>
        {url && <button onClick={() => { setError(null); handleRescan(); }}>Retry</button>}
      </div>
    );
  }

  return (
    <div>
      {/* Zone A: Verdict Banner */}
      <div className={`verdict-banner ${vClass}`}>
        {scanning && <div className="banner-spinner" />}
        <div className="verdict-word">
          {verdictWord(combined, scanning)}
        </div>
        {!scanning && combined !== null && (
          <div className="verdict-pct">
            {Math.round(combined * 100)}% AI probability
          </div>
        )}
        {domain && <div className="verdict-domain">{domain}</div>}
        {url && combined !== null && !scanning && (
          <button
            className="share-btn"
            onClick={async () => {
              await shareVerdict(
                verdictWord(combined, false), Math.round(combined * 100), domain, url,
              );
              setShared(true);
              setTimeout(() => setShared(false), 2000);
            }}
          >
            {shared ? "Copied!" : "Share"}
          </button>
        )}
      </div>

      {/* First-run welcome */}
      {firstRun && (
        <div className="first-run">
          <span>I check if content is AI-generated. Browse normally — I'll tell you.</span>
          <button onClick={() => { setFirstRun(false); ext.storage.local.set({ firstRunDone: true }); }}>
            Got it
          </button>
        </div>
      )}

      {/* Zone B: Signal Chips */}
      {!scanning && (
        <div className="signals-section">
          <div className="signals-label">Why?</div>
          <div className="signal-chips">
            {chips.map((c, i) => (
              <span key={i} className={`signal-chip ${c.type}`}>{c.label}</span>
            ))}
          </div>
        </div>
      )}

      {/* Disagreement notice */}
      {!scanning && disagree.show && (
        <div className="disagreement-notice">
          <span className="disagree-icon">⚡</span>
          <span>
            Scanner says <strong>{disagree.scanLabel}</strong>, but the community
            says <strong>{disagree.crowdLabel}</strong>. Your vote helps settle it.
          </span>
        </div>
      )}

      {/* Community votes — visible when votes exist or confidence is low */}
      {!scanning && showCrowd && (
        <div className="community-section">
          <div className="community-header">
            <span className="signals-label">What others think</span>
            <div className="community-actions">
              <button
                className={`thumb-btn ${votedAs === "human" ? "voted" : ""}`}
                onClick={() => handleVote("human")}
                disabled={submitting || votedAs !== null}
                title="Not AI"
              >👍</button>
              <button
                className={`thumb-btn ${votedAs === "ai_generated" ? "voted" : ""}`}
                onClick={() => handleVote("ai_generated")}
                disabled={submitting || votedAs !== null}
                title="Is AI"
              >👎</button>
              {!reported ? (
                <button className="wrong-btn" onClick={handleReport}>Wrong?</button>
              ) : (
                <span className="reported-msg">Reported ✓</span>
              )}
            </div>
          </div>
          {totalVotes > 0 && votes && (
            <>
              <div className="bar">
                {votes.human > 0 && (
                  <div className="bar-seg human" style={{ width: `${(votes.human / totalVotes) * 100}%` }} />
                )}
                {votes.mixed > 0 && (
                  <div className="bar-seg mixed" style={{ width: `${(votes.mixed / totalVotes) * 100}%` }} />
                )}
                {votes.ai_generated > 0 && (
                  <div className="bar-seg ai" style={{ width: `${(votes.ai_generated / totalVotes) * 100}%` }} />
                )}
              </div>
              <div className="bar-label">
                {votes.human} not AI · {votes.mixed} mixed · {votes.ai_generated} AI
              </div>
            </>
          )}
          {totalVotes === 0 && (
            <div className="bar-label empty-votes">No votes yet — be the first to weigh in.</div>
          )}
        </div>
      )}

      {/* Minimal action row when crowd section is hidden */}
      {!scanning && !showCrowd && (
        <div className="actions-section">
          <button className="rescan-btn" onClick={handleRescan} disabled={scanning}>Re-scan</button>
          <div className="community-actions">
            <button
              className={`thumb-btn ${votedAs === "human" ? "voted" : ""}`}
              onClick={() => handleVote("human")}
              disabled={submitting || votedAs !== null}
              title="Looks human"
            >👍</button>
            <button
              className={`thumb-btn ${votedAs === "ai_generated" ? "voted" : ""}`}
              onClick={() => handleVote("ai_generated")}
              disabled={submitting || votedAs !== null}
              title="Looks AI"
            >👎</button>
          </div>
        </div>
      )}

      {/* AI Exposure stats */}
      {!scanning && exposure && exposure.some((e) => e.stats.totalPages > 0) && (
        <div className="exposure-section">
          <div className="signals-label">Your AI exposure</div>
          <div className="exposure-grid">
            {exposure.map((e) => {
              const pct = e.stats.aiPercentage;
              const colorClass = pct > 50 ? "high" : pct >= 20 ? "mid" : "low";
              return (
                <div key={e.label} className="exposure-cell">
                  <div className={`exposure-pct ${colorClass}`}>
                    {e.stats.totalPages > 0 ? `${pct}%` : "—"}
                  </div>
                  <div className="exposure-label">{e.label}</div>
                  {e.stats.totalPages > 0 && (
                    <div className="exposure-count">{e.stats.totalPages} pages</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Expandable details */}
      {!scanning && (
        <>
          <button className="details-toggle" onClick={() => setShowDetails(!showDetails)}>
            {showDetails ? "Hide details ▲" : "See details ▼"}
          </button>
          {showDetails && (
            <div className="details-panel">
              <div className="stat-row"><span>Local scan</span><span>{localScan ? `${(localScan.score * 100).toFixed(1)}%` : "—"}</span></div>
              <div className="stat-row"><span>Server AI score</span><span>{apiScore?.ai_score != null ? `${(apiScore.ai_score * 100).toFixed(1)}%` : "—"}</span></div>
              <div className="stat-row"><span>Crowd score</span><span>{crowdScore != null ? `${(crowdScore * 100).toFixed(1)}%` : "—"}</span></div>
              <div className="stat-row"><span>Platform</span><span>{apiScore?.platform || "generic"}</span></div>
              <div className="stat-row"><span>Content type</span><span>{apiScore?.content_type || "unknown"}</span></div>
              <div className="stat-row"><span>Last analyzed</span><span>{apiScore?.last_analyzed ? new Date(apiScore.last_analyzed).toLocaleDateString() : "never"}</span></div>
              {url && (
                <button className="rescan-btn details-rescan" onClick={handleRescan} disabled={scanning}>
                  Re-scan
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
