import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import { ensureSchema } from "./db/index.js";
import { analysisRoutes } from "./routes/analysis.js";
import { authRoutes } from "./routes/auth.js";
import { keyRoutes } from "./routes/keys.js";
import { privacyRoutes } from "./routes/privacy.js";
import { publicRoutes } from "./routes/public.js";
import { reportRoutes } from "./routes/reports.js";
import { scoreRoutes } from "./routes/scores.js";
import { voteRoutes } from "./routes/votes.js";

const app = Fastify({ logger: true });

// CORS — allow chrome-extension, moz-extension, and configured origins.
await app.register(cors, {
  origin: [
    /chrome-extension:\/\/.*/,
    /moz-extension:\/\/.*/,
    ...(process.env.CORS_ORIGINS?.split(",") || []),
  ],
  credentials: true,
});

// Rate limiting — prevent abuse on write endpoints.
await app.register(rateLimit, {
  global: false, // only apply to routes that opt in
});

// Routes
await app.register(
  async (api) => {
    await api.register(publicRoutes);
    await api.register(keyRoutes);
    await api.register(reportRoutes);
    await api.register(authRoutes);
    await api.register(scoreRoutes);
    await api.register(voteRoutes);
    await api.register(analysisRoutes);
    await api.register(privacyRoutes);
  },
  { prefix: "/api/v1" }
);

app.get("/", async () => ({
  status: "ok",
  name: "AI Fake Or Real API",
  version: "0.1.0",
}));

app.get("/health", async () => {
  // Simple liveness check; Drizzle will throw if DB is unreachable.
  return { status: "ok", database: true };
});

const port = Number(process.env.PORT || 8000);
const host = process.env.HOST || "0.0.0.0";

try {
  await ensureSchema();
  await app.listen({ port, host });
  console.log(`Server running on http://${host}:${port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
