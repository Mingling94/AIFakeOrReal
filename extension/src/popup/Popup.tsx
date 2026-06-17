import React, { useCallback, useEffect, useState } from "react";
import type {
  ContentData,
  ScoreResponse,
  VoteBreakdown,
  VoteType,
} from "../common/types";
import { api } from "../common/api";
import { ext } from "../common/browser";
import "./popup.css";

interface ExtractResponse {
  ok: boolean;
  content?: Omit<ContentData, "url">;
  error?: string;
}

function verdictClass(score: number | null): string {
  if (score === null) return "unknown";
  if (score <= 0.3) return "human";
  if (score <= 0.7) return "mixed";
  return "ai";
}

function verdictWord(score: number | null): string {
  if (score === null) return "Not checked yet";
  if (score <= 0.3) return "Human";
  if (score <= 0.7) return "Unclear";
  return "AI Generated";
}

function confidenceText(confidence: string, voteCount: number): string {
  if (confidence === "none") return "No data available";
  const base = confidence === "high" ? "High" : confidence === "medium" ? "Moderate" : "Limited";
  const parts: string[] = [`${base} confidence`];
  if (voteCount > 0) parts.push(`${voteCount} report${voteCount !== 1 ? "s" : ""}`);
  return parts.join(" · ");
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

function buildSignalChips(score: ScoreResponse): Chip[] {
  const chips: Chip[] = [];
  const sig = score.signals;

  if (!sig && score.ai_score === null) {
    chips.push({ label: "Not yet scanned", type: "neutral" });
    return chips;
  }

  if (sig) {
    // Vocabulary signals
    if (sig.vocabulary_triggered) {
      const label =
        sig.vocabulary_tier1_count > 5
          ? `Heavy AI vocabulary (${sig.vocabulary_tier1_count} words)`
          : "Some AI-typical words";
      chips.push({ label, type: "negative" });
    } else {
      chips.push({ label: "Natural vocabulary", type: "positive" });
    }

    // Structure signals
    if (sig.structure_triggered) {
      const flag = sig.structure_flags[0];
      chips.push({
        label: FLAG_LABELS[flag] || "Uniform structure",
        type: "negative",
      });
      if (sig.structure_flags.length > 1) {
        chips.push({
          label: `+${sig.structure_flags.length - 1} more structural flags`,
          type: "negative",
        });
      }
    } else {
      chips.push({ label: "Varied writing style", type: "positive" });
    }

    // Comment signals
    if (sig.comment_triggered) {
      chips.push({
        label: `Comments call it AI (${sig.comment_examples.length})`,
        type: "negative",
      });
    }
  } else if (score.ai_score !== null) {
    // Analysis ran but no signals stored (legacy data)
    if (score.ai_score <= 0.3) {
      chips.push({ label: "Natural vocabulary", type: "positive" });
    } else if (score.ai_score > 0.7) {
      chips.push({ label: "AI patterns detected", type: "negative" });
    } else {
      chips.push({ label: "Some AI patterns", type: "neutral" });
    }
  }

  // Crowd signal (always secondary)
  if (score.vote_count > 0 && score.crowd_score !== null) {
    if (score.crowd_score > 0.7) {
      chips.push({ label: "Users flagged as AI", type: "negative" });
    } else if (score.crowd_score < 0.3) {
      chips.push({ label: "Users say it's real", type: "positive" });
    }
  }

  return chips;
}

export function Popup() {
  const [tabId, setTabId] = useState<number | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [score, setScore] = useState<ScoreResponse | null>(null);
  const [votes, setVotes] = useState<VoteBreakdown | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [votedAs, setVotedAs] = useState<VoteType | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [reported, setReported] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const fetchData = useCallback(async (pageUrl: string) => {
    setLoading(true);
    setError(null);
    try {
      const [scoreData, voteData] = await Promise.all([
        api.getScore(pageUrl),
        api.getVotes(pageUrl),
      ]);
      setScore(scoreData);
      setVotes(voteData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to connect.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    ext.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
      const tab = tabs[0];
      if (tab?.url && /^https?:\/\//.test(tab.url)) {
        setTabId(tab.id ?? null);
        setUrl(tab.url);
        fetchData(tab.url);
      } else {
        setLoading(false);
        setError("Can't check this page.");
      }
    });
  }, [fetchData]);

  const handleAnalyze = async () => {
    if (!url || analyzing) return;
    setAnalyzing(true);
    setError(null);
    try {
      let analyzed = false;
      if (tabId !== null) {
        try {
          const resp = (await ext.tabs.sendMessage(tabId, {
            type: "EXTRACT_CONTENT",
          })) as ExtractResponse | undefined;
          if (resp?.ok && resp.content) {
            await api.analyzeContent({ url, ...resp.content });
            analyzed = true;
          }
        } catch { /* content script unavailable */ }
      }
      if (!analyzed) await api.triggerAnalysis(url);
      ext.runtime.sendMessage({ type: "REFRESH_SCORE", url });
      await fetchData(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scan failed.");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleVote = async (vote: VoteType) => {
    if (!url || submitting || votedAs !== null) return;
    setSubmitting(true);
    try {
      await api.submitVote({ url, vote });
      setVotedAs(vote);
      ext.runtime.sendMessage({ type: "VOTE_SUBMITTED", url });
      await fetchData(url);
    } catch { /* silent */ } finally {
      setSubmitting(false);
    }
  };

  const handleReport = async () => {
    if (!url || reported) return;
    const current = score?.combined_score;
    const opposite = current !== null && (current ?? 0) > 0.5 ? "human" : "ai_generated";
    try {
      await api.reportIncorrect({ url, reported_verdict: opposite as VoteType });
      setReported(true);
    } catch { /* silent */ }
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
        <div>Checking...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-box">
        <div>{error}</div>
        {url && <button onClick={() => fetchData(url)}>Retry</button>}
      </div>
    );
  }

  const combined = score?.combined_score ?? null;
  const vClass = verdictClass(combined);
  const pct = combined !== null ? `${Math.round(combined * 100)}% AI probability` : "";
  const domain = url ? new URL(url).hostname : "";
  const chips = score ? buildSignalChips(score) : [];
  const notAnalyzed = score?.ai_score === null;
  const totalVotes = votes?.total ?? 0;

  return (
    <div>
      {/* Zone A: Verdict Banner */}
      <div className={`verdict-banner ${vClass}`}>
        <div className="verdict-word">{verdictWord(combined)}</div>
        {pct && <div className="verdict-pct">{pct}</div>}
        {domain && <div className="verdict-domain">{domain}</div>}
      </div>

      {/* Zone B: Signal Chips */}
      <div className="signals-section">
        <div className="signals-label">Why?</div>
        <div className="signal-chips">
          {chips.map((c, i) => (
            <span key={i} className={`signal-chip ${c.type}`}>{c.label}</span>
          ))}
        </div>
        {score && (
          <div className="confidence-line">
            {confidenceText(score.confidence, score.vote_count)}
          </div>
        )}
      </div>

      {/* Community votes (compact bar) */}
      {totalVotes > 0 && votes && (
        <div className="community-compact">
          <div className="signals-label">What others think</div>
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
            {votes.human} human · {votes.mixed} mixed · {votes.ai_generated} AI
          </div>
        </div>
      )}

      {/* Zone C: Actions */}
      <div className="actions-section">
        {notAnalyzed ? (
          <button className="scan-btn" onClick={handleAnalyze} disabled={analyzing}>
            {analyzing ? "Scanning..." : "Scan this page"}
          </button>
        ) : (
          <button className="scan-btn" onClick={handleAnalyze} disabled={analyzing}
            style={{ background: "transparent", color: "#64748b", fontWeight: 400 }}>
            {analyzing ? "Scanning..." : "Re-scan"}
          </button>
        )}

        <div className="action-links">
          <div className="vote-thumbs">
            <button
              className={`thumb-btn ${votedAs === "human" ? "voted" : ""}`}
              onClick={() => handleVote("human")}
              disabled={submitting || votedAs !== null}
              title="Looks real"
            >👍</button>
            <button
              className={`thumb-btn ${votedAs === "ai_generated" ? "voted" : ""}`}
              onClick={() => handleVote("ai_generated")}
              disabled={submitting || votedAs !== null}
              title="Looks AI"
            >👎</button>
          </div>

          {!reported ? (
            <button className="wrong-btn" onClick={handleReport}>Wrong?</button>
          ) : (
            <span className="reported-msg">Reported</span>
          )}
        </div>
      </div>

      {/* Expandable details */}
      <button className="details-toggle" onClick={() => setShowDetails(!showDetails)}>
        {showDetails ? "Hide details ▲" : "See details ▼"}
      </button>
      {showDetails && score && (
        <div className="details-panel">
          <div className="stat-row"><span>AI score</span><span>{score.ai_score !== null ? (score.ai_score * 100).toFixed(1) + "%" : "—"}</span></div>
          <div className="stat-row"><span>Crowd score</span><span>{score.crowd_score !== null ? (score.crowd_score * 100).toFixed(1) + "%" : "—"}</span></div>
          <div className="stat-row"><span>Combined</span><span>{combined !== null ? (combined * 100).toFixed(1) + "%" : "—"}</span></div>
          <div className="stat-row"><span>Platform</span><span>{score.platform || "generic"}</span></div>
          <div className="stat-row"><span>Content type</span><span>{score.content_type || "unknown"}</span></div>
          <div className="stat-row"><span>Last analyzed</span><span>{score.last_analyzed ? new Date(score.last_analyzed).toLocaleDateString() : "never"}</span></div>
        </div>
      )}
    </div>
  );
}
