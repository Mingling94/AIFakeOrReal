import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { db } from "../db/index.js";
import { urls } from "../db/schema.js";
import {
  detectPlatform,
  extractDomain,
  hashUrl,
  scoreToConfidence,
  validateUrl,
} from "../services/scoring.js";
import type { ScoreResponse, SignalSummary } from "../shared/types.js";

function toResponse(row: typeof urls.$inferSelect): ScoreResponse {
  return {
    url_hash: row.urlHash,
    url: row.url,
    domain: row.domain,
    ai_score: row.aiScore,
    crowd_score: row.crowdScore,
    combined_score: row.combinedScore,
    vote_count: row.voteCount,
    platform: row.platform,
    content_type: row.contentType,
    last_analyzed: row.lastAnalyzed?.toISOString() ?? null,
    confidence: scoreToConfidence(row.voteCount, row.aiScore) as ScoreResponse["confidence"],
    signals: (row.analysisSignals as SignalSummary) ?? null,
  };
}

async function getOrCreate(url: string) {
  const urlHash = hashUrl(url);
  let [row] = await db.select().from(urls).where(eq(urls.urlHash, urlHash));
  if (!row) {
    [row] = await db
      .insert(urls)
      .values({ urlHash, url, domain: extractDomain(url), platform: detectPlatform(url) })
      .returning();
  }
  return row;
}

export { getOrCreate, toResponse };

export async function scoreRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { url: string } }>("/score", async (req, reply) => {
    const { url } = req.query;
    try { validateUrl(url); } catch (e: any) {
      return reply.status(422).send({ detail: e.message });
    }
    return toResponse(await getOrCreate(url));
  });

  app.post<{ Body: { urls: string[] } }>("/scores/batch", async (req) => {
    const results: ScoreResponse[] = [];
    for (const url of (req.body.urls || []).slice(0, 50)) {
      try {
        validateUrl(url);
        results.push(toResponse(await getOrCreate(url)));
      } catch { /* skip invalid */ }
    }
    return { scores: results };
  });
}
