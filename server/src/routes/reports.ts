import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { ReportRequest } from "../shared/types.js";
import { db } from "../db/index.js";
import { reports } from "../db/schema.js";
import { getUser } from "../middleware/auth.js";
import { hashUrl, validateUrl } from "../services/scoring.js";

export async function reportRoutes(app: FastifyInstance) {
  app.post<{ Body: ReportRequest }>("/report", async (req, reply) => {
    const { url, reported_verdict, reason } = req.body;
    try { validateUrl(url); } catch (e: any) {
      return reply.status(422).send({ detail: e.message });
    }
    if (!["human", "mixed", "ai_generated"].includes(reported_verdict))
      return reply.status(422).send({ detail: "reported_verdict must be human, mixed, or ai_generated." });

    const user = await getUser(req);
    const [report] = await db
      .insert(reports)
      .values({
        urlHash: hashUrl(url),
        reporterId: user?.id ?? null,
        reportedVerdict: reported_verdict,
        reason: reason ?? null,
      })
      .returning();

    return {
      id: report.id,
      url_hash: report.urlHash,
      reported_verdict: report.reportedVerdict,
      reason: report.reason,
      status: report.status,
      created_at: report.createdAt.toISOString(),
    };
  });

  app.get<{ Querystring: { status?: string; limit?: string; offset?: string } }>(
    "/reports",
    async (req) => {
      const limit = Math.min(Number(req.query.limit) || 50, 200);
      const offset = Number(req.query.offset) || 0;

      let query = db.select().from(reports).orderBy(reports.createdAt).limit(limit).offset(offset);

      const rows = req.query.status
        ? await db.select().from(reports).where(eq(reports.status, req.query.status)).orderBy(reports.createdAt).limit(limit).offset(offset)
        : await query;

      return rows.map((r) => ({
        id: r.id,
        url_hash: r.urlHash,
        reported_verdict: r.reportedVerdict,
        reason: r.reason,
        status: r.status,
        created_at: r.createdAt.toISOString(),
      }));
    }
  );
}
