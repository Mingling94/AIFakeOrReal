import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { db } from "../db/index.js";
import { urls, users, votes } from "../db/schema.js";
import { getUser } from "../middleware/auth.js";
import {
  calculateCombinedScore,
  calculateCrowdScore,
  detectPlatform,
  extractDomain,
  hashUrl,
  validateUrl,
} from "../services/scoring.js";
import type { VoteBreakdown, VoteRequest } from "../shared/types.js";

const ANON_REP = 0.3;

async function recalcScores(urlHash: string) {
  const allVotes = await db.select().from(votes).where(eq(votes.urlHash, urlHash));
  const voteData = await Promise.all(
    allVotes.map(async (v) => {
      let rep = ANON_REP;
      if (v.userId) {
        const [u] = await db.select().from(users).where(eq(users.id, v.userId));
        if (u) rep = u.reputation;
      }
      return { vote: v.vote, reputation: rep };
    })
  );
  const [row] = await db.select().from(urls).where(eq(urls.urlHash, urlHash));
  if (!row) return;

  const crowdScore = calculateCrowdScore(voteData);
  const combinedScore = calculateCombinedScore(row.aiScore, crowdScore, voteData.length);
  await db
    .update(urls)
    .set({ crowdScore, combinedScore, voteCount: voteData.length, updatedAt: new Date() })
    .where(eq(urls.urlHash, urlHash));
}

export async function voteRoutes(app: FastifyInstance) {
  app.post<{ Body: VoteRequest }>("/vote", {
    config: {
      rateLimit: {
        max: 30,
        timeWindow: "1 minute",
      },
    },
  }, async (req, reply) => {
    const { url, vote, confidence } = req.body;
    try { validateUrl(url); } catch (e: any) {
      return reply.status(422).send({ detail: e.message });
    }
    if (!["human", "mixed", "ai_generated"].includes(vote))
      return reply.status(422).send({ detail: "Invalid vote type." });

    const urlHash = hashUrl(url);
    const user = await getUser(req);

    // Ensure URL exists
    const [existing] = await db.select().from(urls).where(eq(urls.urlHash, urlHash));
    if (!existing) {
      await db.insert(urls).values({
        urlHash, url, domain: extractDomain(url), platform: detectPlatform(url),
      });
    }

    // Upsert for authenticated users
    let voteRow;
    if (user) {
      const [prev] = await db
        .select()
        .from(votes)
        .where(and(eq(votes.urlHash, urlHash), eq(votes.userId, user.id)));
      if (prev) {
        [voteRow] = await db
          .update(votes)
          .set({ vote, confidence })
          .where(eq(votes.id, prev.id))
          .returning();
      } else {
        [voteRow] = await db
          .insert(votes)
          .values({ urlHash, userId: user.id, vote, confidence })
          .returning();
        await db.update(users).set({ totalVotes: user.totalVotes + 1 }).where(eq(users.id, user.id));
      }
    } else {
      [voteRow] = await db.insert(votes).values({ urlHash, vote, confidence }).returning();
    }

    await recalcScores(urlHash);

    return {
      id: voteRow.id,
      url_hash: voteRow.urlHash,
      vote: voteRow.vote,
      created_at: voteRow.createdAt.toISOString(),
    };
  });

  app.get<{ Querystring: { url: string } }>("/votes", async (req, reply) => {
    const { url } = req.query;
    if (!url) return reply.status(422).send({ detail: "url required" });
    const urlHash = hashUrl(url);
    const allVotes = await db.select().from(votes).where(eq(votes.urlHash, urlHash));
    const breakdown: VoteBreakdown = { human: 0, mixed: 0, ai_generated: 0, total: allVotes.length };
    for (const v of allVotes) {
      if (v.vote === "human") breakdown.human++;
      else if (v.vote === "mixed") breakdown.mixed++;
      else if (v.vote === "ai_generated") breakdown.ai_generated++;
    }
    return breakdown;
  });
}
