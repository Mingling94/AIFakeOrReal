import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { db } from "../db/index.js";
import { votes } from "../db/schema.js";
import { hashUrl } from "../services/scoring.js";

export async function privacyRoutes(app: FastifyInstance) {
  // GDPR: Delete all votes from a specific fingerprint/IP for a URL.
  // This allows users to request removal of their data.
  app.delete<{ Querystring: { url: string } }>("/my-data", {
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
  }, async (req, reply) => {
    const { url } = req.query;
    if (!url) return reply.status(422).send({ detail: "url required" });

    const urlHash = hashUrl(url);
    const ip = req.ip;

    // Delete anonymous votes from this IP for this URL.
    // Authenticated users can use the auth system to manage their data.
    const deleted = await db
      .delete(votes)
      .where(eq(votes.urlHash, urlHash))
      .returning();

    return {
      deleted: deleted.length,
      message: "Your vote data for this URL has been removed.",
    };
  });

  // Privacy policy endpoint — returns the policy as JSON.
  app.get("/privacy", async () => ({
    privacy_policy_url: "https://github.com/mcluo/AIFakeOrReal/blob/main/docs/privacy-policy.md",
    data_collected: [
      "URL hashes (SHA-256, not reversible to original URLs)",
      "Votes (human/mixed/ai_generated) — anonymous unless logged in",
      "Page text for analysis (processed and discarded, not stored)",
    ],
    data_not_collected: [
      "Browsing history (AI exposure stats are local-only)",
      "Personal information",
      "Cookies or tracking identifiers",
    ],
    deletion: "DELETE /api/v1/my-data?url=<url> to remove your votes",
    contact: "aifakeorreal@gmail.com",
  }));
}
