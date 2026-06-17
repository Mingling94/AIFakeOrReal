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
import { getOrCreate, toResponse } from "./scores.js";

export async function performAnalysis(
  url: string,
  text: string,
  comments: string[] = [],
  platform?: string,
  contentType?: string
) {
  const row = await getOrCreate(url);
  const result = scanText(text, comments);

  const signals: SignalSummary = {
    vocabulary_triggered: result.vocabTriggered,
    vocabulary_tier1_count: 0, // local scanner doesn't separate tier counts
    structure_triggered: result.structureTriggered,
    structure_flags: [],
    comment_triggered: result.accusationTriggered,
    comment_examples: [],
  };

  const aiScore = result.score;
  const combinedScore = calculateCombinedScore(aiScore, row.crowdScore, row.voteCount);

  await db
    .update(urls)
    .set({
      aiScore,
      combinedScore,
      platform: platform || detectPlatform(url),
      contentType: contentType || "text",
      analysisSignals: signals,
      lastAnalyzed: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(urls.urlHash, row.urlHash));

  const [updated] = await db.select().from(urls).where(eq(urls.urlHash, row.urlHash));
  return { urlScore: updated, analysis: { ...result, overall: aiScore } };
}

export async function analysisRoutes(app: FastifyInstance) {
  app.post<{ Querystring: { url: string } }>("/analyze", async (req, reply) => {
    const { url } = req.query;
    try { validateUrl(url); } catch (e: any) {
      return reply.status(422).send({ detail: e.message });
    }
    // Server-side analysis: fetch the page and scan
    // For now, return an error asking the client to use /analyze/content
    const { urlScore, analysis } = await performAnalysis(url, "", []);
    return {
      url_hash: urlScore.urlHash,
      url,
      platform: urlScore.platform,
      content_type: urlScore.contentType,
      analysis,
      combined_score: urlScore.combinedScore,
    };
  });

  app.post<{ Body: AnalyzeContentRequest }>("/analyze/content", async (req, reply) => {
    const { url, text, comments, platform, content_type } = req.body;
    try { validateUrl(url); } catch (e: any) {
      return reply.status(422).send({ detail: e.message });
    }
    const { urlScore, analysis } = await performAnalysis(
      url, text, comments || [], platform, content_type
    );
    return {
      url_hash: urlScore.urlHash,
      url,
      platform: urlScore.platform,
      content_type: urlScore.contentType,
      content: { title: "", author: null, media_count: 0, comment_count: (comments || []).length },
      analysis,
      combined_score: urlScore.combinedScore,
    };
  });

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
