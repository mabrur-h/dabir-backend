# UzNotes-AI: AI Voice Notetaker Backend

## Project Overview

A Node.js backend service that transcribes audio/video lectures into timestamped transcriptions and structured summaries, optimized for Uzbek language using Gemini 2.5 Flash.

---

## Technology Stack

### Core Technologies

| Component | Technology | Reason |
|-----------|------------|--------|
| **Runtime** | Node.js 20+ | LTS, excellent async I/O |
| **Language** | TypeScript | Type safety, better DX |
| **Framework** | Express.js | Simple, mature, well-documented |
| **Database** | PostgreSQL | Reliable, JSONB support for summaries |
| **Cache/Queue** | Redis + BullMQ | Job queue for async processing |
| **AI Model** | Gemini 2.5 Flash | Best Uzbek support, cost-effective |

### Cloud Services (Google Cloud)

| Service | Purpose | Estimated Cost |
|---------|---------|----------------|
| **Cloud Run** | API + Workers hosting | ~$5-20/month |
| **Cloud SQL (PostgreSQL)** | Database | ~$10-30/month |
| **Cloud Storage (GCS)** | File storage | ~$0.02/GB/month |
| **Upstash Redis** | Job queue (external) | Free tier → $0.2/100K |
| **Vertex AI (Gemini)** | Transcription + Summarization | ~$0.10/hour of audio |

### Key Libraries

```json
{
  "dependencies": {
    "@google-cloud/vertexai": "^1.x",
    "@google-cloud/storage": "^7.x",
    "@tus/server": "^2.x",
    "@tus/gcs-store": "^1.x",
    "bullmq": "^5.x",
    "ioredis": "^5.x",
    "express": "^4.x",
    "pg": "^8.x",
    "drizzle-orm": "^0.30.x",
    "fluent-ffmpeg": "^2.x",
    "jsonwebtoken": "^9.x",
    "zod": "^3.x"
  }
}
```

---

## Architecture

