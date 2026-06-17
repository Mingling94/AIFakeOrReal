import React, { useCallback, useEffect, useState } from "react";
import type {
  ContentData,
  ScoreResponse,
  VoteBreakdown,
  VoteType,
} from "../common/types";
import { api } from "../common/api";
import { ext } from "../common/browser";
import { ScoreGauge } from "./components/ScoreGauge";
import { VoteButtons } from "./components/VoteButtons";
import { CommunityStats } from "./components/CommunityStats";

interface ExtractResponse {
  ok: boolean;
  content?: Omit<ContentData, "url">;
  error?: string;
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
      setError(e instanceof Error ? e.message : "Failed to fetch data.");
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
        setError("Cannot analyze this page.");
      }
    });
  }, [fetchData]);

  const handleVote = async (vote: VoteType) => {
    if (!url || submitting) return;
    setSubmitting(true);
    try {
      await api.submitVote({ url, vote });
      setVotedAs(vote);
      ext.runtime.sendMessage({ type: "VOTE_SUBMITTED", url });
      await fetchData(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Vote failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAnalyze = async () => {
    if (!url || analyzing) return;
    setAnalyzing(true);
    setError(null);
    try {
      // Prefer reading the page the user is viewing (works behind logins and
      // expands comments). Fall back to server-side fetch if that fails.
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
        } catch {
          /* content script unavailable on this page; fall back below */
        }
      }
      if (!analyzed) {
        await api.triggerAnalysis(url);
      }
      ext.runtime.sendMessage({ type: "REFRESH_SCORE", url });
      await fetchData(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed.");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleReport = async (reportedVerdict: "human" | "mixed" | "ai_generated") => {
    if (!url || reported) return;
    try {
      await api.reportIncorrect({ url, reported_verdict: reportedVerdict });
      setReported(true);
    } catch {
      // Silently fail — the report is best-effort from the user's perspective.
    }
  };

  const domain = url ? new URL(url).hostname : "";
  const hasData = score && (score.combined_score !== null || score.vote_count > 0);

  return (
    <div>
      <div className="popup-header">
        <h1>AI Fake Or Real</h1>
        {domain && <div className="domain">{domain}</div>}
      </div>
      <div className="popup-body">
        {loading ? (
          <div className="loading">
            <div className="spinner" />
            <div>Checking this page...</div>
          </div>
        ) : error ? (
          <div className="error-box">
            <div>{error}</div>
            {url && (
              <button onClick={() => fetchData(url)}>Retry</button>
            )}
          </div>
        ) : hasData ? (
          <>
            <ScoreGauge
              score={score!.combined_score}
              confidence={score!.confidence}
            />
            <VoteButtons
              onVote={handleVote}
              votedAs={votedAs}
              disabled={submitting}
            />
            <CommunityStats votes={votes} />
            {!reported ? (
              <div className="report-section">
                <button
                  className="report-btn"
                  onClick={() => {
                    const current = score!.combined_score;
                    const opposite =
                      current !== null && current > 0.5 ? "human" : "ai_generated";
                    handleReport(opposite);
                  }}
                >
                  Report incorrect
                </button>
              </div>
            ) : (
              <div className="report-section reported">Thanks for the report!</div>
            )}
          </>
        ) : (
          <div className="no-data">
            <p>No data yet for this page.</p>
            <p>Be the first to analyze it!</p>
            <button
              className="analyze-btn"
              onClick={handleAnalyze}
              disabled={analyzing}
            >
              {analyzing ? "Analyzing..." : "Analyze This Page"}
            </button>
            <div style={{ marginTop: 16 }}>
              <VoteButtons
                onVote={handleVote}
                votedAs={votedAs}
                disabled={submitting}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
