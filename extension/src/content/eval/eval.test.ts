import { describe, expect, it } from "vitest";
import { DATASET } from "./dataset";
import { evaluate, falsePositives, formatSweep, scoreSample, sweep } from "./metrics";
import { AVOIDANCE_THRESHOLD, BADGE_THRESHOLD } from "../thresholds";

// This suite doubles as documentation: run `npm test` to see the precision/recall
// sweep printed to the console, and as a regression guard on false positives.
describe("local-scanner accuracy benchmark", () => {
  it("prints a threshold sweep over the labeled corpus", () => {
    const rows = sweep(DATASET, [0.28, 0.3, 0.32, 0.34, 0.36, 0.4, 0.5, 0.6]);
    const humans = DATASET.filter((s) => s.label === "human").length;
    const ais = DATASET.filter((s) => s.label === "ai").length;
    const humanScores = DATASET.filter((s) => s.label === "human").map(scoreSample).sort((a, b) => b - a);
    const aiScores = DATASET.filter((s) => s.label === "ai").map(scoreSample).sort((a, b) => a - b);
    // eslint-disable-next-line no-console
    console.log(
      `\nCorpus: ${humans} human, ${ais} AI samples\n${formatSweep(rows)}\n` +
        `human scores (high→low): ${humanScores.map((s) => s.toFixed(2)).join(", ")}\n` +
        `ai scores (low→high):    ${aiScores.map((s) => s.toFixed(2)).join(", ")}\n`,
    );
    expect(rows.length).toBeGreaterThan(0);
  });

  it("never flags a human sample as AI at the BADGE threshold (precision = 1.0)", () => {
    const fps = falsePositives(DATASET, BADGE_THRESHOLD);
    if (fps.length > 0) {
      // eslint-disable-next-line no-console
      console.log(
        "False positives at badge threshold:\n" +
          fps.map((s) => `  [${scoreSample(s).toFixed(2)}] ${s.note}: ${s.text.slice(0, 60)}...`).join("\n"),
      );
    }
    expect(fps).toHaveLength(0);
  });

  it("never blurs/hides a human sample at the AVOIDANCE threshold", () => {
    expect(falsePositives(DATASET, AVOIDANCE_THRESHOLD)).toHaveLength(0);
  });

  it("still catches obvious AI text at the badge threshold (recall floor)", () => {
    const m = evaluate(DATASET, BADGE_THRESHOLD);
    // We favor precision, but the heuristic must still catch the blatant cases.
    expect(m.recall).toBeGreaterThanOrEqual(0.7);
  });
});
