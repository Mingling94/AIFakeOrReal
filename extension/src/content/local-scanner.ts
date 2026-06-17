// Client-side AI content scanner. Runs in the content script for fast, private
// filtering of posts. No network calls — uses the same word lists and patterns
// as the backend's vocabulary_signal, structure_signal, and comment_signal.
//
// Returns a 0..1 score. Posts scoring above the threshold (default 0.5) get an
// in-page badge. This is a filter, not a verdict — the backend runs the full
// analysis when the user clicks for details.

// --- Tier 1: Worst offenders (instant tells) ---
const TIER1 = new Set([
  "delve", "delving", "leverage", "utilize", "tapestry", "underscore",
  "pivotal", "multifaceted", "holistic", "seamless", "seamlessly",
  "groundbreaking", "transformative", "revolutionary", "facilitate",
  "empower", "harness", "foster", "cultivate", "bolster", "illuminate",
  "resonate", "nuance", "nuanced", "comprehensive", "compelling",
  "embark", "curated", "elevate", "calibrate", "democratize",
]);

// --- Tier 2: Suspicious when clustered ---
const TIER2 = new Set([
  "moreover", "furthermore", "additionally", "thus", "hence",
  "consequently", "paramount", "myriad", "plethora", "intricate",
  "profound", "endeavor", "meticulous", "meticulously", "inherently",
  "overarching", "actionable", "streamline", "synergy", "paradigm",
  "catalyst", "stakeholder", "salient", "albeit", "elucidate",
  "juxtaposition",
]);

// --- Dead-giveaway phrases ---
const PHRASE_RES: RegExp[] = [
  /in today'?s fast[- ]paced world/i,
  /in the ever[- ]evolving landscape/i,
  /it'?s important to note that/i,
  /it'?s worth mentioning/i,
  /let'?s dive in/i,
  /let'?s unpack this/i,
  /let'?s break this down/i,
  /unlock the (?:power|potential) of/i,
  /navigate the (?:landscape|complexities)/i,
  /revolutionizing the way/i,
  /you'?re absolutely right/i,
  /great question/i,
  /i'?d be happy to help/i,
  /i hope this helps/i,
  /in conclusion/i,
  /the bottom line is/i,
  /here'?s why this matters/i,
  /state[- ]of[- ]the[- ]art/i,
  /game[- ]changer/i,
  /best[- ]in[- ]class/i,
  /a testament to/i,
  /serves? as a testament/i,
];

// --- Comment accusation patterns ---
const ACCUSE_STRONG: RegExp[] = [
  /\bai[\s-]?generated\b/i,
  /\bgenerated\s+(?:by|with|using)\s+(?:an?\s+)?ai\b/i,
  /\b(?:made|created|drawn|written)\s+(?:by|with|using)\s+(?:an?\s+)?ai\b/i,
  /\bthis\s+is\s+(?:clearly\s+|obviously\s+|so\s+|just\s+|totally\s+)?ai\b/i,
  /\bis\s+this\s+(?:ai|ai[\s-]?generated)\b/i,
  /\bai\s+slop\b/i,
  /\bdeepfake\b/i,
];

const ACCUSE_WEAK: RegExp[] = [
  /\b(?:looks|seems|feels)\s+(?:like\s+)?ai\b/i,
  /\bai\s+(?:image|picture|photo|video|content|writing|garbage|trash)\b/i,
  /\b(?:chatgpt|midjourney|dall[\s-]?e|stable\s+diffusion)\b/i,
];

