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

export interface AnalysisResult {
  url_hash: string;
  url: string;
  content: {
    title: string;
    word_count: number;
    image_count: number;
  };
  analysis: {
    perplexity_proxy: number;
    burstiness: number;
    vocabulary_richness: number;
    sentence_uniformity: number;
    overall: number;
  };
  combined_score: number | null;
}

export interface UserStats {
  id: string;
  email: string;
  reputation: number;
  total_votes: number;
  accuracy_rate: number;
}

export interface Token {
  access_token: string;
  token_type: string;
}

export interface ReportRequest {
  url: string;
  reported_verdict: VoteType;
  reason?: string;
}

// Content extracted from the page by the content script and sent to the
// backend's /analyze/content endpoint.
export interface ContentData {
  url: string;
  platform?: string;
  content_type?: string;
  title: string;
  text: string;
  comments: string[];
}
