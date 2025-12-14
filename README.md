# DABIR-AI

AI-powered voice notetaker backend that transcribes and summarizes audio/video lectures with excellent Uzbek language support using Gemini 2.5 Flash.

## Features

- 🎙️ **Audio/Video Transcription** - Accurate transcription with timestamps
- 📝 **Smart Summarization** - AI-generated summaries with chapters and key points
- 🇺🇿 **Uzbek Language Support** - Optimized for Uzbek using Gemini 2.5 Flash
- 📤 **Resumable Uploads** - Large file uploads with resume capability (tus.io)
- 🔐 **Dual Authentication** - Email/password + Telegram bot integration
- 📱 **API-First** - RESTful API ready for web/mobile frontends

## Tech Stack

- **Runtime**: Node.js 20+ with TypeScript
- **Framework**: Express.js
- **Database**: PostgreSQL with Drizzle ORM
- **Queue**: BullMQ with Redis
- **AI**: Google Gemini 2.5 Flash (Vertex AI)
- **Storage**: Google Cloud Storage
- **Upload**: tus.io protocol for resumable uploads
- **Audio**: FFmpeg for audio extraction

## Quick Start

### Prerequisites

- Node.js 20+
- Docker & Docker Compose
- FFmpeg (for audio extraction)
- Google Cloud account with Vertex AI enabled

### Local Development

1. **Clone and install dependencies**
   ```bash
   git clone <repository>
   cd uznotes-ai
   npm install
   ```

2. **Set up environment**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Start local services**
   ```bash
   docker-compose up -d
   ```

4. **Run database migrations**
   ```bash
   npm run db:generate
   npm run db:migrate
   ```

5. **Start the API server**
   ```bash
   npm run dev
   ```

6. **Start workers** (separate terminal)
   ```bash
   npm run worker
   ```

### Environment Variables

```env
# Server
NODE_ENV=development
PORT=3000

# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/uznotes

# Redis
REDIS_URL=redis://localhost:6379

# Google Cloud
GCP_PROJECT_ID=your-project-id
GCS_BUCKET_NAME=uznotes-uploads
GOOGLE_APPLICATION_CREDENTIALS=./credentials/service-account.json

# JWT
JWT_SECRET=your-secret-key-min-32-chars
JWT_REFRESH_SECRET=your-refresh-secret-min-32-chars
```

## API Documentation

Interactive API documentation is available via Swagger UI:

- **Swagger UI**: [http://localhost:3000/api/docs](http://localhost:3000/api/docs)
- **OpenAPI JSON**: [http://localhost:3000/api/docs.json](http://localhost:3000/api/docs.json)

## API Endpoints

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/auth/register` | Register with email/password |
| POST | `/api/v1/auth/login` | Login with email/password |
| POST | `/api/v1/auth/telegram` | Authenticate with Telegram ID |
| POST | `/api/v1/auth/refresh` | Refresh access token |
| GET | `/api/v1/auth/me` | Get current user |

### Lectures

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/lectures` | List lectures (paginated) |
| GET | `/api/v1/lectures/:id` | Get lecture with details |
| PATCH | `/api/v1/lectures/:id` | Update lecture |
| DELETE | `/api/v1/lectures/:id` | Delete lecture |
| GET | `/api/v1/lectures/:id/status` | Get processing status |
| GET | `/api/v1/lectures/:id/transcription` | Get transcription |
| GET | `/api/v1/lectures/:id/summary` | Get summary |

### Uploads (tus.io)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/uploads` | Create upload |
| HEAD | `/api/v1/uploads/:id` | Get upload status |
| PATCH | `/api/v1/uploads/:id` | Upload chunk |
| DELETE | `/api/v1/uploads/:id` | Cancel upload |

## Processing Pipeline

```
Upload → Audio Extraction → Transcription → Summarization → Complete
         (FFmpeg)           (Gemini)        (Gemini)
```

1. **Upload**: File uploaded via tus.io to GCS
2. **Audio Extraction**: FFmpeg extracts audio (MP3, 16kHz, mono)
3. **Transcription**: Gemini transcribes with timestamps
4. **Summarization**: Gemini generates summary, chapters, key points

## Deployment

> **Full Guide**: See [docs/DEPLOYMENT_GUIDE.md](docs/DEPLOYMENT_GUIDE.md) for complete step-by-step instructions.

### Quick Deploy to Google Cloud Run

1. **Configure secrets in Secret Manager**
   ```bash
   gcloud secrets create DATABASE_URL --data-file=-
   gcloud secrets create REDIS_URL --data-file=-
   gcloud secrets create JWT_SECRET --data-file=-
   ```

2. **Deploy using Cloud Build**
   ```bash
   gcloud builds submit --config=cloudbuild.yaml
   ```

### Docker

```bash
# Build API
docker build -t uznotes-api -f Dockerfile .

# Build Worker
docker build -t uznotes-worker -f Dockerfile.worker .

# Run
docker run -p 3000:3000 --env-file .env uznotes-api
docker run --env-file .env uznotes-worker
```

## Cost Estimate

| Resource | Per 1-hour lecture |
|----------|-------------------|
| Gemini (transcription) | ~$0.03 |
| Gemini (summarization) | ~$0.01 |
| GCS Storage | ~$0.01/month |
| Compute | ~$0.01 |
| **Total** | **~$0.05** |

## Project Structure

```
uznotes-ai/
├── src/
│   ├── api/              # Express routes & controllers
│   ├── config/           # Configuration
│   ├── db/               # Database schema & migrations
│   ├── services/         # Business logic
│   │   ├── auth/         # Authentication
│   │   ├── lecture/      # Lecture management
│   │   ├── processing/   # FFmpeg & Gemini
│   │   ├── queue/        # BullMQ queues
│   │   └── upload/       # GCS & tus.io
│   ├── workers/          # Background job processors
│   ├── types/            # TypeScript types
│   └── utils/            # Utilities
├── docs/                 # Documentation
├── scripts/              # Deployment scripts
├── Dockerfile            # API container
├── Dockerfile.worker     # Worker container
└── docker-compose.yml    # Local development
```

## Scripts

```bash
npm run dev          # Start API in development
npm run worker       # Start workers
npm run build        # Build TypeScript
npm run db:generate  # Generate migrations
npm run db:migrate   # Run migrations
npm run db:studio    # Open Drizzle Studio
npm run lint         # Run ESLint
npm run format       # Format code
```

## License

MIT
