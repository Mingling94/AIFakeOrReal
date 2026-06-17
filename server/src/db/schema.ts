import {
  boolean,
  integer,
  json,
  pgTable,
  real,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const urls = pgTable("urls", {
  urlHash: varchar("url_hash", { length: 64 }).primaryKey(),
  url: text("url").notNull(),
  domain: varchar("domain", { length: 255 }).notNull(),
  aiScore: real("ai_score"),
  crowdScore: real("crowd_score"),
  combinedScore: real("combined_score"),
  voteCount: integer("vote_count").default(0).notNull(),
  checkCount: integer("check_count").default(0).notNull(),
  platform: varchar("platform", { length: 20 }).default("generic").notNull(),
  contentType: varchar("content_type", { length: 20 }).default("unknown").notNull(),
  analysisSignals: json("analysis_signals"),
  lastAnalyzed: timestamp("last_analyzed", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
});

export const votes = pgTable(
  "votes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    urlHash: varchar("url_hash", { length: 64 }).notNull(),
    userId: uuid("user_id"),
    vote: varchar("vote", { length: 20 }).notNull(),
    confidence: real("confidence"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [unique("uq_user_url_vote").on(t.userId, t.urlHash)]
);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: varchar("email", { length: 255 }).unique().notNull(),
  hashedPassword: varchar("hashed_password", { length: 255 }).notNull(),
  reputation: real("reputation").default(0.5).notNull(),
  totalVotes: integer("total_votes").default(0).notNull(),
  accuracyRate: real("accuracy_rate").default(0.0).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const apiKeys = pgTable("api_keys", {
  id: uuid("id").defaultRandom().primaryKey(),
  keyHash: varchar("key_hash", { length: 64 }).unique().notNull(),
  prefix: varchar("prefix", { length: 20 }).notNull(),
  name: varchar("name", { length: 100 }).default("").notNull(),
  tier: varchar("tier", { length: 20 }).default("free").notNull(),
  requestCount: integer("request_count").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const reports = pgTable("reports", {
  id: uuid("id").defaultRandom().primaryKey(),
  urlHash: varchar("url_hash", { length: 64 }).notNull(),
  reporterId: uuid("reporter_id"),
  reportedVerdict: varchar("reported_verdict", { length: 20 }).notNull(),
  reason: text("reason"),
  status: varchar("status", { length: 20 }).default("open").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
