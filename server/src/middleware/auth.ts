import { createHash } from "crypto";
import { eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import { SignJWT, jwtVerify } from "jose";
import { db } from "../db/index.js";
import { apiKeys, users } from "../db/schema.js";

const SECRET = new TextEncoder().encode(process.env.SECRET_KEY || "change-me");
const ALG = "HS256";
const EXPIRE_MIN = Number(process.env.ACCESS_TOKEN_EXPIRE_MINUTES ?? 1440);

export async function createToken(userId: string): Promise<string> {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: ALG })
    .setExpirationTime(`${EXPIRE_MIN}m`)
    .sign(SECRET);
}

export async function getUser(req: FastifyRequest) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return null;
  try {
    const { payload } = await jwtVerify(auth.slice(7), SECRET, { algorithms: [ALG] });
    if (!payload.sub) return null;
    const [user] = await db.select().from(users).where(eq(users.id, payload.sub));
    return user ?? null;
  } catch {
    return null;
  }
}

export async function requireUser(req: FastifyRequest) {
  const user = await getUser(req);
  if (!user) throw { statusCode: 401, message: "Not authenticated." };
  return user;
}

export function hashApiKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export async function recordApiUsage(req: FastifyRequest) {
  const key = req.headers["x-api-key"] as string | undefined;
  if (!key) return null;
  const [record] = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.keyHash, hashApiKey(key)));
  if (!record) throw { statusCode: 401, message: "Invalid API key." };
  await db
    .update(apiKeys)
    .set({ requestCount: record.requestCount + 1 })
    .where(eq(apiKeys.id, record.id));
  return record;
}
