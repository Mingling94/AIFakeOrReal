import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { createToken, requireUser } from "../middleware/auth.js";

export async function authRoutes(app: FastifyInstance) {
  app.post<{ Body: { email: string; password: string } }>("/auth/register", async (req, reply) => {
    const { email, password } = req.body;
    if (!email || password.length < 8)
      return reply.status(422).send({ detail: "Email required, password min 8 chars." });

    const [existing] = await db.select().from(users).where(eq(users.email, email));
    if (existing) return reply.status(400).send({ detail: "Email already registered." });

    const hashed = await bcrypt.hash(password.slice(0, 72), 10);
    const [user] = await db.insert(users).values({ email, hashedPassword: hashed }).returning();
    return { access_token: await createToken(user.id), token_type: "bearer" };
  });

  app.post<{ Body: { email: string; password: string } }>("/auth/login", async (req, reply) => {
    const { email, password } = req.body;
    const [user] = await db.select().from(users).where(eq(users.email, email));
    if (!user || !(await bcrypt.compare(password.slice(0, 72), user.hashedPassword)))
      return reply.status(401).send({ detail: "Invalid email or password." });
    return { access_token: await createToken(user.id), token_type: "bearer" };
  });

  app.get("/auth/me", async (req, reply) => {
    const user = await requireUser(req);
    return {
      id: user.id,
      email: user.email,
      reputation: user.reputation,
      total_votes: user.totalVotes,
      accuracy_rate: user.accuracyRate,
    };
  });
}
