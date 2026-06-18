import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { scanText } from "../shared/scanner.js";
import type { AnalyzeContentRequest, SignalSummary } from "../shared/types.js";
import { db } from "../db/index.js";
import { urls } from "../db/schema.js";
import {
  calculateCombinedScore,
  detectPlatform,
  extractDomain,
  hashUrl,
  validateUrl,
} from "../services/scoring.js";
import { detectWithLLM, hasLLMProvider, listProviders } from "../services/llm-detection.js";
import type { DetectionInput } from "../services/llm-detection.js";
import { getOrCreate, toResponse } from "./scores.js";

// How long an LLM analysis result is considered fresh. Within this window,
// subsequent requests for the same URL reuse the cached score from the DB
// instead of burning another LLM call. Set to 1 week — content rarely changes
// that fast, and users can force a re-scan if they disagree.
const LLM_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 1 week

export async function performAnalysis(
  url: string,
  text: string,
  comments: string[] = [],
  platform?: string,
  contentType?: string,
  imageUrls?: string[],
  videoUrl?: string,
  forceRescan = false,
) {
  const row = await getOrCreate(url);

  // --- Cache check: skip LLM if a recent analysis exists. ---
  // Bypassed when forceRescan is true (user clicked re-scan or reported "Wrong").
  const cachedAnalysis = !forceRescan &&
    row.lastAnalyzed &&
    (Date.now() - new Date(row.lastAnalyzed).getTime()) < LLM_CACHE_TTL_MS &&
    row.aiScore !== null;

  // 1. Run heuristic scan on text (instant, no network).
  const heuristic = scanText(text, comments);

  // 2. Run LLM detection — only if no cached result.
  let llmScore: number | null = null;
  let llmProvider: string | null = null;
  let llmContentType: string | null = null;

  if (cachedAnalysis) {
    // Reuse the stored AI score. The heuristic still ran above, but
    // we don't re-blend — the stored aiScore already includes the LLM weight
    // from the original analysis.
    const [fresh] = await db.select().from(urls).where(eq(urls.urlHash, row.urlHash));
    return {
      urlScore: fresh,
      analysis: {
        ...heuristic,
        overall: fresh.aiScore,
        llm_score: null,
        llm_provider: "cached",
        llm_content_type: null,
      },
    };
  }

  if (hasLLMProvider()) {
    const input: DetectionInput = {};
    if (text && text.length >= 50) input.text = text;
    if (imageUrls?.length) input.imageUrls = imageUrls;
    if (videoUrl) input.videoUrl = videoUrl;

    if (input.text || input.imageUrls || input.videoUrl) {
      const llmResult = await detectWithLLM(input);
      if (llmResult) {
        llmScore = llmResult.score;
        llmProvider = llmResult.provider;
        llmContentType = llmResult.contentType;
      }
    }
  }

  // 3. Combine heuristic + LLM scores.
  let aiScore: number;
  if (llmScore !== null && heuristic.score > 0) {
    aiScore = 0.7 * llmScore + 0.3 * heuristic.score;
  } else if (llmScore !== null) {
    aiScore = llmScore;
  } else {
    aiScore = heuristic.score;
  }
  aiScore = Math.round(aiScore * 100) / 100;

  const signals: SignalSummary = {
    vocabulary_triggered: heuristic.vocabTriggered,
    vocabulary_tier1_count: 0,
    structure_triggered: heuristic.structureTriggered,
    structure_flags: [],
    comment_triggered: heuristic.accusationTriggered,
    comment_examples: [],
  };

  const combinedScore = calculateCombinedScore(aiScore, row.crowdScore, row.voteCount);

  await db
    .update(urls)
    .set({
      aiScore,
      combinedScore,
      platform: platform || detectPlatform(url),
      contentType: contentType || (llmContentType === "image" ? "image" : llmContentType === "video" ? "video" : "text"),
      analysisSignals: signals,
      lastAnalyzed: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(urls.urlHash, row.urlHash));

  const [updated] = await db.select().from(urls).where(eq(urls.urlHash, row.urlHash));
  return {
    urlScore: updated,
    analysis: {
      ...heuristic,
      overall: aiScore,
      llm_score: llmScore,
      llm_provider: llmProvider,
      llm_content_type: llmContentType,
    },
  };
}

export async function analysisRoutes(app: FastifyInstance) {
  app.post<{ Querystring: { url: string; force?: string } }>("/analyze", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
  }, async (req, reply) => {
    const { url, force } = req.query;
    try { validateUrl(url); } catch (e: any) {
      return reply.status(422).send({ detail: e.message });
    }
    const { urlScore, analysis } = await performAnalysis(url, "", [], undefined, undefined, undefined, undefined, force === "1");
    return {
      url_hash: urlScore.urlHash,
      url,
      platform: urlScore.platform,
      content_type: urlScore.contentType,
      analysis,
      combined_score: urlScore.combinedScore,
    };
  });

  app.post<{ Body: AnalyzeContentRequest & { image_urls?: string[]; video_url?: string; force?: boolean } }>(
    "/analyze/content",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const { url, text, comments, platform, content_type, image_urls, video_url, force } = req.body;
      try { validateUrl(url); } catch (e: any) {
        return reply.status(422).send({ detail: e.message });
      }
      const { urlScore, analysis } = await performAnalysis(
        url, text, comments || [], platform, content_type, image_urls, video_url, !!force,
      );
      return {
        url_hash: urlScore.urlHash,
        url,
        platform: urlScore.platform,
        content_type: urlScore.contentType,
        content: { title: "", author: null, media_count: (image_urls?.length || 0) + (video_url ? 1 : 0), comment_count: (comments || []).length },
        analysis,
        combined_score: urlScore.combinedScore,
      };
    }
  );

  // Diagnostic: list configured LLM providers
  app.get("/providers", async () => ({
    providers: listProviders(),
    has_any: hasLLMProvider(),
  }));

  app.get<{ Querystring: { url: string } }>("/analysis", async (req, reply) => {
    const { url } = req.query;
    if (!url) return reply.status(422).send({ detail: "url required" });
    const urlHash = hashUrl(url);
    const [row] = await db.select().from(urls).where(eq(urls.urlHash, urlHash));
    if (!row || row.aiScore === null)
      return reply.status(404).send({ detail: "No analysis found for this URL." });
    return {
      url_hash: urlHash,
      url: row.url,
      ai_score: row.aiScore,
      combined_score: row.combinedScore,
      platform: row.platform,
      content_type: row.contentType,
      last_analyzed: row.lastAnalyzed?.toISOString(),
    };
  });
}
