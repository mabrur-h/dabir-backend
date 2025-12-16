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
    telegramFirstName: varchar('telegram_first_name', { length: 255 }),
    telegramLastName: varchar('telegram_last_name', { length: 255 }),
    telegramLanguageCode: varchar('telegram_language_code', { length: 10 }),
    telegramIsPremium: boolean('telegram_is_premium').default(false),
    telegramPhotoUrl: text('telegram_photo_url'),

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

export const usersRelations = relations(users, ({ many, one }) => ({
  lectures: many(lectures),
  folders: many(folders),
  tags: many(tags),
  subscription: one(userSubscriptions),
}));

// ============================================
// FOLDERS
// ============================================
export const folders = pgTable(
  'folders',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    name: varchar('name', { length: 255 }).notNull(),
    color: varchar('color', { length: 7 }), // Hex color code e.g. #FF5733
    parentId: uuid('parent_id'), // For nested folders (self-reference)

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index('folders_user_id_idx').on(table.userId),
    parentIdIdx: index('folders_parent_id_idx').on(table.parentId),
    uniqueNamePerUser: uniqueIndex('folders_unique_name_per_user_idx').on(table.userId, table.name, table.parentId),
  })
);

export const foldersRelations = relations(folders, ({ one, many }) => ({
  user: one(users, {
    fields: [folders.userId],
    references: [users.id],
  }),
  parent: one(folders, {
    fields: [folders.parentId],
    references: [folders.id],
    relationName: 'parentFolder',
  }),
  children: many(folders, { relationName: 'parentFolder' }),
  lectures: many(lectures),
}));

// ============================================
// TAGS
// ============================================
export const tags = pgTable(
  'tags',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    name: varchar('name', { length: 100 }).notNull(),
    color: varchar('color', { length: 7 }), // Hex color code e.g. #FF5733

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index('tags_user_id_idx').on(table.userId),
    uniqueNamePerUser: uniqueIndex('tags_unique_name_per_user_idx').on(table.userId, table.name),
  })
);

export const tagsRelations = relations(tags, ({ one, many }) => ({
  user: one(users, {
    fields: [tags.userId],
    references: [users.id],
  }),
  lectureTags: many(lectureTags),
}));

// ============================================
// LECTURE TAGS (Many-to-Many)
// ============================================
export const lectureTags = pgTable(
  'lecture_tags',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    lectureId: uuid('lecture_id')
      .notNull()
      .references(() => lectures.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    lectureIdx: index('lecture_tags_lecture_idx').on(table.lectureId),
    tagIdx: index('lecture_tags_tag_idx').on(table.tagId),
    uniqueLectureTag: uniqueIndex('lecture_tags_unique_idx').on(table.lectureId, table.tagId),
  })
);

export const lectureTagsRelations = relations(lectureTags, ({ one }) => ({
  lecture: one(lectures, {
    fields: [lectureTags.lectureId],
    references: [lectures.id],
  }),
  tag: one(tags, {
    fields: [lectureTags.tagId],
    references: [tags.id],
  }),
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

    // Organization
    folderId: uuid('folder_id').references(() => folders.id, { onDelete: 'set null' }),

    // File info
    title: varchar('title', { length: 500 }),
    originalFilename: varchar('original_filename', { length: 500 }).notNull(),
    gcsUri: text('gcs_uri').notNull(),
    audioGcsUri: text('audio_gcs_uri'),
    fileSizeBytes: bigint('file_size_bytes', { mode: 'number' }).notNull(),
    mimeType: varchar('mime_type', { length: 100 }).notNull(),
    durationSeconds: integer('duration_seconds'),
    // Content hash for deduplication (MD5 from GCS)
    contentHash: varchar('content_hash', { length: 32 }),

    // Processing
    status: varchar('status', { length: 50 }).default('uploaded').notNull(),
    language: varchar('language', { length: 10 }).default('uz').notNull(),
    summarizationType: varchar('summarization_type', { length: 20 }).default('lecture').notNull(),
    errorMessage: text('error_message'),

    // Monetization - minutes tracking
    minutesCharged: integer('minutes_charged').default(0).notNull(),
    minutesRefunded: boolean('minutes_refunded').default(false).notNull(),

    // Timestamps
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index('lectures_user_id_idx').on(table.userId),
    folderIdIdx: index('lectures_folder_id_idx').on(table.folderId),
    statusIdx: index('lectures_status_idx').on(table.status),
    createdAtIdx: index('lectures_created_at_idx').on(table.createdAt),
    contentHashIdx: index('lectures_content_hash_idx').on(table.contentHash),
  })
);

