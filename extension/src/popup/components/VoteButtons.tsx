import React from "react";
import type { VoteType } from "../../common/types";

interface VoteButtonsProps {
  onVote: (vote: VoteType) => void;
  votedAs: VoteType | null;
  disabled: boolean;
}

export function VoteButtons({ onVote, votedAs, disabled }: VoteButtonsProps) {
  return (
    <div className="vote-section">
      <h3>Cast Your Vote</h3>
      <div className="vote-buttons">
        <button
          className={`vote-btn human ${votedAs === "human" ? "selected" : ""}`}
          onClick={() => onVote("human")}
          disabled={disabled || votedAs !== null}
        >
          Human
        </button>
        <button
          className={`vote-btn mixed ${votedAs === "mixed" ? "selected" : ""}`}
          onClick={() => onVote("mixed")}
          disabled={disabled || votedAs !== null}
        >
          Mixed
        </button>
        <button
          className={`vote-btn ai ${votedAs === "ai_generated" ? "selected" : ""}`}
          onClick={() => onVote("ai_generated")}
          disabled={disabled || votedAs !== null}
        >
          AI Generated
        </button>
      </div>
    </div>
  );
}
