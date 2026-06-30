// Precision/recall metrics for the local heuristic scanner, measured against
// the labeled corpus in dataset.ts. Used by eval.test.ts to print a threshold
// sweep and to guard against regressions in false-positive rate.

import { scanText } from "../local-scanner";
import type { Sample } from "./dataset";

export interface Metrics {
  threshold: number;
  tp: number;
  fp: number;
  tn: number;
  fn: number;
  precision: number;
  recall: number;
  f1: number;
  accuracy: number;
}

export function scoreSample(s: Sample): number {
  return scanText(s.text, s.comments ?? []).score;
}

/** Confusion matrix + derived metrics treating score >= threshold as "AI". */
export function evaluate(samples: Sample[], threshold: number): Metrics {
  let tp = 0, fp = 0, tn = 0, fn = 0;
  for (const s of samples) {
    const predictedAI = scoreSample(s) >= threshold;
    const actuallyAI = s.label === "ai";
    if (predictedAI && actuallyAI) tp++;
    else if (predictedAI && !actuallyAI) fp++;
    else if (!predictedAI && !actuallyAI) tn++;
    else fn++;
  }
  const precision = tp + fp > 0 ? tp / (tp + fp) : 1;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 1;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  const accuracy = samples.length > 0 ? (tp + tn) / samples.length : 0;
  return { threshold, tp, fp, tn, fn, precision, recall, f1, accuracy };
}

export function sweep(samples: Sample[], thresholds: number[]): Metrics[] {
  return thresholds.map((t) => evaluate(samples, t));
}

/** Human samples the scanner would wrongly flag at the given threshold. */
export function falsePositives(samples: Sample[], threshold: number): Sample[] {
  return samples.filter((s) => s.label === "human" && scoreSample(s) >= threshold);
}

const round = (n: number): number => Math.round(n * 100) / 100;

/** Render a sweep as a printable table for console output in tests. */
export function formatSweep(rows: Metrics[]): string {
  const header = "thr   TP  FP  TN  FN   precision  recall  f1     acc";
  const lines = rows.map(
    (m) =>
      `${m.threshold.toFixed(2)}  ${String(m.tp).padStart(2)}  ${String(m.fp).padStart(2)}  ` +
      `${String(m.tn).padStart(2)}  ${String(m.fn).padStart(2)}   ` +
      `${round(m.precision).toFixed(2).padStart(6)}     ${round(m.recall).toFixed(2).padStart(5)}   ` +
      `${round(m.f1).toFixed(2)}   ${round(m.accuracy).toFixed(2)}`,
  );
  return [header, ...lines].join("\n");
}
