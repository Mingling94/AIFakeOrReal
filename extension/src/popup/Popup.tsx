import React, { useCallback, useEffect, useState } from "react";
import type { ScoreResponse, VoteBreakdown, VoteType } from "../common/types";
import { api } from "../common/api";
import { ScoreGauge } from "./components/ScoreGauge";
import { VoteButtons } from "./components/VoteButtons";
import { CommunityStats } from "./components/CommunityStats";

export function Popup() {
  const [url, setUrl] = useState<string | null>(null);
  const [score, setScore] = useState<ScoreResponse | null>(null);
  const [votes, setVotes] = useState<VoteBreakdown | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [votedAs, setVotedAs] = useState<VoteType | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabUrl = tabs[0]?.url;
      if (tabUrl && !tabUrl.startsWith("chrome://")) {
        setUrl(tabUrl);
        fetchData(tabUrl);
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
      chrome.runtime.sendMessage({ type: "VOTE_SUBMITTED", url });
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
      await api.triggerAnalysis(url);
      chrome.runtime.sendMessage({ type: "REFRESH_SCORE", url });
      await fetchData(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed.");
    } finally {
      setAnalyzing(false);
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
