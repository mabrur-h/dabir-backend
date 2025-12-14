import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  decimal,
  jsonb,
  uniqueIndex,
  index,
  bigint,
  boolean,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ============================================
// USERS
// ============================================
export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    // Email/password auth (optional if using Telegram)
    email: varchar('email', { length: 255 }).unique(),
    passwordHash: varchar('password_hash', { length: 255 }),

    // Telegram auth (optional if using email)
    telegramId: bigint('telegram_id', { mode: 'number' }).unique(),
    telegramUsername: varchar('telegram_username', { length: 255 }),

    // Profile
    name: varchar('name', { length: 255 }),

    // Auth provider tracking
    authProvider: varchar('auth_provider', { length: 50 }).default('email').notNull(), // 'email' | 'telegram'

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    emailIdx: uniqueIndex('users_email_idx').on(table.email),
    telegramIdIdx: uniqueIndex('users_telegram_id_idx').on(table.telegramId),
  })
);

export const usersRelations = relations(users, ({ many }) => ({
  lectures: many(lectures),
}));

// ============================================
// LECTURES
// ============================================
export const lectures = pgTable(
  'lectures',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    // File info
    title: varchar('title', { length: 500 }),
    originalFilename: varchar('original_filename', { length: 500 }).notNull(),
    gcsUri: text('gcs_uri').notNull(),
    audioGcsUri: text('audio_gcs_uri'),
    fileSizeBytes: bigint('file_size_bytes', { mode: 'number' }).notNull(),
    mimeType: varchar('mime_type', { length: 100 }).notNull(),
    durationSeconds: integer('duration_seconds'),

    // Processing
    status: varchar('status', { length: 50 }).default('uploaded').notNull(),
    language: varchar('language', { length: 10 }).default('uz').notNull(),
    errorMessage: text('error_message'),

    // Timestamps
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index('lectures_user_id_idx').on(table.userId),
    statusIdx: index('lectures_status_idx').on(table.status),
    createdAtIdx: index('lectures_created_at_idx').on(table.createdAt),
  })
);

export const lecturesRelations = relations(lectures, ({ one, many }) => ({
  user: one(users, {
    fields: [lectures.userId],
    references: [users.id],
  }),
  transcription: one(transcriptions),
  summary: one(summaries),
  keyPoints: many(keyPoints),
  processingJobs: many(processingJobs),
}));

// ============================================
// TRANSCRIPTIONS
// ============================================
export const transcriptions = pgTable('transcriptions', {
  id: uuid('id').defaultRandom().primaryKey(),
  lectureId: uuid('lecture_id')
    .notNull()
    .unique()
    .references(() => lectures.id, { onDelete: 'cascade' }),

  fullText: text('full_text').notNull(),
  wordCount: integer('word_count'),
  confidenceScore: decimal('confidence_score', { precision: 5, scale: 4 }),

  // Metadata
  modelVersion: varchar('model_version', { length: 100 }),
  processingTimeMs: integer('processing_time_ms'),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const transcriptionsRelations = relations(transcriptions, ({ one, many }) => ({
  lecture: one(lectures, {
    fields: [transcriptions.lectureId],
    references: [lectures.id],
  }),
  segments: many(transcriptionSegments),
}));

// ============================================
// TRANSCRIPTION SEGMENTS
// ============================================
export const transcriptionSegments = pgTable(
  'transcription_segments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    transcriptionId: uuid('transcription_id')
      .notNull()
      .references(() => transcriptions.id, { onDelete: 'cascade' }),

    segmentIndex: integer('segment_index').notNull(),
    startTimeMs: integer('start_time_ms').notNull(),
    endTimeMs: integer('end_time_ms').notNull(),
    text: text('text').notNull(),

    // Optional
    speakerLabel: varchar('speaker_label', { length: 50 }),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    transcriptionIdx: index('segments_transcription_idx').on(table.transcriptionId),
    timeIdx: index('segments_time_idx').on(table.startTimeMs),
    uniqueSegment: uniqueIndex('segments_unique_idx').on(
      table.transcriptionId,
      table.segmentIndex
    ),
  })
);

export const transcriptionSegmentsRelations = relations(transcriptionSegments, ({ one }) => ({
  transcription: one(transcriptions, {
    fields: [transcriptionSegments.transcriptionId],
    references: [transcriptions.id],
  }),
}));

// ============================================
// SUMMARIES
// ============================================
export const summaries = pgTable('summaries', {
  id: uuid('id').defaultRandom().primaryKey(),
  lectureId: uuid('lecture_id')
    .notNull()
    .unique()
    .references(() => lectures.id, { onDelete: 'cascade' }),

  // Overview text
  overview: text('overview').notNull(),

  // Structured content (JSON)
  chapters: jsonb('chapters').$type<ChapterJson[]>(),

  // Metadata
  language: varchar('language', { length: 10 }).default('uz').notNull(),
  modelVersion: varchar('model_version', { length: 100 }),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const summariesRelations = relations(summaries, ({ one }) => ({
  lecture: one(lectures, {
    fields: [summaries.lectureId],
    references: [lectures.id],
  }),
}));

// Chapter JSON type
interface ChapterJson {
  index: number;
  title: string;
  summary: string;
  startTimeMs: number;
  endTimeMs: number;
}

// ============================================
// KEY POINTS
// ============================================
export const keyPoints = pgTable(
  'key_points',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    lectureId: uuid('lecture_id')
      .notNull()
      .references(() => lectures.id, { onDelete: 'cascade' }),

    pointIndex: integer('point_index').notNull(),
    title: varchar('title', { length: 500 }).notNull(),
    description: text('description'),
    timestampMs: integer('timestamp_ms'),
    importance: integer('importance'),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    lectureIdx: index('key_points_lecture_idx').on(table.lectureId),
  })
);

export const keyPointsRelations = relations(keyPoints, ({ one }) => ({
  lecture: one(lectures, {
    fields: [keyPoints.lectureId],
    references: [lectures.id],
  }),
}));

// ============================================
// PROCESSING JOBS
// ============================================
export const processingJobs = pgTable(
  'processing_jobs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    lectureId: uuid('lecture_id')
      .notNull()
      .references(() => lectures.id, { onDelete: 'cascade' }),

    jobType: varchar('job_type', { length: 50 }).notNull(),
    bullmqJobId: varchar('bullmq_job_id', { length: 100 }),
    status: varchar('status', { length: 50 }).default('pending').notNull(),
    progress: integer('progress').default(0).notNull(),

    errorMessage: text('error_message'),
    attempts: integer('attempts').default(0).notNull(),

    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    lectureIdx: index('jobs_lecture_idx').on(table.lectureId),
    statusIdx: index('jobs_status_idx').on(table.status),
  })
);

export const processingJobsRelations = relations(processingJobs, ({ one }) => ({
  lecture: one(lectures, {
    fields: [processingJobs.lectureId],
    references: [lectures.id],
  }),
}));

// ============================================
// REFRESH TOKENS (for auth)
// ============================================
export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token: varchar('token', { length: 500 }).notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revoked: boolean('revoked').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    tokenIdx: uniqueIndex('refresh_tokens_token_idx').on(table.token),
    userIdx: index('refresh_tokens_user_idx').on(table.userId),
  })
);

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, {
    fields: [refreshTokens.userId],
    references: [users.id],
  }),
}));