export const lecturesRelations = relations(lectures, ({ one, many }) => ({
  user: one(users, {
    fields: [lectures.userId],
    references: [users.id],
  }),
  folder: one(folders, {
    fields: [lectures.folderId],
    references: [folders.id],
  }),
  transcription: one(transcriptions),
  summary: one(summaries),
  keyPoints: many(keyPoints),
  processingJobs: many(processingJobs),
  lectureTags: many(lectureTags),
  share: one(lectureShares),
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

  // Summary type: 'lecture' or 'custdev'
  summarizationType: varchar('summarization_type', { length: 20 }).default('lecture').notNull(),

  // Overview text (used by lecture type, or callSummary.overview for custdev)
  overview: text('overview').notNull(),

  // Structured content (JSON) - Lecture type
  chapters: jsonb('chapters').$type<ChapterJson[]>(),

  // CustDev specific fields (JSON)
  custdevData: jsonb('custdev_data').$type<CustDevDataJson>(),

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

// CustDev JSON type
interface CustDevDataJson {
  callSummary: {
    title: string;
    overview: string;
    customerMood: string;
  };
  keyPainPoints: Array<{
    painPoint: string;
    impact: string;
    timestampMs: number;
  }>;
  positiveFeedback: Array<{
    feature: string;
    benefit: string;
    timestampMs: number;
  }>;
  productSuggestions: Array<{
    type: string;
    priority: string;
    description: string;
    relatedPainPoint: string;
  }>;
  internalActionItems: Array<{
    owner: string;
    action: string;
    timestampMs: number;
  }>;
  mindMap?: CustDevMindMapJson;
}

// CustDev Mind Map JSON type
interface CustDevMindMapJson {
  centralNode: {
    label: string;
    description: string;
  };
  branches: {
    customerProfile: {
      label: string;
      items: Array<{ key: string; value: string }>;
    };
    needsAndGoals: {
      label: string;
      items: Array<{ goal: string; priority: string }>;
    };
    painPoints: {
      label: string;
      items: Array<{ pain: string; severity: string; emotion: string }>;
    };
    journeyStage: {
      label: string;
      currentStage: string;
      touchpoints: string[];
    };
    opportunities: {
      label: string;
      items: Array<{ opportunity: string; effort: string; impact: string }>;
    };
    keyInsights: {
      label: string;
      patterns: string[];
      quotes: Array<{ text: string; context: string }>;
    };
    actionItems: {
      label: string;
      items: Array<{ action: string; owner: string; priority: string }>;
    };
  };
  connections: Array<{ from: string; to: string; reason: string }>;
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

// ============================================
// LECTURE SHARES (Public Sharing)
// ============================================
export const lectureShares = pgTable(
  'lecture_shares',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    lectureId: uuid('lecture_id')
      .notNull()
      .unique()
      .references(() => lectures.id, { onDelete: 'cascade' }),

    // User-friendly slug for public URL (e.g., "physics-101-intro-abc123")
    slug: varchar('slug', { length: 255 }).notNull().unique(),

    // Sharing settings
    isPublic: boolean('is_public').default(true).notNull(),

    // What content is visible publicly
    showTranscription: boolean('show_transcription').default(true).notNull(),
    showSummary: boolean('show_summary').default(true).notNull(),
    showKeyPoints: boolean('show_key_points').default(true).notNull(),

    // Analytics
    viewCount: integer('view_count').default(0).notNull(),

    // Timestamps
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    slugIdx: uniqueIndex('lecture_shares_slug_idx').on(table.slug),
    lectureIdx: uniqueIndex('lecture_shares_lecture_idx').on(table.lectureId),
    publicIdx: index('lecture_shares_public_idx').on(table.isPublic),
  })
);

export const lectureSharesRelations = relations(lectureShares, ({ one }) => ({
  lecture: one(lectures, {
    fields: [lectureShares.lectureId],
    references: [lectures.id],
  }),
}));


// ============================================
// SUBSCRIPTION PLANS
// ============================================
export const subscriptionPlans = pgTable(
  'subscription_plans',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: varchar('name', { length: 50 }).notNull().unique(), // 'free', 'starter', 'pro', 'business'
    displayName: varchar('display_name', { length: 100 }).notNull(),
    displayNameUz: varchar('display_name_uz', { length: 100 }),
    priceUzs: integer('price_uzs').notNull().default(0),
    minutesPerMonth: integer('minutes_per_month').notNull(),
    description: text('description'),
    descriptionUz: text('description_uz'),
    features: jsonb('features').$type<string[]>(),
    featuresUz: jsonb('features_uz').$type<string[]>(),
    isActive: boolean('is_active').default(true).notNull(),
    sortOrder: integer('sort_order').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    nameIdx: uniqueIndex('subscription_plans_name_idx').on(table.name),
    activeIdx: index('subscription_plans_active_idx').on(table.isActive),
  })
);

// ============================================
// MINUTE PACKAGES (Additional purchases)
// ============================================
export const minutePackages = pgTable(
  'minute_packages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: varchar('name', { length: 50 }).notNull().unique(), // '1hr', '5hr', '10hr'
    displayName: varchar('display_name', { length: 100 }).notNull(),
    displayNameUz: varchar('display_name_uz', { length: 100 }),
    priceUzs: integer('price_uzs').notNull(),
    minutes: integer('minutes').notNull(),
    description: text('description'),
    descriptionUz: text('description_uz'),
    isActive: boolean('is_active').default(true).notNull(),
    sortOrder: integer('sort_order').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    nameIdx: uniqueIndex('minute_packages_name_idx').on(table.name),
    activeIdx: index('minute_packages_active_idx').on(table.isActive),
  })
);

