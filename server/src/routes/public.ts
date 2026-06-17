import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { CheckResponse, VoteBreakdown } from "../shared/types.js";
import { db } from "../db/index.js";
import { urls, votes } from "../db/schema.js";
import { recordApiUsage } from "../middleware/auth.js";
import {
  hashUrl,
  scoreToConfidence,
  scoreToVerdict,
  validateUrl,
} from "../services/scoring.js";
import { performAnalysis } from "./analysis.js";

function voteBreakdown(allVotes: Array<{ vote: string }>): VoteBreakdown {
  const b: VoteBreakdown = { human: 0, mixed: 0, ai_generated: 0, total: allVotes.length };
  for (const v of allVotes) {
    if (v.vote === "human") b.human++;
    else if (v.vote === "mixed") b.mixed++;
    else if (v.vote === "ai_generated") b.ai_generated++;
  }
  return b;
}

export async function publicRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { url: string; analyze?: string } }>("/check", async (req, reply) => {
    const { url, analyze } = req.query;
    try { validateUrl(url); } catch (e: any) {
      return reply.status(422).send({ detail: e.message });
    }
    try { await recordApiUsage(req); } catch (e: any) {
      return reply.status(e.statusCode || 401).send({ detail: e.message });
    }

    const urlHash = hashUrl(url);
    let [row] = await db.select().from(urls).where(eq(urls.urlHash, urlHash));

    if (analyze === "true" && (!row || row.aiScore === null)) {
      try {
        const { urlScore } = await performAnalysis(url, "", []);
        row = urlScore;
      } catch { /* fall back to whatever we have */ }
    }

    if (row) {
      await db.update(urls).set({ checkCount: row.checkCount + 1 }).where(eq(urls.urlHash, urlHash));
    }

    if (!row) {
      return {
        url,
        platform: "generic",
        content_type: "unknown",
        verdict: "unknown",
        ai_probability: null,
        confidence: "none",
        analyzed: false,
        votes: { human: 0, mixed: 0, ai_generated: 0, total: 0 },
        signals: { ai_score: null, crowd_score: null },
      } satisfies CheckResponse;
    }

    const allVotes = await db.select().from(votes).where(eq(votes.urlHash, urlHash));
    return {
      url: row.url,
      platform: row.platform,
      content_type: row.contentType,
      verdict: scoreToVerdict(row.combinedScore) as CheckResponse["verdict"],
      ai_probability: row.combinedScore,
      confidence: scoreToConfidence(row.voteCount, row.aiScore),
      analyzed: row.aiScore !== null,
      votes: voteBreakdown(allVotes),
      signals: { ai_score: row.aiScore, crowd_score: row.crowdScore },
    } satisfies CheckResponse;
  });
}
