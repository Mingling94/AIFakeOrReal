import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

const connectionString = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/aifakeorreal";

const client = postgres(connectionString);
export const db = drizzle(client, { schema });

export async function ensureSchema() {
  try {
    await client`SELECT 1 FROM urls LIMIT 0`;
  } catch {
    console.log("Creating database schema...");
    // Use raw SQL to create tables since we can't run drizzle-kit inside the container
    await client`
      CREATE TABLE IF NOT EXISTS urls (
        url_hash VARCHAR(64) PRIMARY KEY,
        url TEXT NOT NULL,
        domain VARCHAR(255) NOT NULL,
        ai_score REAL,
        crowd_score REAL,
        combined_score REAL,
        vote_count INTEGER NOT NULL DEFAULT 0,
        check_count INTEGER NOT NULL DEFAULT 0,
        platform VARCHAR(20) NOT NULL DEFAULT 'generic',
        content_type VARCHAR(20) NOT NULL DEFAULT 'unknown',
        analysis_signals JSONB,
        last_analyzed TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ
      )`;
    await client`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        hashed_password VARCHAR(255) NOT NULL,
        reputation REAL NOT NULL DEFAULT 0.5,
        total_votes INTEGER NOT NULL DEFAULT 0,
        accuracy_rate REAL NOT NULL DEFAULT 0.0,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`;
    await client`
      CREATE TABLE IF NOT EXISTS votes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        url_hash VARCHAR(64) NOT NULL,
        user_id UUID,
        voter_hash VARCHAR(64),
        vote VARCHAR(20) NOT NULL,
        confidence REAL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(user_id, url_hash)
      )`;
    await client`
      CREATE TABLE IF NOT EXISTS api_keys (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        key_hash VARCHAR(64) UNIQUE NOT NULL,
        prefix VARCHAR(20) NOT NULL,
        name VARCHAR(100) NOT NULL DEFAULT '',
        tier VARCHAR(20) NOT NULL DEFAULT 'free',
        request_count INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`;
    await client`
      CREATE TABLE IF NOT EXISTS reports (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        url_hash VARCHAR(64) NOT NULL,
        reporter_id UUID,
        reported_verdict VARCHAR(20) NOT NULL,
        reason TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'open',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`;
    console.log("Schema created successfully");
  }

  // Idempotent migrations — applied on every startup so existing databases
  // (which skip the create-table block above) pick up new columns/indexes.
  await client`ALTER TABLE votes ADD COLUMN IF NOT EXISTS voter_hash VARCHAR(64)`;
  // One anonymous ballot per (url, voter) — partial index so authenticated
  // votes (voter_hash IS NULL) are unaffected and deduped by (user_id, url_hash).
  await client`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_voter_url
    ON votes (url_hash, voter_hash) WHERE voter_hash IS NOT NULL`;
}
