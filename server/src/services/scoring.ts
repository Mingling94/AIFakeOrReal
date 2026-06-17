import { createHash } from "crypto";

const AI_WEIGHT_LOW = Number(process.env.AI_WEIGHT_LOW_VOTES ?? 0.95);
const AI_WEIGHT_HIGH = Number(process.env.AI_WEIGHT_HIGH_VOTES ?? 0.75);
const VOTE_LOW = Number(process.env.VOTE_THRESHOLD_LOW ?? 10);
const VOTE_HIGH = Number(process.env.VOTE_THRESHOLD_HIGH ?? 100);
const MAX_URL_LENGTH = Number(process.env.MAX_URL_LENGTH ?? 2048);

export function normalizeUrl(url: string): string {
  const u = new URL(url);
  u.hash = "";
  let path = u.pathname.replace(/\/+$/, "") || "/";
  u.pathname = path;
  return u.toString().toLowerCase();
}

export function hashUrl(url: string): string {
  return createHash("sha256").update(normalizeUrl(url)).digest("hex");
}

export function extractDomain(url: string): string {
  return new URL(url).hostname.toLowerCase();
}

export function validateUrl(url: string): void {
  if (!url || !url.trim()) throw new Error("URL must not be empty.");
  if (url.length > MAX_URL_LENGTH)
    throw new Error(`URL exceeds the maximum length of ${MAX_URL_LENGTH} characters.`);
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Invalid URL format.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
    throw new Error("URL must use the http or https scheme.");
  if (!parsed.hostname) throw new Error("URL must include a host.");
}

const VOTE_SCORES: Record<string, number> = { human: 0, mixed: 0.5, ai_generated: 1 };

export function calculateCrowdScore(
  votes: Array<{ vote: string; reputation: number }>
): number | null {
  if (votes.length === 0) return null;
  let wSum = 0, wTotal = 0;
  for (const { vote, reputation } of votes) {
    const w = Math.max(reputation, 0.1);
    wSum += (VOTE_SCORES[vote] ?? 0.5) * w;
    wTotal += w;
  }
  return wTotal === 0 ? null : wSum / wTotal;
}

export function calculateCombinedScore(
  aiScore: number | null,
  crowdScore: number | null,
  voteCount: number
): number | null {
  if (aiScore === null && crowdScore === null) return null;
  if (aiScore === null) return crowdScore;
  if (crowdScore === null) return aiScore;

  let aiWeight: number;
  if (voteCount <= VOTE_LOW) aiWeight = AI_WEIGHT_LOW;
  else if (voteCount >= VOTE_HIGH) aiWeight = AI_WEIGHT_HIGH;
  else {
    const ratio = (voteCount - VOTE_LOW) / (VOTE_HIGH - VOTE_LOW);
    aiWeight = AI_WEIGHT_LOW - ratio * (AI_WEIGHT_LOW - AI_WEIGHT_HIGH);
  }
  return aiWeight * aiScore + (1 - aiWeight) * crowdScore;
}

export function scoreToConfidence(voteCount: number, aiScore: number | null): string {
  if (voteCount === 0 && aiScore === null) return "none";
  if (voteCount < 5) return "low";
  if (voteCount < 50) return "medium";
  return "high";
}

export function scoreToVerdict(score: number | null): string {
  if (score === null) return "unknown";
  if (score <= 0.3) return "human";
  if (score <= 0.7) return "mixed";
  return "ai_generated";
}

export function detectPlatform(url: string): string {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "generic";
  }
  if (host === "instagram.com" || host.endsWith(".instagram.com")) return "instagram";
  if (host === "facebook.com" || host === "fb.com" || host === "fb.watch" || host.endsWith(".facebook.com")) return "facebook";
  if (host === "reddit.com" || host === "redd.it" || host.endsWith(".reddit.com")) return "reddit";
  if (host === "youtube.com" || host === "youtu.be" || host.endsWith(".youtube.com")) return "youtube";
  if (host === "tiktok.com" || host.endsWith(".tiktok.com")) return "tiktok";
  if (host === "x.com" || host === "twitter.com" || host.endsWith(".x.com") || host.endsWith(".twitter.com")) return "twitter";
  return "generic";
}
