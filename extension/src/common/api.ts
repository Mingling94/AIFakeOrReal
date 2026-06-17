import type {
  AnalysisResult,
  ContentData,
  ScoreResponse,
  Token,
  UserStats,
  VoteBreakdown,
  VoteRequest,
  VoteResponse,
} from "./types";
import { getApiUrl, getToken } from "./config";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const baseUrl = await getApiUrl();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  const token = await getToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${baseUrl}${path}`, { ...options, headers });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail || `API error: ${response.status}`);
  }
  return response.json();
}

export const api = {
  getScore(pageUrl: string): Promise<ScoreResponse> {
    return request(`/score?url=${encodeURIComponent(pageUrl)}`);
  },

  submitVote(vote: VoteRequest): Promise<VoteResponse> {
    return request("/vote", { method: "POST", body: JSON.stringify(vote) });
  },

  getVotes(pageUrl: string): Promise<VoteBreakdown> {
    return request(`/votes?url=${encodeURIComponent(pageUrl)}`);
  },

  triggerAnalysis(pageUrl: string): Promise<AnalysisResult> {
    return request(`/analyze?url=${encodeURIComponent(pageUrl)}`, { method: "POST" });
  },

  // Analyze content the extension extracted from the page (incl. comments).
  analyzeContent(content: ContentData): Promise<AnalysisResult> {
    return request("/analyze/content", {
      method: "POST",
      body: JSON.stringify(content),
    });
  },

  getAnalysis(pageUrl: string): Promise<AnalysisResult> {
    return request(`/analysis?url=${encodeURIComponent(pageUrl)}`);
  },

  batchScores(urls: string[]): Promise<{ scores: ScoreResponse[] }> {
    return request("/scores/batch", {
      method: "POST",
      body: JSON.stringify({ urls }),
    });
  },

  login(email: string, password: string): Promise<Token> {
    return request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  },

  register(email: string, password: string): Promise<Token> {
    return request("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  },

  getUserStats(): Promise<UserStats> {
    return request("/auth/me");
  },
};
