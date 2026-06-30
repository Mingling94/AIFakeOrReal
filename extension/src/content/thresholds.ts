// Detection thresholds for the local heuristic scanner, tuned against the eval
// corpus in src/content/eval. Guiding principle: FAVOR PRECISION over recall on
// anything the user sees passively. Wrongly flagging a human's post as AI
// destroys trust far faster than silently missing some AI content.
//
// Re-run `npm test` after changing these — eval.test.ts enforces that no human
// sample is flagged at BADGE_THRESHOLD or blurred at AVOIDANCE_THRESHOLD.

// Calibration note (see eval.test.ts output): the heuristic scores human text
// at ~0.08 and detectable AI text at ~0.37+, with a clean gap between. The old
// 0.5 badge threshold sat ABOVE the AI cluster, so badges almost never fired
// (recall ~0.07). These values live in the gap: precision stays 1.0 on the
// corpus while recall jumps to ~0.86.

/** Minimum score to show an in-feed "AI?" badge. */
export const BADGE_THRESHOLD = 0.3;

/** At/above this, the badge reads "AI" (high confidence) rather than "AI?". */
export const AI_LABEL_THRESHOLD = 0.6;

/**
 * Minimum score to blur/hide a post in avoidance mode. Set higher than the badge
 * threshold because hiding content is destructive — we only auto-hide when the
 * signal is strong (e.g. confirmed by comment accusations). Raising detection
 * quality (separate work) will let more genuine AI clear this bar safely.
 */
export const AVOIDANCE_THRESHOLD = 0.5;
