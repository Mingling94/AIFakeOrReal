import React from "react";
import type { VoteBreakdown } from "../../common/types";

interface CommunityStatsProps {
  votes: VoteBreakdown | null;
}

export function CommunityStats({ votes }: CommunityStatsProps) {
  if (!votes || votes.total === 0) {
    return (
      <div className="stats-section">
        <h3>Community Votes</h3>
        <div className="stats-total">No votes yet</div>
      </div>
    );
  }

  const humanPct = (votes.human / votes.total) * 100;
  const mixedPct = (votes.mixed / votes.total) * 100;
  const aiPct = (votes.ai_generated / votes.total) * 100;

  return (
    <div className="stats-section">
      <h3>Community Votes</h3>
      <div className="stats-total">{votes.total} vote{votes.total !== 1 ? "s" : ""}</div>
      <div className="stats-bar">
        {humanPct > 0 && (
          <div
            className="stats-bar-segment human"
            style={{ width: `${humanPct}%` }}
          >
            {humanPct >= 15 ? `${Math.round(humanPct)}%` : ""}
          </div>
        )}
        {mixedPct > 0 && (
          <div
            className="stats-bar-segment mixed"
            style={{ width: `${mixedPct}%` }}
          >
            {mixedPct >= 15 ? `${Math.round(mixedPct)}%` : ""}
          </div>
        )}
        {aiPct > 0 && (
          <div
            className="stats-bar-segment ai"
            style={{ width: `${aiPct}%` }}
          >
            {aiPct >= 15 ? `${Math.round(aiPct)}%` : ""}
          </div>
        )}
      </div>
      <div className="stats-legend">
        <span className="legend-item">
          <span className="legend-dot" style={{ background: "#4caf50" }} />
          Human ({votes.human})
        </span>
        <span className="legend-item">
          <span className="legend-dot" style={{ background: "#ff9800" }} />
          Mixed ({votes.mixed})
        </span>
        <span className="legend-item">
          <span className="legend-dot" style={{ background: "#f44336" }} />
          AI ({votes.ai_generated})
        </span>
      </div>
    </div>
  );
}