### System Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                 FRONTEND                                     │
│                          (Web/Mobile App)                                    │
│                                                                              │
│  - tus-js-client for resumable uploads                                      │
│  - Polling/WebSocket for progress updates                                   │
└─────────────────────────────────┬───────────────────────────────────────────┘
                                  │ HTTPS
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         GOOGLE CLOUD PLATFORM                                │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                        CLOUD RUN (API SERVER)                          │  │
│  │                                                                        │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────────┐ │  │
│  │  │ tus.io       │  │ REST API     │  │ Middleware                   │ │  │
│  │  │ Upload       │  │ /api/v1/*    │  │ - Auth (JWT)                 │ │  │
│  │  │ /uploads     │  │              │  │ - Rate Limiting              │ │  │
│  │  └──────┬───────┘  └──────┬───────┘  │ - Error Handling             │ │  │
│  │         │                 │          └──────────────────────────────┘ │  │
│  └─────────┼─────────────────┼───────────────────────────────────────────┘  │
│            │                 │                                               │
│            ▼                 ▼                                               │
│  ┌─────────────────┐  ┌──────────────┐  ┌────────────────────────────────┐  │
│  │ Cloud Storage   │  │ Cloud SQL    │  │ Upstash Redis                  │  │
│  │ (GCS)           │  │ (PostgreSQL) │  │ (External - Serverless)        │  │
│  │                 │  │              │  │                                │  │
│  │ Buckets:        │  │ Tables:      │  │ Queues:                        │  │
│  │ - uploads/      │  │ - users      │  │ - audio-extraction             │  │
│  │ - audio/        │  │ - lectures   │  │ - transcription                │  │
│  │ - processed/    │  │ - transcripts│  │ - summarization                │  │
│  │                 │  │ - summaries  │  │                                │  │
│  └────────┬────────┘  │ - key_points │  └───────────────┬────────────────┘  │
│           │           │ - jobs       │                  │                    │
│           │           └──────────────┘                  │                    │
│           │                                             │                    │
│           ▼                                             ▼                    │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                    CLOUD RUN (WORKER SERVICE)                          │ │
│  │                                                                        │ │
│  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐           │ │
│  │  │ Audio          │  │ Transcription  │  │ Summarization  │           │ │
│  │  │ Extraction     │  │ Worker         │  │ Worker         │           │ │
│  │  │ Worker         │  │                │  │                │           │ │
│  │  │                │  │ - Calls Gemini │  │ - Calls Gemini │           │ │
│  │  │ - FFmpeg       │  │ - Timestamps   │  │ - Key points   │           │ │
│  │  │ - Extract MP3  │  │ - Segments     │  │ - Chapters     │           │ │
│  │  └───────┬────────┘  └───────┬────────┘  └───────┬────────┘           │ │
│  │          │                   │                   │                     │ │
│  └──────────┼───────────────────┼───────────────────┼─────────────────────┘ │
│             │                   │                   │                       │
│             └───────────────────┼───────────────────┘                       │
│                                 ▼                                           │
│                    ┌─────────────────────────────┐                          │
│                    │   Vertex AI                 │                          │
│                    │   Gemini 2.5 Flash          │                          │
│                    │                             │                          │
│                    │   - Audio transcription     │                          │
│                    │   - Uzbek language          │                          │
│                    │   - Summarization           │                          │
│                    │   - Key point extraction    │                          │
│                    └─────────────────────────────┘                          │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Processing Pipeline

```
1. UPLOAD PHASE
   ┌─────────┐    ┌─────────────┐    ┌─────────────┐
   │ Client  │───▶│ tus.io      │───▶│ GCS         │
   │ Upload  │    │ Server      │    │ /uploads/   │
   └─────────┘    └──────┬──────┘    └─────────────┘
                         │
                         ▼ (on complete)
                  ┌──────────────┐
                  │ Create       │
                  │ lecture      │
                  │ record + job │
                  └──────┬───────┘
                         │
2. AUDIO EXTRACTION      ▼
   ┌─────────────────────────────────────────────┐
   │ audio-extraction queue                      │
   │                                             │
   │ - Download from GCS                         │
   │ - FFmpeg: extract audio → MP3/FLAC          │
   │ - Upload to GCS /audio/                     │
   │ - Delete original video (optional)          │
   └──────────────────────┬──────────────────────┘
                          │
3. TRANSCRIPTION          ▼
   ┌─────────────────────────────────────────────┐
   │ transcription queue                         │
   │                                             │
   │ - Get audio from GCS                        │
   │ - Upload to Gemini File API                 │
   │ - Call Gemini 2.5 Flash                     │
   │ - Parse timestamped response                │
   │ - Save transcription + segments to DB       │
   └──────────────────────┬──────────────────────┘
                          │
4. SUMMARIZATION          ▼
   ┌─────────────────────────────────────────────┐
   │ summarization queue                         │
   │                                             │
   │ - Fetch transcription from DB               │
   │ - Call Gemini 2.5 Flash                     │
   │ - Generate: overview, chapters, key points  │
   │ - Save summary to DB                        │
   │ - Mark lecture as 'completed'               │
   └─────────────────────────────────────────────┘
```

---

## Project Structure

```
uznotes-ai/
├── src/
│   ├── api/
│   │   ├── routes/
│   │   │   ├── index.ts              # Route aggregator
│   │   │   ├── auth.routes.ts        # POST /auth/login, /auth/register
│   │   │   ├── uploads.routes.ts     # tus.io endpoints
│   │   │   ├── lectures.routes.ts    # CRUD /lectures
│   │   │   └── health.routes.ts      # GET /health
│   │   ├── controllers/
│   │   │   ├── auth.controller.ts
│   │   │   ├── upload.controller.ts
│   │   │   └── lecture.controller.ts
│   │   └── middleware/
│   │       ├── auth.middleware.ts    # JWT verification
│   │       ├── rateLimit.middleware.ts
│   │       ├── validate.middleware.ts # Zod validation
│   │       └── errorHandler.middleware.ts
│   │
│   ├── services/
│   │   ├── upload/
│   │   │   ├── tus.service.ts        # tus-node-server setup
│   │   │   └── gcs.service.ts        # GCS operations
│   │   ├── processing/
│   │   │   ├── gemini.service.ts     # Gemini API wrapper
│   │   │   ├── ffmpeg.service.ts     # Audio extraction
│   │   │   ├── transcription.service.ts
│   │   │   └── summarization.service.ts
│   │   ├── queue/
│   │   │   ├── queue.service.ts      # BullMQ setup
│   │   │   └── jobs/
│   │   │       ├── audioExtraction.job.ts
│   │   │       ├── transcription.job.ts
│   │   │       └── summarization.job.ts
│   │   └── auth/
│   │       └── auth.service.ts       # JWT, password hashing
│   │
│   ├── workers/
│   │   ├── index.ts                  # Worker entry point
│   │   ├── audioExtraction.worker.ts
│   │   ├── transcription.worker.ts
│   │   └── summarization.worker.ts
│   │
│   ├── db/
│   │   ├── index.ts                  # Drizzle client
│   │   ├── schema.ts                 # Drizzle schema
│   │   └── migrations/               # SQL migrations
│   │
│   ├── config/
│   │   ├── index.ts                  # Environment config
│   │   └── constants.ts              # App constants
│   │
│   ├── types/
│   │   ├── index.ts
│   │   ├── lecture.types.ts
│   │   ├── transcription.types.ts
│   │   └── summary.types.ts
│   │
│   ├── utils/
│   │   ├── logger.ts                 # Pino logger
│   │   ├── errors.ts                 # Custom error classes
│   │   └── time.ts                   # Timestamp utilities
│   │
│   ├── app.ts                        # Express app setup
│   └── server.ts                     # Entry point
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── fixtures/
│
├── docker/
│   ├── Dockerfile                    # API server
│   ├── Dockerfile.worker             # Worker service
│   └── docker-compose.yml            # Local development
│
├── scripts/
│   ├── migrate.ts                    # Run migrations
│   └── seed.ts                       # Seed test data
│
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
├── drizzle.config.ts
└── README.md
```

---

## Database Schema

### Tables

```sql
-- ============================================
-- USERS
-- ============================================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- LECTURES (uploaded content)
-- ============================================
CREATE TABLE lectures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- File info
    title VARCHAR(500),
    original_filename VARCHAR(500) NOT NULL,
    gcs_uri TEXT NOT NULL,                      -- gs://bucket/uploads/xxx
    audio_gcs_uri TEXT,                         -- gs://bucket/audio/xxx (after extraction)
    file_size_bytes BIGINT NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    duration_seconds INTEGER,                    -- Set after audio extraction

    -- Processing
    status VARCHAR(50) DEFAULT 'uploaded',       -- See status enum below
    language VARCHAR(10) DEFAULT 'uz',
    error_message TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Status enum: uploaded → extracting → transcribing → summarizing → completed | failed

-- ============================================
-- TRANSCRIPTIONS
-- ============================================
CREATE TABLE transcriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lecture_id UUID UNIQUE NOT NULL REFERENCES lectures(id) ON DELETE CASCADE,

    full_text TEXT NOT NULL,
    word_count INTEGER,
    confidence_score DECIMAL(5,4),               -- 0.0000 to 1.0000

    -- Metadata
    model_version VARCHAR(100),                  -- gemini-2.5-flash-001
    processing_time_ms INTEGER,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TRANSCRIPTION SEGMENTS (timestamped chunks)
-- ============================================
CREATE TABLE transcription_segments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transcription_id UUID NOT NULL REFERENCES transcriptions(id) ON DELETE CASCADE,

    segment_index INTEGER NOT NULL,
    start_time_ms INTEGER NOT NULL,              -- Milliseconds from start
    end_time_ms INTEGER NOT NULL,
    text TEXT NOT NULL,

    -- Optional
    speaker_label VARCHAR(50),                   -- Speaker 1, Speaker 2, etc.

    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(transcription_id, segment_index)
);

-- ============================================
-- SUMMARIES
-- ============================================
CREATE TABLE summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lecture_id UUID UNIQUE NOT NULL REFERENCES lectures(id) ON DELETE CASCADE,

    -- Overview text
    overview TEXT NOT NULL,

    -- Structured content (JSON)
    chapters JSONB,                              -- Array of chapter objects

    -- Metadata
    language VARCHAR(10) DEFAULT 'uz',
    model_version VARCHAR(100),

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chapter JSON structure:
-- [
--   {
--     "index": 1,
--     "title": "Kirish",
--     "summary": "...",
--     "startTimeMs": 0,
--     "endTimeMs": 300000
--   }
-- ]

-- ============================================
-- KEY POINTS
-- ============================================
CREATE TABLE key_points (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lecture_id UUID NOT NULL REFERENCES lectures(id) ON DELETE CASCADE,

    point_index INTEGER NOT NULL,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    timestamp_ms INTEGER,                        -- When this point is discussed
    importance INTEGER CHECK (importance BETWEEN 1 AND 5),

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- PROCESSING JOBS (for tracking/debugging)
-- ============================================
CREATE TABLE processing_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lecture_id UUID NOT NULL REFERENCES lectures(id) ON DELETE CASCADE,

    job_type VARCHAR(50) NOT NULL,               -- audio_extraction, transcription, summarization
    bullmq_job_id VARCHAR(100),
    status VARCHAR(50) DEFAULT 'pending',        -- pending, active, completed, failed
    progress INTEGER DEFAULT 0,                  -- 0-100

    error_message TEXT,
    attempts INTEGER DEFAULT 0,

    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX idx_lectures_user_id ON lectures(user_id);
CREATE INDEX idx_lectures_status ON lectures(status);
CREATE INDEX idx_lectures_created_at ON lectures(created_at DESC);
CREATE INDEX idx_segments_transcription ON transcription_segments(transcription_id);
CREATE INDEX idx_segments_time ON transcription_segments(start_time_ms);
CREATE INDEX idx_key_points_lecture ON key_points(lecture_id);
CREATE INDEX idx_jobs_lecture ON processing_jobs(lecture_id);
CREATE INDEX idx_jobs_status ON processing_jobs(status);
```

---

## API Endpoints

### Authentication

```
POST   /api/v1/auth/register     - Register new user
POST   /api/v1/auth/login        - Login, returns JWT
POST   /api/v1/auth/refresh      - Refresh access token
GET    /api/v1/auth/me           - Get current user
```

### Uploads (tus.io)

```
POST   /api/v1/uploads           - Create upload (tus)
PATCH  /api/v1/uploads/:id       - Upload chunk (tus)
HEAD   /api/v1/uploads/:id       - Get upload status (tus)
DELETE /api/v1/uploads/:id       - Cancel upload (tus)
```

### Lectures

```
GET    /api/v1/lectures          - List user's lectures (paginated)
GET    /api/v1/lectures/:id      - Get lecture with transcription & summary
GET    /api/v1/lectures/:id/status - Get processing status
DELETE /api/v1/lectures/:id      - Delete lecture and all related data
PATCH  /api/v1/lectures/:id      - Update lecture title
```

### Transcription

```
GET    /api/v1/lectures/:id/transcription          - Get full transcription
GET    /api/v1/lectures/:id/transcription/segments - Get timestamped segments
GET    /api/v1/lectures/:id/transcription/search   - Search within transcription
```

### Summary

```
GET    /api/v1/lectures/:id/summary      - Get summary with chapters
GET    /api/v1/lectures/:id/key-points   - Get key points
```

### Health

```
GET    /health                   - Health check
GET    /health/ready             - Readiness check (DB + Redis)
```

---

## Response Formats

### Lecture Response

```typescript
interface LectureResponse {
  id: string;
  title: string;
  originalFilename: string;
  durationSeconds: number | null;
  status: 'uploaded' | 'extracting' | 'transcribing' | 'summarizing' | 'completed' | 'failed';
  language: string;
  errorMessage: string | null;
  createdAt: string;

  // Included when fetching single lecture
  transcription?: {
    id: string;
    fullText: string;
    wordCount: number;
    segments: Array<{
      index: number;
      startTimeMs: number;
      endTimeMs: number;
      startTimeFormatted: string;  // "MM:SS"
      endTimeFormatted: string;
      text: string;
      speaker: string | null;
    }>;
  };

  summary?: {
    id: string;
    overview: string;
    chapters: Array<{
      index: number;
      title: string;
      summary: string;
      startTimeMs: number;
      startTimeFormatted: string;
    }>;
  };

  keyPoints?: Array<{
    index: number;
    title: string;
    description: string;
    timestampMs: number;
    timestampFormatted: string;
    importance: number;
  }>;
}
```

### Processing Status Response

```typescript
interface ProcessingStatusResponse {
  lectureId: string;
  overallStatus: string;
  progress: number;  // 0-100 overall
  jobs: Array<{
    type: 'audio_extraction' | 'transcription' | 'summarization';
    status: 'pending' | 'active' | 'completed' | 'failed';
    progress: number;
    error: string | null;
  }>;
}
```

---

## Gemini Prompts

### Transcription Prompt

```typescript
const TRANSCRIPTION_PROMPT = `
You are a professional transcription assistant. Transcribe the following audio content accurately.

LANGUAGE: Uzbek (uz)

REQUIREMENTS:
1. Provide word-for-word transcription in Uzbek
2. Include timestamps every 30-60 seconds
3. Mark speaker changes if multiple speakers are detected
4. Use proper Uzbek punctuation and formatting

OUTPUT FORMAT (JSON):
{
  "fullText": "Complete transcription without timestamps",
  "segments": [
    {
      "startTime": "00:00",
      "endTime": "00:45",
      "text": "Segment text here",
      "speaker": "Speaker 1"
    }
  ],
  "detectedLanguage": "uz",
  "confidence": 0.95
}

Only output valid JSON, no additional text.
`;
```

### Summarization Prompt

```typescript
const SUMMARIZATION_PROMPT = `
You are an expert at summarizing educational content. Analyze the following lecture transcription and provide a comprehensive summary.

LANGUAGE: Respond in Uzbek

TRANSCRIPTION:
{transcription}

REQUIREMENTS:
1. Write a 2-3 paragraph overview of the entire lecture
2. Divide the content into logical chapters with timestamps
3. Extract 5-10 key points with importance ratings (1-5)
4. Preserve the original meaning and important details

OUTPUT FORMAT (JSON):
{
  "overview": "Comprehensive overview in Uzbek...",
  "chapters": [
    {
      "index": 1,
      "title": "Chapter title in Uzbek",
      "summary": "Chapter summary...",
      "startTimeMs": 0,
      "endTimeMs": 300000
    }
  ],
  "keyPoints": [
    {
      "title": "Key point title",
      "description": "Brief explanation",
      "timestampMs": 120000,
      "importance": 5
    }
  ]
}

Only output valid JSON, no additional text.
`;
```

---

## Environment Variables

```env
# Server
NODE_ENV=development
PORT=3000
API_VERSION=v1

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/uznotes

# Redis (Upstash)
REDIS_URL=rediss://default:xxx@xxx.upstash.io:6379

# Google Cloud
GCP_PROJECT_ID=uznotes-ai
GCP_REGION=us-central1
GCS_BUCKET_NAME=uznotes-uploads
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json

# Gemini
GEMINI_MODEL=gemini-2.5-flash

# Auth
JWT_SECRET=your-super-secret-key
JWT_EXPIRES_IN=7d

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100

# Upload
MAX_FILE_SIZE_BYTES=5368709120  # 5GB
ALLOWED_MIME_TYPES=audio/mpeg,audio/wav,audio/flac,audio/ogg,video/mp4,video/webm,video/quicktime
```

---

## Cost Breakdown

### Per 1-Hour Lecture

| Step | Resource | Calculation | Cost |
|------|----------|-------------|------|
| Upload | GCS Storage | 500MB × $0.02/GB | $0.01 |
| Audio Extraction | Cloud Run | 2 min CPU | $0.002 |
| Audio Storage | GCS | 100MB × $0.02/GB | $0.002 |
| Transcription | Gemini Input | 60min × 25 tok/s × $0.15/1M | $0.0135 |
| Transcription | Gemini Output | ~30K tokens × $0.60/1M | $0.018 |
| Summarization | Gemini Input | ~30K tokens × $0.15/1M | $0.0045 |
| Summarization | Gemini Output | ~5K tokens × $0.60/1M | $0.003 |
| **Total per lecture** | | | **~$0.05** |

### Monthly Infrastructure

| Service | Configuration | Cost |
|---------|--------------|------|
| Cloud Run (API) | 1 vCPU, 512MB, min 0 | ~$5-15 |
| Cloud Run (Worker) | 2 vCPU, 1GB, min 0 | ~$10-30 |
| Cloud SQL | db-f1-micro | ~$10 |
| Upstash Redis | Free tier (10K/day) | $0 |
| GCS | Pay per use | ~$1-5 |
| **Total infrastructure** | | **~$25-60/month** |

### Total Cost Projection

| Scale | Lectures/Month | Processing | Infra | Total |
|-------|----------------|------------|-------|-------|
| Starter | 100 | $5 | $30 | ~$35 |
| Growth | 1,000 | $50 | $50 | ~$100 |
| Scale | 10,000 | $500 | $100 | ~$600 |

---

## Implementation Phases

### Phase 1: Project Setup (Days 1-2)
- [ ] Initialize Node.js project with TypeScript
- [ ] Set up ESLint, Prettier, and project structure
- [ ] Configure environment variables
- [ ] Set up Docker Compose for local development
- [ ] Create PostgreSQL database schema with Drizzle

### Phase 2: Authentication & Core API (Days 3-4)
- [ ] Implement user registration and login
- [ ] Set up JWT authentication middleware
- [ ] Create basic lecture CRUD endpoints
- [ ] Add request validation with Zod
- [ ] Implement error handling

### Phase 3: File Upload System (Days 5-6)
- [ ] Set up Google Cloud Storage
- [ ] Integrate tus-node-server with GCS backend
- [ ] Handle upload completion webhook
- [ ] Create lecture records on upload complete

### Phase 4: Processing Pipeline (Days 7-10)
- [ ] Set up BullMQ with Upstash Redis
- [ ] Implement audio extraction worker (FFmpeg)
- [ ] Implement transcription worker (Gemini)
- [ ] Implement summarization worker (Gemini)
- [ ] Add progress tracking and status updates

### Phase 5: API Completion (Days 11-12)
- [ ] Complete all lecture-related endpoints
- [ ] Add transcription search endpoint
- [ ] Implement pagination
- [ ] Add rate limiting

### Phase 6: Testing & Deployment (Days 13-14)
- [ ] Write unit tests for services
- [ ] Write integration tests for API
- [ ] Set up Cloud Run deployment
- [ ] Configure Cloud SQL
- [ ] Deploy and test in production

---

## Security Checklist

- [ ] JWT tokens with short expiry + refresh tokens
- [ ] Password hashing with bcrypt (cost factor 12)
- [ ] Rate limiting per user and IP
- [ ] File type validation (MIME + magic bytes)
- [ ] SQL injection prevention (parameterized queries)
- [ ] CORS configuration
- [ ] Helmet.js for security headers
- [ ] Input validation on all endpoints
- [ ] Row-level security (users can only access their own data)
- [ ] Secrets in Google Secret Manager (production)

---

## Monitoring & Logging

### Recommended Setup

1. **Logging**: Pino with structured JSON logs
2. **Metrics**: Cloud Monitoring (built-in for Cloud Run)
3. **Queue Dashboard**: Bull Board UI
4. **Error Tracking**: Sentry (optional)
5. **Uptime**: Cloud Monitoring uptime checks

### Key Metrics to Track

- Request latency (p50, p95, p99)
- Error rate by endpoint
- Queue depth and processing time
- Gemini API latency and errors
- Storage usage
- Active users and uploads per day

---

## Future Enhancements

1. **Real-time Progress**: WebSocket for live progress updates
2. **Multi-language**: Support for Russian, English, etc.
3. **Speaker Diarization**: Separate speakers in transcription
4. **Export**: PDF/DOCX export of transcriptions
5. **Search**: Full-text search across all transcriptions
6. **Sharing**: Public links for sharing lectures
7. **Mobile App**: React Native companion app
8. **Batch Processing**: Upload multiple files at once
9. **Webhooks**: Notify external systems on completion
10. **AI Features**: Q&A on lecture content, flashcard generation

---

## Quick Start Commands

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env

# Start local services (PostgreSQL, Redis)
docker-compose up -d

# Run migrations
npm run db:migrate

# Start development server
npm run dev

# Start worker (separate terminal)
npm run worker

# Run tests
npm test
```

---

## Useful Resources

- [Gemini API Documentation](https://ai.google.dev/gemini-api/docs)
- [Vertex AI Node.js SDK](https://cloud.google.com/nodejs/docs/reference/vertexai/latest)
- [tus-node-server Documentation](https://github.com/tus/tus-node-server)
- [BullMQ Documentation](https://docs.bullmq.io/)
- [Drizzle ORM Documentation](https://orm.drizzle.team/docs/overview)
- [Cloud Run Documentation](https://cloud.google.com/run/docs)
