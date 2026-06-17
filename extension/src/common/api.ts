import type {
  AnalysisResult,
  ScoreResponse,
  Token,
  UserStats,
  VoteBreakdown,
  VoteRequest,
  VoteResponse,
} from "./types";

const DEFAULT_BASE_URL = "http://localhost:8000/api/v1";

function getBaseUrl(): string {
  return localStorage.getItem("aifakeorreal_api_url") || DEFAULT_BASE_URL;
}

function getToken(): string | null {
  return localStorage.getItem("aifakeorreal_token");
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${getBaseUrl()}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  const token = getToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(url, { ...options, headers });

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
    return request("/vote", {
      method: "POST",
      body: JSON.stringify(vote),
    });
  },

  getVotes(pageUrl: string): Promise<VoteBreakdown> {
    return request(`/votes?url=${encodeURIComponent(pageUrl)}`);
  },

  triggerAnalysis(pageUrl: string): Promise<AnalysisResult> {
    return request(`/analyze?url=${encodeURIComponent(pageUrl)}`, {
      method: "POST",
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