// ============================================
// USER SUBSCRIPTIONS
// ============================================
export const userSubscriptions = pgTable(
  'user_subscriptions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' })
      .unique(), // One active subscription per user
    planId: uuid('plan_id')
      .notNull()
      .references(() => subscriptionPlans.id),

    // Billing cycle
    billingCycleStart: timestamp('billing_cycle_start', { withTimezone: true }).notNull(),
    billingCycleEnd: timestamp('billing_cycle_end', { withTimezone: true }).notNull(),

    // Minutes tracking
    minutesIncluded: integer('minutes_included').notNull(), // From plan
    minutesUsed: integer('minutes_used').default(0).notNull(), // Used this cycle

    // Bonus minutes from packages (don't reset on cycle)
    bonusMinutes: integer('bonus_minutes').default(0).notNull(),

    status: varchar('status', { length: 20 }).default('active').notNull(), // 'active', 'expired', 'cancelled'

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userIdx: uniqueIndex('user_subscriptions_user_idx').on(table.userId),
    statusIdx: index('user_subscriptions_status_idx').on(table.status),
    cycleEndIdx: index('user_subscriptions_cycle_end_idx').on(table.billingCycleEnd),
  })
);

export const userSubscriptionsRelations = relations(userSubscriptions, ({ one, many }) => ({
  user: one(users, {
    fields: [userSubscriptions.userId],
    references: [users.id],
  }),
  plan: one(subscriptionPlans, {
    fields: [userSubscriptions.planId],
    references: [subscriptionPlans.id],
  }),
  transactions: many(minuteTransactions),
}));

// ============================================
// MINUTE TRANSACTIONS (Usage & Purchase History)
// ============================================
export const minuteTransactions = pgTable(
  'minute_transactions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    subscriptionId: uuid('subscription_id').references(() => userSubscriptions.id),
    lectureId: uuid('lecture_id').references(() => lectures.id, { onDelete: 'set null' }),
    packageId: uuid('package_id').references(() => minutePackages.id),

    // Transaction type
    type: varchar('type', { length: 30 }).notNull(),
    // Types: 'plan_activation', 'plan_renewal', 'package_purchase',
    //        'video_processing', 'refund', 'admin_adjustment', 'promo_credit'

    minutes: integer('minutes').notNull(), // Positive = credit, Negative = debit

    // For usage tracking
    videoDurationSeconds: integer('video_duration_seconds'),

    // Balance after transaction
    planMinutesAfter: integer('plan_minutes_after'),
    bonusMinutesAfter: integer('bonus_minutes_after'),

    description: text('description'),
    metadata: jsonb('metadata'),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index('minute_transactions_user_idx').on(table.userId),
    subscriptionIdx: index('minute_transactions_subscription_idx').on(table.subscriptionId),
    lectureIdx: index('minute_transactions_lecture_idx').on(table.lectureId),
    typeIdx: index('minute_transactions_type_idx').on(table.type),
    createdAtIdx: index('minute_transactions_created_at_idx').on(table.createdAt),
  })
);

export const minuteTransactionsRelations = relations(minuteTransactions, ({ one }) => ({
  user: one(users, {
    fields: [minuteTransactions.userId],
    references: [users.id],
  }),
  subscription: one(userSubscriptions, {
    fields: [minuteTransactions.subscriptionId],
    references: [userSubscriptions.id],
  }),
  lecture: one(lectures, {
    fields: [minuteTransactions.lectureId],
    references: [lectures.id],
  }),
  package: one(minutePackages, {
    fields: [minuteTransactions.packageId],
    references: [minutePackages.id],
  }),
}));

// ============================================
// PAYMENTS (for Payme.uz integration later)
// ============================================
export const payments = pgTable(
  'payments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    // What was purchased
    paymentType: varchar('payment_type', { length: 30 }).notNull(), // 'plan', 'package'
    planId: uuid('plan_id').references(() => subscriptionPlans.id),
    packageId: uuid('package_id').references(() => minutePackages.id),

    // Amount
    amountUzs: integer('amount_uzs').notNull(),

    // Payment provider details
    provider: varchar('provider', { length: 30 }).default('payme'), // 'payme', 'click', 'manual'
    providerTransactionId: varchar('provider_transaction_id', { length: 255 }),
    providerResponse: jsonb('provider_response'),

    // Status
    status: varchar('status', { length: 30 }).default('pending').notNull(), // 'pending', 'completed', 'failed', 'refunded'

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => ({
    userIdx: index('payments_user_idx').on(table.userId),
    statusIdx: index('payments_status_idx').on(table.status),
    providerTxIdx: index('payments_provider_tx_idx').on(table.providerTransactionId),
  })
);

export const paymentsRelations = relations(payments, ({ one }) => ({
  user: one(users, {
    fields: [payments.userId],
    references: [users.id],
  }),
  plan: one(subscriptionPlans, {
    fields: [payments.planId],
    references: [subscriptionPlans.id],
  }),
  package: one(minutePackages, {
    fields: [payments.packageId],
    references: [minutePackages.id],
  }),
}));
