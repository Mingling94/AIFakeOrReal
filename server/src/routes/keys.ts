import crypto from "crypto";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { db } from "../db/index.js";
import { apiKeys } from "../db/schema.js";
import { hashApiKey } from "../middleware/auth.js";

const PREFIX = "afor_";

export async function keyRoutes(app: FastifyInstance) {
  app.post<{ Body: { name?: string } }>("/keys", async (req) => {
    const name = req.body.name || "";
    const rawKey = PREFIX + crypto.randomBytes(32).toString("base64url");
    const prefix = rawKey.slice(0, PREFIX.length + 6);

    await db.insert(apiKeys).values({
      keyHash: hashApiKey(rawKey),
      prefix,
      name,
      tier: "free",
    });

    return { api_key: rawKey, prefix, tier: "free", name };
  });

  app.get("/keys/usage", async (req, reply) => {
    const key = req.headers["x-api-key"] as string | undefined;
    if (!key) return reply.status(401).send({ detail: "Missing X-API-Key header." });
    const [record] = await db.select().from(apiKeys).where(eq(apiKeys.keyHash, hashApiKey(key)));
    if (!record) return reply.status(401).send({ detail: "Invalid API key." });
    return {
      prefix: record.prefix,
      tier: record.tier,
      name: record.name,
      request_count: record.requestCount,
      created_at: record.createdAt.toISOString(),
    };
  });
}