const NEGATION = /(?:\bnot\b|n't|\bdon'?t\s+think\b|\bisn'?t\b)/i;

export interface ScanResult {
  score: number;
  vocabTriggered: boolean;
  structureTriggered: boolean;
  accusationTriggered: boolean;
}

function countNonNegated(text: string, patterns: RegExp[]): number {
  let hits = 0;
  for (const pat of patterns) {
    // Check each line/sentence separately so negation windows are local
    for (const line of text.split(/\n/)) {
      const match = pat.exec(line);
      if (match) {
        const before = line.slice(Math.max(0, match.index - 18), match.index);
        if (!NEGATION.test(before)) hits++;
      }
    }
  }
  return hits;
}

export function scanText(text: string, comments: string[] = []): ScanResult {
  const hasComments = comments.length > 0;
  if (!text && !hasComments) {
    return { score: 0, vocabTriggered: false, structureTriggered: false, accusationTriggered: false };
  }
  const shortText = !text || text.split(/\s+/).length < 20;

  const words = (text || "").toLowerCase().split(/\s+/).filter(Boolean);
  const totalWords = words.length;

  // --- Vocabulary (skip if text too short) ---
  let t1 = 0;
  let t2 = 0;
  let phraseHits = 0;
  let vocabTriggered = false;
  let vocabScore = 0;
  if (!shortText) {
    for (const w of words) {
      if (TIER1.has(w)) t1++;
      if (TIER2.has(w)) t2++;
    }
    for (const re of PHRASE_RES) {
      if (re.test(text)) phraseHits++;
    }
    const vocabWeighted = t1 * 2 + t2 + phraseHits * 3;
    const vocabDensity = (vocabWeighted / totalWords) * 100;
    vocabTriggered = t1 >= 3 || (t1 >= 1 && t2 >= 3) || phraseHits >= 2;
    if (vocabDensity < 0.5) vocabScore = vocabDensity * 0.2;
    else if (vocabDensity < 1.5) vocabScore = 0.1 + (vocabDensity - 0.5) * 0.3;
    else if (vocabDensity < 3.0) vocabScore = 0.4 + (vocabDensity - 1.5) * 0.2;
    else vocabScore = Math.min(0.9, 0.7 + (vocabDensity - 3.0) * 0.05);
  }

  // --- Structure (skip if text too short) ---
  let structFlags = 0;
  const sentences = shortText ? [] : text.split(/[.!?]+/).filter((s) => s.trim().length > 0);

  // Em-dash overuse
  const emDashes = (text.match(/—/g) || []).length;
  if (sentences.length > 3 && emDashes / sentences.length > 0.25) structFlags++;

  // No contractions
  const contractions = /\b(?:i'm|i've|you're|it's|we're|they're|isn't|aren't|don't|doesn't|can't|won't|wouldn't|shouldn't|couldn't|that's|there's|let's)\b/i;
  if (totalWords > 100 && !contractions.test(text)) structFlags++;

  // Repetitive starters
  if (sentences.length >= 6) {
    const starters: Record<string, number> = {};
    for (const s of sentences) {
      const first = s.trim().split(/\s+/)[0]?.toLowerCase();
      if (first) starters[first] = (starters[first] || 0) + 1;
    }
    const maxRepeat = Math.max(...Object.values(starters));
    if (maxRepeat / sentences.length > 0.3) structFlags++;
  }

  // Tricolons
  const tricolons = (text.match(/\b\w+,\s+\w+,\s+and\s+\w+\b/gi) || []).length;
  if (tricolons >= 3) structFlags++;

  const structureTriggered = structFlags >= 2;
  const structScore = Math.min(0.85, structFlags * 0.2);

  // --- Comment accusations ---
  const commentText = comments.join("\n");
  const strongHits = countNonNegated(commentText, ACCUSE_STRONG);
  const weakHits = countNonNegated(commentText, ACCUSE_WEAK);
  const accusationTriggered = strongHits >= 1 || weakHits >= 2;
  let accuseScore = 0;
  if (accusationTriggered) {
    accuseScore = strongHits >= 1
      ? Math.min(0.95, 0.7 + 0.06 * (strongHits - 1) + 0.03 * weakHits)
      : Math.min(0.75, 0.55 + 0.05 * (weakHits - 2));
  }

  // --- Combined ---
  let score =
    0.35 * vocabScore + 0.30 * structScore + 0.20 * accuseScore + 0.15 * 0.5;
  score = Math.max(0, Math.min(1, score));

  if (accusationTriggered) score = Math.max(score, accuseScore);

  return {
    score: Math.round(score * 100) / 100,
    vocabTriggered,
    structureTriggered,
    accusationTriggered,
  };
}
