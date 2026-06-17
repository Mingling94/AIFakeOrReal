import React from "react";

interface ScoreGaugeProps {
  score: number | null;
  confidence: string;
}

function scoreColor(score: number): string {
  if (score <= 0.3) return "#4caf50";
  if (score <= 0.7) return "#ff9800";
  return "#f44336";
}

function scoreLabel(score: number): string {
  if (score <= 0.3) return "Likely Human";
  if (score <= 0.7) return "Mixed / Uncertain";
  return "Likely AI-Generated";
}

export function ScoreGauge({ score, confidence }: ScoreGaugeProps) {
  const pct = score !== null ? Math.round(score * 100) : 0;
  const color = score !== null ? scoreColor(score) : "#9e9e9e";
  const label = score !== null ? scoreLabel(score) : "No Score";

  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = score !== null
    ? circumference * (1 - score)
    : circumference;

  return (
    <div className="gauge-container">
      <svg className="gauge-svg" viewBox="0 0 130 130">
        <circle
          className="gauge-bg"
          cx="65"
          cy="65"
          r={radius}
          transform="rotate(-90 65 65)"
        />
        <circle
          className="gauge-fill"
          cx="65"
          cy="65"
          r={radius}
          stroke={color}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          transform="rotate(-90 65 65)"
        />
        <text className="gauge-text" x="65" y="62" fill={color}>
          {score !== null ? `${pct}%` : "?"}
        </text>
        <text x="65" y="82" textAnchor="middle" fontSize="10" fill="#888">
          {label}
        </text>
      </svg>
      <div className="gauge-label">AI-Generated Probability</div>
      <span className={`confidence-badge confidence-${confidence}`}>
        {confidence === "none" ? "No data" : `${confidence} confidence`}
      </span>
    </div>
  );
}
