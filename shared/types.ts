// Shared types used by both the backend server and the browser extension.
// Single source of truth — no drift between Python schemas and TS interfaces.

export interface SignalSummary {
  vocabulary_triggered: boolean;
  vocabulary_tier1_count: number;
  structure_triggered: boolean;
  structure_flags: string[];
  comment_triggered: boolean;
  comment_examples: string[];
}

export interface ScoreResponse {
  url_hash: string;
  url: string;
  domain: string;
  ai_score: number | null;
  crowd_score: number | null;
  combined_score: number | null;
  vote_count: number;
  platform: string;
  content_type: string;
  last_analyzed: string | null;
  confidence: "none" | "low" | "medium" | "high";
  signals: SignalSummary | null;
}

export type VoteType = "human" | "mixed" | "ai_generated";

export interface VoteRequest {
  url: string;
  vote: VoteType;
  confidence?: number;
}

export interface VoteResponse {
  id: string;
  url_hash: string;
  vote: string;
  created_at: string;
}

export interface VoteBreakdown {
  human: number;
  mixed: number;
  ai_generated: number;
  total: number;
}

export interface AnalyzeContentRequest {
  url: string;
  platform?: string;
  content_type?: string;
  title?: string;
  text: string;
  comments?: string[];
}

export interface CheckResponse {
  url: string;
  platform: string;
  content_type: string;
  verdict: "human" | "mixed" | "ai_generated" | "unknown";
  ai_probability: number | null;
  confidence: string;
  analyzed: boolean;
  votes: VoteBreakdown;
  signals: { ai_score: number | null; crowd_score: number | null };
}

export interface ReportRequest {
  url: string;
  reported_verdict: VoteType;
  reason?: string;
}

export interface ReportResponse {
  id: string;
  url_hash: string;
  reported_verdict: string;
  reason: string | null;
  status: string;
  created_at: string;
}

export interface Token {
  access_token: string;
  token_type: string;
}

export interface UserResponse {
  id: string;
  email: string;
  reputation: number;
  total_votes: number;
  accuracy_rate: number;
}

export interface APIKeyCreated {
  api_key: string;
  prefix: string;
  tier: string;
  name: string;
}

export interface APIKeyUsage {
  prefix: string;
  tier: string;
  name: string;
  request_count: number;
  created_at: string;
}

// Content extracted client-side by the extension.
export interface ContentData {
  url: string;
  platform?: string;
  content_type?: string;
  title: string;
  text: string;
  comments: string[];
}

export interface BatchScoreRequest {
  urls: string[];
}

export interface BatchScoreResponse {
  scores: ScoreResponse[];
}
