import type {
  AnalysisResult,
  ContentData,
  ReportRequest,
  ScoreResponse,
  Token,
  UserStats,
  VoteBreakdown,
  VoteRequest,
  VoteResponse,
} from "./types";
import { getApiUrl, getLlmKeys, getLlmPreferred, getToken } from "./config";

// Attach the user's BYOK config (own provider keys + preferred order) to an
// analyze request body. Only non-empty values are sent; an empty result means
// the server uses its own shared keys.
async function llmConfigBody(): Promise<{ llm_keys?: Record<string, string>; llm_preferred?: string[] }> {
  const [keys, preferred] = await Promise.all([getLlmKeys(), getLlmPreferred()]);
  const out: { llm_keys?: Record<string, string>; llm_preferred?: string[] } = {};
  const nonEmpty = Object.fromEntries(
    Object.entries(keys).filter(([, v]) => typeof v === "string" && v.trim()),
  );
  if (Object.keys(nonEmpty).length > 0) out.llm_keys = nonEmpty as Record<string, string>;
  if (preferred.length > 0) out.llm_preferred = preferred;
  return out;
}

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

  async triggerAnalysis(pageUrl: string): Promise<AnalysisResult> {
    return request(`/analyze?url=${encodeURIComponent(pageUrl)}`, {
      method: "POST",
      body: JSON.stringify(await llmConfigBody()),
    });
  },

  // Analyze content the extension extracted from the page (incl. comments).
  async analyzeContent(content: ContentData): Promise<AnalysisResult> {
    return request("/analyze/content", {
      method: "POST",
      body: JSON.stringify({ ...content, ...(await llmConfigBody()) }),
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

  reportIncorrect(report: ReportRequest): Promise<void> {
    return request("/report", { method: "POST", body: JSON.stringify(report) });
  },
};
