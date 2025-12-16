import type { OpenAPIV3 } from 'openapi-types';

export const swaggerDocument: OpenAPIV3.Document = {
  openapi: '3.0.3',
  info: {
    title: 'UzNotes-AI API',
    version: '1.0.0',
    description: `
AI-powered voice notetaker backend that transcribes and summarizes audio/video lectures with excellent Uzbek language support using Gemini 2.5 Flash.

## Features
- Audio/Video transcription with timestamps
- AI-generated summaries with chapters and key points
- Resumable file uploads (tus.io protocol)
- Dual authentication (Email + Telegram)

## Authentication
Most endpoints require a Bearer token in the Authorization header:
\`\`\`
Authorization: Bearer <access_token>
\`\`\`

Access tokens expire after 15 minutes. Use the refresh token endpoint to get a new access token.
    `,
    contact: {
      name: 'API Support',
    },
    license: {
      name: 'MIT',
    },
  },
  servers: [
    {
      url: 'http://localhost:3000',
      description: 'Local development server',
    },
    {
      url: 'https://uznotes-api-xxxxx.run.app',
      description: 'Production server (Cloud Run)',
    },
  ],
  tags: [
    {
      name: 'Health',
      description: 'Health check endpoints',
    },
    {
      name: 'Authentication',
      description: 'User registration, login, and token management',
    },
    {
      name: 'Lectures',
      description: 'Lecture CRUD and content retrieval',
    },
    {
      name: 'Lectures - Status',
      description: 'Lecture processing status endpoints',
    },
    {
      name: 'Lectures - Content',
      description: 'Lecture content endpoints (transcript, summary, key points)',
    },
    {
      name: 'Lectures - CustDev',
      description: 'CustDev analysis endpoints for customer development interviews',
    },
    {
      name: 'Lectures - Tags',
      description: 'Manage tags assigned to lectures',
    },
    {
      name: 'Lectures - Share',
      description: 'Public sharing of lectures with user-friendly URLs',
    },
    {
      name: 'Public',
      description: 'Public endpoints that do not require authentication',
    },
    {
      name: 'Folders',
      description: 'Folder management for organizing lectures',
    },
    {
      name: 'Tags',
      description: 'Tag management for categorizing lectures',
    },
    {
      name: 'Users',
      description: 'User-related endpoints',
    },
    {
      name: 'Uploads',
      description: 'Resumable file uploads using tus.io protocol',
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT access token',
      },
    },
    schemas: {
      // Common schemas
      Error: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          error: {
            type: 'object',
            properties: {
              code: { type: 'string', example: 'VALIDATION_ERROR' },
              message: { type: 'string', example: 'Invalid request body' },
              details: { type: 'object' },
            },
          },
        },
      },
      Pagination: {
        type: 'object',
        properties: {
          page: { type: 'integer', example: 1 },
          limit: { type: 'integer', example: 20 },
          total: { type: 'integer', example: 100 },
          totalPages: { type: 'integer', example: 5 },
          hasNext: { type: 'boolean', example: true },
          hasPrev: { type: 'boolean', example: false },
        },
      },

      // User schemas
      User: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          email: { type: 'string', format: 'email', nullable: true },
          name: { type: 'string', nullable: true },
          telegramId: { type: 'integer', nullable: true },
          telegramUsername: { type: 'string', nullable: true },
          telegramFirstName: { type: 'string', nullable: true },
          telegramLastName: { type: 'string', nullable: true },
          telegramLanguageCode: { type: 'string', nullable: true, example: 'en' },
          telegramIsPremium: { type: 'boolean', nullable: true },
          telegramPhotoUrl: { type: 'string', nullable: true },
          authProvider: { type: 'string', enum: ['email', 'telegram'] },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      Tokens: {
        type: 'object',
        properties: {
          accessToken: { type: 'string' },
          refreshToken: { type: 'string' },
          expiresIn: { type: 'integer', example: 900, description: 'Token expiry in seconds' },
        },
      },

      // Lecture schemas
      Lecture: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          userId: { type: 'string', format: 'uuid' },
          title: { type: 'string', example: 'Introduction to Machine Learning' },
          originalFilename: { type: 'string', example: 'lecture-01.mp4' },
          status: {
            type: 'string',
            enum: [
              'pending',
              'extracting_audio',
              'transcribing',
              'summarizing',
              'completed',
              'failed',
            ],
          },
          language: { type: 'string', example: 'uz', default: 'uz' },
          durationMs: { type: 'integer', nullable: true, example: 3600000 },
          fileSizeBytes: { type: 'integer', example: 104857600 },
          mimeType: { type: 'string', example: 'video/mp4' },
          errorMessage: { type: 'string', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      LectureWithDetails: {
        allOf: [
          { $ref: '#/components/schemas/Lecture' },
          {
            type: 'object',
            properties: {
              transcription: { $ref: '#/components/schemas/Transcription' },
              summary: { $ref: '#/components/schemas/Summary' },
              keyPoints: {
                type: 'array',
                items: { $ref: '#/components/schemas/KeyPoint' },
              },
            },
          },
        ],
      },

      // Transcription schemas
      Transcription: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          lectureId: { type: 'string', format: 'uuid' },
          fullText: { type: 'string' },
          wordCount: { type: 'integer', example: 5000 },
          confidenceScore: { type: 'string', example: '0.95' },
          modelVersion: { type: 'string', example: 'gemini-2.5-flash' },
          processingTimeMs: { type: 'integer', example: 45000 },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      TranscriptionSegment: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          transcriptionId: { type: 'string', format: 'uuid' },
          segmentIndex: { type: 'integer', example: 0 },
          startTimeMs: { type: 'integer', example: 0 },
          endTimeMs: { type: 'integer', example: 45000 },
          text: { type: 'string' },
          speakerLabel: { type: 'string', nullable: true },
        },
      },
      TranscriptionWithSegments: {
        allOf: [
          { $ref: '#/components/schemas/Transcription' },
          {
            type: 'object',
            properties: {
              segments: {
                type: 'array',
                items: { $ref: '#/components/schemas/TranscriptionSegment' },
              },
            },
          },
        ],
      },

      // Summary schemas
      Summary: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          lectureId: { type: 'string', format: 'uuid' },
          overview: { type: 'string' },
          chapters: {
            type: 'array',
            items: { $ref: '#/components/schemas/Chapter' },
          },
          language: { type: 'string', example: 'uz' },
          modelVersion: { type: 'string', example: 'gemini-2.5-flash' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      Chapter: {
        type: 'object',
        properties: {
          index: { type: 'integer', example: 1 },
          title: { type: 'string', example: "Ma'lumotlar tuzilishi" },
          summary: { type: 'string' },
          startTimeMs: { type: 'integer', example: 0 },
          endTimeMs: { type: 'integer', example: 300000 },
        },
      },
      KeyPoint: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          lectureId: { type: 'string', format: 'uuid' },
          pointIndex: { type: 'integer', example: 1 },
          title: { type: 'string', example: 'Asosiy tushuncha' },
          description: { type: 'string' },
          timestampMs: { type: 'integer', example: 120000 },
          importance: { type: 'integer', minimum: 1, maximum: 5, example: 5 },
        },
      },

      // Folder schemas
      Folder: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string', example: 'Semester 1' },
          color: { type: 'string', nullable: true, example: '#9B59B6' },
          parentId: { type: 'string', format: 'uuid', nullable: true },
          lectureCount: { type: 'integer', example: 12 },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      FolderWithChildren: {
        allOf: [
          { $ref: '#/components/schemas/Folder' },
          {
            type: 'object',
            properties: {
              children: {
                type: 'array',
                items: { $ref: '#/components/schemas/FolderWithChildren' },
              },
            },
          },
        ],
      },

      // Tag schemas
      Tag: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string', example: 'Important' },
          color: { type: 'string', nullable: true, example: '#FF5733' },
          lectureCount: { type: 'integer', example: 8 },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },

      // User statistics
      UserStats: {
        type: 'object',
        properties: {
          total: { type: 'integer', example: 25 },
          completed: { type: 'integer', example: 20 },
          processing: { type: 'integer', example: 3 },
          failed: { type: 'integer', example: 2 },
        },
      },

      // Lightweight status
      LectureStatusLight: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          status: { type: 'string', example: 'transcribing' },
          progress: { type: 'integer', minimum: 0, maximum: 100, example: 45 },
          errorMessage: { type: 'string', nullable: true },
        },
      },

      // CustDev schemas
      CustDevCallSummary: {
        type: 'object',
        properties: {
          title: { type: 'string', example: 'Customer Interview - Acme Corp' },
          overview: { type: 'string' },
          customerMood: { type: 'string', example: 'Frustrated but hopeful' },
        },
      },
      CustDevPainPoint: {
        type: 'object',
        properties: {
          painPoint: { type: 'string', example: 'Slow onboarding process' },
          impact: { type: 'string', example: 'Delays customer activation by 2 weeks' },
          timestampMs: { type: 'integer', example: 180000 },
        },
      },
      CustDevPositiveFeedback: {
        type: 'object',
        properties: {
          feature: { type: 'string', example: 'Dashboard analytics' },
          benefit: { type: 'string' },
          timestampMs: { type: 'integer' },
        },
      },
      CustDevProductSuggestion: {
        type: 'object',
        properties: {
          type: { type: 'string', example: 'Feature Request' },
          priority: { type: 'string', example: 'High' },
          description: { type: 'string' },
          relatedPainPoint: { type: 'string' },
        },
      },
      CustDevActionItem: {
        type: 'object',
        properties: {
          owner: { type: 'string', example: 'Product' },
          action: { type: 'string', example: 'Evaluate bulk import feasibility' },
          timestampMs: { type: 'integer' },
        },
      },
      CustDevMindMap: {
        type: 'object',
        properties: {
          centralNode: {
            type: 'object',
            properties: {
              label: { type: 'string' },
              description: { type: 'string' },
            },
          },
          branches: { type: 'object' },
          connections: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                from: { type: 'string' },
                to: { type: 'string' },
                reason: { type: 'string' },
              },
            },
          },
        },
      },
      CustDevFull: {
        type: 'object',
        properties: {
          callSummary: { $ref: '#/components/schemas/CustDevCallSummary' },
          keyPainPoints: {
            type: 'array',
            items: { $ref: '#/components/schemas/CustDevPainPoint' },
          },
          positiveFeedback: {
            type: 'array',
            items: { $ref: '#/components/schemas/CustDevPositiveFeedback' },
          },
          productSuggestions: {
            type: 'array',
            items: { $ref: '#/components/schemas/CustDevProductSuggestion' },
          },
          internalActionItems: {
            type: 'array',
            items: { $ref: '#/components/schemas/CustDevActionItem' },
          },
          mindMap: { $ref: '#/components/schemas/CustDevMindMap' },
        },
      },

      // Share schemas
      LectureShare: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          lectureId: { type: 'string', format: 'uuid' },
          slug: { type: 'string', example: 'intro-to-physics-abc123' },
          isPublic: { type: 'boolean', example: true },
          showTranscription: { type: 'boolean', example: true },
          showSummary: { type: 'boolean', example: true },
          showKeyPoints: { type: 'boolean', example: true },
          viewCount: { type: 'integer', example: 42 },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      PublicLecture: {
        type: 'object',
        properties: {
          slug: { type: 'string', example: 'intro-to-physics-abc123' },
          title: { type: 'string', example: 'Introduction to Physics', nullable: true },
          durationSeconds: { type: 'integer', nullable: true },
          durationFormatted: { type: 'string', example: '45:30', nullable: true },
          language: { type: 'string', example: 'uz' },
          summarizationType: { type: 'string', example: 'lecture' },
          createdAt: { type: 'string', format: 'date-time' },
          ownerName: { type: 'string', nullable: true, example: 'John Doe' },
          transcription: {
            type: 'object',
            nullable: true,
            properties: {
              fullText: { type: 'string' },
              wordCount: { type: 'integer' },
              segments: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    index: { type: 'integer' },
                    startTimeMs: { type: 'integer' },
                    endTimeMs: { type: 'integer' },
                    startTimeFormatted: { type: 'string' },
                    endTimeFormatted: { type: 'string' },
                    text: { type: 'string' },
                    speaker: { type: 'string', nullable: true },
                  },
                },
              },
            },
          },
          summary: {
            type: 'object',
            nullable: true,
            properties: {
              overview: { type: 'string' },
              chapters: {
                type: 'array',
                nullable: true,
                items: { $ref: '#/components/schemas/Chapter' },
              },
            },
          },
          keyPoints: {
            type: 'array',
            nullable: true,
            items: { $ref: '#/components/schemas/KeyPoint' },
          },
        },
      },

      // Processing status
      ProcessingStatus: {
        type: 'object',
        properties: {
          lectureId: { type: 'string', format: 'uuid' },
          status: { type: 'string' },
          progress: { type: 'integer', minimum: 0, maximum: 100 },
          jobs: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                jobType: {
                  type: 'string',
                  enum: ['audio_extraction', 'transcription', 'summarization'],
                },
                status: { type: 'string', enum: ['pending', 'active', 'completed', 'failed'] },
                progress: { type: 'integer' },
                errorMessage: { type: 'string', nullable: true },
                startedAt: { type: 'string', format: 'date-time', nullable: true },
                completedAt: { type: 'string', format: 'date-time', nullable: true },
              },
            },
          },
        },
      },
    },
    responses: {
      UnauthorizedError: {
        description: 'Access token is missing or invalid',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' },
            example: {
              success: false,
              error: {
                code: 'UNAUTHORIZED',
                message: 'Invalid or expired token',
              },
            },
          },
        },
      },
      NotFoundError: {
        description: 'Resource not found',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' },
            example: {
              success: false,
              error: {
                code: 'NOT_FOUND',
                message: 'The requested resource was not found',
              },
            },
          },
        },
      },
      ValidationError: {
        description: 'Validation error',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' },
            example: {
              success: false,
              error: {
                code: 'VALIDATION_ERROR',
                message: 'Invalid request body',
                details: [{ path: 'email', message: 'Invalid email format' }],
              },
            },
          },
        },
      },
    },
  },
  paths: {
    // Health endpoints
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Health check',
        description: 'Check if the API is running',
        responses: {
          '200': {
            description: 'Service is healthy',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'ok' },
                    timestamp: { type: 'string', format: 'date-time' },
                    version: { type: 'string', example: '1.0.0' },
                  },
                },
              },
            },
          },
        },
      },
    },

    // Auth endpoints
    '/api/v1/auth/register': {
      post: {
        tags: ['Authentication'],
        summary: 'Register a new user',
        description: 'Create a new account with email and password',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email', example: 'user@example.com' },
                  password: { type: 'string', minLength: 8, example: 'securepassword123' },
                  name: { type: 'string', example: 'John Doe' },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'User created successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        user: { $ref: '#/components/schemas/User' },
                        tokens: { $ref: '#/components/schemas/Tokens' },
                      },
                    },
                  },
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/ValidationError' },
          '409': {
            description: 'Email already exists',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' },
              },
            },
          },
        },
      },
    },
    '/api/v1/auth/login': {
      post: {
        tags: ['Authentication'],
        summary: 'Login with email and password',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Login successful',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        user: { $ref: '#/components/schemas/User' },
                        tokens: { $ref: '#/components/schemas/Tokens' },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': {
            description: 'Invalid credentials',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' },
              },
            },
          },
        },
      },
    },
    '/api/v1/auth/telegram': {
      post: {
        tags: ['Authentication'],
        summary: 'Authenticate with Telegram',
        description:
          'Authenticate using Telegram ID (for Telegram bot integration). Creates a new account if user does not exist. Use this endpoint when authenticating users from your Telegram bot.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['telegramId'],
                properties: {
                  telegramId: { type: 'integer', example: 123456789 },
                  username: { type: 'string', example: 'johndoe' },
                  firstName: { type: 'string', example: 'John' },
                  lastName: { type: 'string', example: 'Doe' },
                  languageCode: { type: 'string', example: 'en' },
                  isPremium: { type: 'boolean', example: false },
                  photoUrl: { type: 'string', format: 'uri', example: 'https://t.me/i/userpic/320/photo.jpg' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Existing user authenticated',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        user: { $ref: '#/components/schemas/User' },
                        tokens: { $ref: '#/components/schemas/Tokens' },
                        isNewUser: { type: 'boolean', example: false },
                      },
                    },
                  },
                },
              },
            },
          },
          '201': {
            description: 'New user created and authenticated',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        user: { $ref: '#/components/schemas/User' },
                        tokens: { $ref: '#/components/schemas/Tokens' },
                        isNewUser: { type: 'boolean', example: true },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/v1/auth/telegram/webapp': {
      post: {
        tags: ['Authentication'],
        summary: 'Authenticate with Telegram Mini App',
        description: `
Authenticate using Telegram Mini App (WebApp) init data. This is the secure authentication method
that validates the cryptographic signature from Telegram. Creates a new account if user does not exist.

**Required Headers:**
- \`Authorization: tma <initDataRaw>\`

The initDataRaw is the raw init data string from Telegram WebApp (\`window.Telegram.WebApp.initData\`).
This data is cryptographically signed by Telegram and validated on the server using the bot token.

**Init data expires after 1 hour.**
        `,
        parameters: [
          {
            name: 'Authorization',
            in: 'header',
            required: true,
            schema: { type: 'string', example: 'tma query_id=AAHd...&user=%7B%22id%22%3A...' },
            description: 'Telegram Mini App init data with "tma " prefix',
          },
        ],
        responses: {
          '200': {
            description: 'Existing user authenticated',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        user: { $ref: '#/components/schemas/User' },
                        tokens: { $ref: '#/components/schemas/Tokens' },
                        isNewUser: { type: 'boolean', example: false },
                      },
                    },
                  },
                },
              },
            },
          },
          '201': {
            description: 'New user created and authenticated',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        user: { $ref: '#/components/schemas/User' },
                        tokens: { $ref: '#/components/schemas/Tokens' },
                        isNewUser: { type: 'boolean', example: true },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': {
            description: 'Invalid or expired init data',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' },
                examples: {
                  expired: {
                    summary: 'Init data expired',
                    value: {
                      success: false,
                      error: {
                        code: 'INIT_DATA_EXPIRED',
                        message: 'Telegram init data expired',
                      },
                    },
                  },
                  invalidSignature: {
                    summary: 'Invalid signature',
                    value: {
                      success: false,
                      error: {
                        code: 'INVALID_SIGNATURE',
                        message: 'Invalid Telegram init data signature',
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/v1/auth/refresh': {
      post: {
        tags: ['Authentication'],
        summary: 'Refresh access token',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['refreshToken'],
                properties: {
                  refreshToken: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Token refreshed successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        tokens: { $ref: '#/components/schemas/Tokens' },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/UnauthorizedError' },
        },
      },
    },
    '/api/v1/auth/logout': {
      post: {
        tags: ['Authentication'],
        summary: 'Logout',
        description: 'Revoke the refresh token',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['refreshToken'],
                properties: {
                  refreshToken: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Logged out successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        message: { type: 'string', example: 'Logged out successfully' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/v1/auth/me': {
      get: {
        tags: ['Authentication'],
        summary: 'Get current user',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Current user info',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        user: { $ref: '#/components/schemas/User' },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/UnauthorizedError' },
        },
      },
    },
    '/api/v1/auth/logout-all': {
      post: {
        tags: ['Authentication'],
        summary: 'Logout from all devices',
        description: 'Revoke all refresh tokens for the current user',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Logged out from all devices',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        message: { type: 'string', example: 'Logged out from all devices' },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/UnauthorizedError' },
        },
      },
    },
    '/api/v1/auth/link-telegram': {
      post: {
        tags: ['Authentication'],
        summary: 'Link Telegram account',
        description: 'Link a Telegram account to the current user',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['telegramId'],
                properties: {
                  telegramId: { type: 'integer', example: 123456789 },
                  username: { type: 'string', example: 'johndoe' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Telegram account linked',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        user: { $ref: '#/components/schemas/User' },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/UnauthorizedError' },
          '409': {
            description: 'Telegram ID already linked to another account',
          },
        },
      },
    },

    // Lecture endpoints
    '/api/v1/lectures': {
      get: {
        tags: ['Lectures'],
        summary: 'List lectures',
        description: "Get a paginated list of the user's lectures",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'page',
            in: 'query',
            schema: { type: 'integer', default: 1, minimum: 1 },
          },
          {
            name: 'limit',
            in: 'query',
            schema: { type: 'integer', default: 20, minimum: 1, maximum: 100 },
          },
          {
            name: 'status',
            in: 'query',
            schema: {
              type: 'string',
              enum: [
                'pending',
                'extracting_audio',
                'transcribing',
                'summarizing',
                'completed',
                'failed',
              ],
            },
          },
          {
            name: 'search',
            in: 'query',
            schema: { type: 'string' },
            description: 'Search by title',
          },
          {
            name: 'fields',
            in: 'query',
            schema: { type: 'string', enum: ['minimal', 'full'], default: 'full' },
            description: 'Response fields: minimal (less data) or full (all fields)',
          },
        ],
        responses: {
          '200': {
            description: 'List of lectures',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/Lecture' },
                    },
                    pagination: { $ref: '#/components/schemas/Pagination' },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/UnauthorizedError' },
        },
      },
      post: {
        tags: ['Lectures'],
        summary: 'Create lecture',
        description: 'Create a new lecture record (usually called after upload completion)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['originalFilename', 'gcsUri', 'fileSizeBytes', 'mimeType'],
                properties: {
                  title: { type: 'string' },
                  originalFilename: { type: 'string' },
                  gcsUri: { type: 'string' },
                  fileSizeBytes: { type: 'integer' },
                  mimeType: { type: 'string' },
                  language: { type: 'string', default: 'uz' },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Lecture created',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        lecture: { $ref: '#/components/schemas/Lecture' },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/UnauthorizedError' },
        },
      },
    },
    '/api/v1/lectures/{id}': {
      get: {
        tags: ['Lectures'],
        summary: 'Get lecture',
        description: 'Get lecture with full details (transcription, summary, key points)',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '200': {
            description: 'Lecture details',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        lecture: { $ref: '#/components/schemas/LectureWithDetails' },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/UnauthorizedError' },
          '404': { $ref: '#/components/responses/NotFoundError' },
        },
      },
      patch: {
        tags: ['Lectures'],
        summary: 'Update lecture',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  title: { type: 'string', description: 'Lecture title (max 500 chars)' },
                  language: { type: 'string', enum: ['uz', 'ru', 'en'], description: 'Language code' },
                  folderId: {
                    type: 'string',
                    format: 'uuid',
                    nullable: true,
                    description: 'Folder ID to move lecture to, or null to remove from folder',
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Lecture updated',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        lecture: { $ref: '#/components/schemas/Lecture' },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/UnauthorizedError' },
          '404': { $ref: '#/components/responses/NotFoundError' },
        },
      },
      delete: {
        tags: ['Lectures'],
        summary: 'Delete lecture',
        description: 'Delete lecture and all related data (transcription, summary, files)',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '200': {
            description: 'Lecture deleted',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        message: { type: 'string', example: 'Lecture deleted successfully' },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/UnauthorizedError' },
          '404': { $ref: '#/components/responses/NotFoundError' },
        },
      },
    },
    '/api/v1/lectures/{id}/status': {
      get: {
        tags: ['Lectures'],
        summary: 'Get processing status',
        description: 'Get detailed processing status with job progress',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '200': {
            description: 'Processing status',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: { $ref: '#/components/schemas/ProcessingStatus' },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/UnauthorizedError' },
          '404': { $ref: '#/components/responses/NotFoundError' },
        },
      },
    },
    '/api/v1/lectures/{id}/transcription': {
      get: {
        tags: ['Lectures'],
        summary: 'Get transcription',
        description: 'Get lecture transcription with segments and timestamps',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '200': {
            description: 'Transcription data',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        transcription: { $ref: '#/components/schemas/TranscriptionWithSegments' },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/UnauthorizedError' },
          '404': { $ref: '#/components/responses/NotFoundError' },
        },
      },
    },
    '/api/v1/lectures/{id}/summary': {
      get: {
        tags: ['Lectures - Content'],
        summary: 'Get summary with key points',
        description: 'Get lecture summary with chapters and key points',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '200': {
            description: 'Summary data',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        summary: { $ref: '#/components/schemas/Summary' },
                        keyPoints: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/KeyPoint' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/UnauthorizedError' },
          '404': { $ref: '#/components/responses/NotFoundError' },
        },
      },
    },

    // Batch status endpoint
    '/api/v1/lectures/status': {
      post: {
        tags: ['Lectures - Status'],
        summary: 'Batch status check',
        description: 'Check status of multiple lectures in a single request',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['ids'],
                properties: {
                  ids: {
                    type: 'array',
                    items: { type: 'string', format: 'uuid' },
                    maxItems: 50,
                    description: 'Array of lecture UUIDs (max 50)',
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Batch status response',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        statuses: {
                          type: 'object',
                          additionalProperties: { $ref: '#/components/schemas/LectureStatusLight' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/UnauthorizedError' },
        },
      },
    },

    // Lightweight status endpoint
    '/api/v1/lectures/{id}/status/light': {
      get: {
        tags: ['Lectures - Status'],
        summary: 'Get lightweight status',
        description: 'Get lightweight status for efficient polling. Recommended for polling.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '200': {
            description: 'Lightweight status (~100 bytes)',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: { $ref: '#/components/schemas/LectureStatusLight' },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/UnauthorizedError' },
          '404': { $ref: '#/components/responses/NotFoundError' },
        },
      },
    },

    // Paginated transcript endpoint
    '/api/v1/lectures/{id}/transcript': {
      get: {
        tags: ['Lectures - Content'],
        summary: 'Get transcript (paginated)',
        description: 'Get transcription with optional pagination for segments',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
          {
            name: 'page',
            in: 'query',
            schema: { type: 'integer', minimum: 1 },
            description: 'Page number (enables pagination)',
          },
          {
            name: 'limit',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
            description: 'Segments per page (max: 100)',
          },
        ],
        responses: {
          '200': {
            description: 'Transcription data',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        transcription: {
                          type: 'object',
                          properties: {
                            fullText: { type: 'string' },
                            wordCount: { type: 'integer' },
                            segments: {
                              type: 'array',
                              items: { $ref: '#/components/schemas/TranscriptionSegment' },
                            },
                            pagination: { $ref: '#/components/schemas/Pagination' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/UnauthorizedError' },
          '404': { $ref: '#/components/responses/NotFoundError' },
        },
      },
    },

    // Summary only endpoint
    '/api/v1/lectures/{id}/summary-only': {
      get: {
        tags: ['Lectures - Content'],
        summary: 'Get summary only',
        description: 'Get summary without key points (smaller payload)',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '200': {
            description: 'Summary data (without key points)',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        summary: { $ref: '#/components/schemas/Summary' },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/UnauthorizedError' },
          '404': { $ref: '#/components/responses/NotFoundError' },
        },
      },
    },

    // Key points only endpoint
    '/api/v1/lectures/{id}/keypoints': {
      get: {
        tags: ['Lectures - Content'],
        summary: 'Get key points only',
        description: 'Get key points array only',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '200': {
            description: 'Key points data',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        keyPoints: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/KeyPoint' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/UnauthorizedError' },
          '404': { $ref: '#/components/responses/NotFoundError' },
        },
      },
    },

    // CustDev endpoints
    '/api/v1/lectures/{id}/custdev': {
      get: {
        tags: ['Lectures - CustDev'],
        summary: 'Get full CustDev data',
        description: 'Get all CustDev analysis data. Only available for lectures with summarizationType: "custdev"',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '200': {
            description: 'Full CustDev analysis',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: { $ref: '#/components/schemas/CustDevFull' },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/UnauthorizedError' },
          '404': { $ref: '#/components/responses/NotFoundError' },
        },
      },
    },
    '/api/v1/lectures/{id}/custdev/mindmap': {
      get: {
        tags: ['Lectures - CustDev'],
        summary: 'Get CustDev mind map',
        description: 'Get only the mind map visualization data',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '200': {
            description: 'Mind map data',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        mindMap: { $ref: '#/components/schemas/CustDevMindMap' },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/UnauthorizedError' },
          '404': { $ref: '#/components/responses/NotFoundError' },
        },
      },
    },
    '/api/v1/lectures/{id}/custdev/painpoints': {
      get: {
        tags: ['Lectures - CustDev'],
        summary: 'Get CustDev pain points',
        description: 'Get only the pain points array',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '200': {
            description: 'Pain points data',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        keyPainPoints: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/CustDevPainPoint' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/UnauthorizedError' },
          '404': { $ref: '#/components/responses/NotFoundError' },
        },
      },
    },
    '/api/v1/lectures/{id}/custdev/suggestions': {
      get: {
        tags: ['Lectures - CustDev'],
        summary: 'Get CustDev suggestions',
        description: 'Get only the product suggestions array',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '200': {
            description: 'Product suggestions data',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        productSuggestions: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/CustDevProductSuggestion' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/UnauthorizedError' },
          '404': { $ref: '#/components/responses/NotFoundError' },
        },
      },
    },
    '/api/v1/lectures/{id}/custdev/actions': {
      get: {
        tags: ['Lectures - CustDev'],
        summary: 'Get CustDev action items',
        description: 'Get only the internal action items array',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '200': {
            description: 'Action items data',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        internalActionItems: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/CustDevActionItem' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/UnauthorizedError' },
          '404': { $ref: '#/components/responses/NotFoundError' },
        },
      },
    },

    // Lecture Tags endpoints
    '/api/v1/lectures/{lectureId}/tags': {
      get: {
        tags: ['Lectures - Tags'],
        summary: 'Get lecture tags',
        description: 'Get all tags assigned to a lecture',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'lectureId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '200': {
            description: 'Lecture tags',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        tags: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/Tag' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/UnauthorizedError' },
          '404': { $ref: '#/components/responses/NotFoundError' },
        },
      },
      put: {
        tags: ['Lectures - Tags'],
        summary: 'Set lecture tags',
        description: 'Replace all tags on a lecture with the specified tags',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'lectureId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['tagIds'],
                properties: {
                  tagIds: {
                    type: 'array',
                    items: { type: 'string', format: 'uuid' },
                    description: 'Array of tag UUIDs to assign (can be empty to remove all)',
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Updated lecture tags',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        tags: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/Tag' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/UnauthorizedError' },
          '404': { $ref: '#/components/responses/NotFoundError' },
        },
      },
    },
    '/api/v1/lectures/{lectureId}/tags/{tagId}': {
      post: {
        tags: ['Lectures - Tags'],
        summary: 'Add tag to lecture',
        description: 'Add a single tag to a lecture. If already assigned, succeeds silently.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'lectureId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
          {
            name: 'tagId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '200': {
            description: 'Tag added',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        message: { type: 'string', example: 'Tag added to lecture' },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/UnauthorizedError' },
          '404': { $ref: '#/components/responses/NotFoundError' },
        },
      },
      delete: {
        tags: ['Lectures - Tags'],
        summary: 'Remove tag from lecture',
        description: 'Remove a single tag from a lecture',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'lectureId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
          {
            name: 'tagId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '200': {
            description: 'Tag removed',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        message: { type: 'string', example: 'Tag removed from lecture' },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/UnauthorizedError' },
          '404': { $ref: '#/components/responses/NotFoundError' },
        },
      },
    },

    // Lecture Share endpoints
    '/api/v1/lectures/{id}/share': {
      post: {
        tags: ['Lectures - Share'],
        summary: 'Create share link',
        description: `
Create a public share link for a lecture. Only completed lectures can be shared.

The share URL will be \`/api/v1/s/{slug}\` where slug is either auto-generated from the title or custom-provided.

**Example auto-generated slugs:**
- "Introduction to Physics" → "introduction-to-physics-abc123"
- "Машинное обучение 101" → "mashinnoe-obuchenie-101-xyz789"
        `,
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  customSlug: {
                    type: 'string',
                    minLength: 3,
                    maxLength: 100,
                    example: 'my-physics-lecture',
                    description: 'Custom URL slug (optional). If not provided, auto-generated from title.',
                  },
                  showTranscription: {
                    type: 'boolean',
                    default: true,
                    description: 'Include transcription in public view',
                  },
                  showSummary: {
                    type: 'boolean',
                    default: true,
                    description: 'Include summary in public view',
                  },
                  showKeyPoints: {
                    type: 'boolean',
                    default: true,
                    description: 'Include key points in public view',
                  },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Share link created',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        share: { $ref: '#/components/schemas/LectureShare' },
                        shareUrl: { type: 'string', example: '/s/intro-to-physics-abc123' },
                      },
                    },
                  },
                },
              },
            },
          },
          '400': {
            description: 'Lecture not completed yet',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' },
                example: {
                  success: false,
                  error: {
                    code: 'LECTURE_NOT_COMPLETED',
                    message: 'Only completed lectures can be shared publicly',
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/UnauthorizedError' },
          '404': { $ref: '#/components/responses/NotFoundError' },
          '409': {
            description: 'Share already exists or custom slug taken',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' },
              },
            },
          },
        },
      },
      get: {
        tags: ['Lectures - Share'],
        summary: 'Get share settings',
        description: 'Get the current share settings for a lecture. Returns null if not shared.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '200': {
            description: 'Share settings',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        share: {
                          allOf: [{ $ref: '#/components/schemas/LectureShare' }],
                          nullable: true,
                        },
                        shareUrl: { type: 'string', nullable: true, example: '/s/intro-to-physics-abc123' },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/UnauthorizedError' },
          '404': { $ref: '#/components/responses/NotFoundError' },
        },
      },
      patch: {
        tags: ['Lectures - Share'],
        summary: 'Update share settings',
        description: 'Update visibility settings for a shared lecture.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  isPublic: {
                    type: 'boolean',
                    description: 'Toggle public visibility (false to temporarily hide)',
                  },
                  showTranscription: { type: 'boolean' },
                  showSummary: { type: 'boolean' },
                  showKeyPoints: { type: 'boolean' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Share settings updated',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        share: { $ref: '#/components/schemas/LectureShare' },
                        shareUrl: { type: 'string', example: '/s/intro-to-physics-abc123' },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/UnauthorizedError' },
          '404': { $ref: '#/components/responses/NotFoundError' },
        },
      },
      delete: {
        tags: ['Lectures - Share'],
        summary: 'Revoke share link',
        description: 'Delete the share link and make the lecture private again.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '200': {
            description: 'Share link revoked',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        message: { type: 'string', example: 'Share link has been revoked' },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/UnauthorizedError' },
          '404': { $ref: '#/components/responses/NotFoundError' },
        },
      },
    },

    // Share utility endpoints
    '/api/v1/shares/check-slug': {
      post: {
        tags: ['Lectures - Share'],
        summary: 'Check slug availability',
        description: 'Check if a custom slug is available for use.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['slug'],
                properties: {
                  slug: {
                    type: 'string',
                    minLength: 1,
                    maxLength: 100,
                    example: 'my-custom-slug',
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Slug availability status',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        slug: { type: 'string', example: 'my-custom-slug' },
                        available: { type: 'boolean', example: true },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/UnauthorizedError' },
        },
      },
    },

    // Public share access (no auth required)
    '/api/v1/s/{slug}': {
      get: {
        tags: ['Public'],
        summary: 'Get shared lecture',
        description: `
Get a publicly shared lecture by its slug. **No authentication required.**

The response includes only the content that the owner has enabled for public viewing.
View count is automatically incremented.
        `,
        parameters: [
          {
            name: 'slug',
            in: 'path',
            required: true,
            schema: { type: 'string', minLength: 3, maxLength: 255 },
            example: 'intro-to-physics-abc123',
          },
        ],
        responses: {
          '200': {
            description: 'Public lecture data',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: { $ref: '#/components/schemas/PublicLecture' },
                  },
                },
              },
            },
          },
          '404': {
            description: 'Share not found or no longer public',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' },
                example: {
                  success: false,
                  error: {
                    code: 'SHARE_NOT_FOUND',
                    message: 'Shared lecture not found or is no longer public',
                  },
                },
              },
            },
          },
        },
      },
    },

    // Folder endpoints
    '/api/v1/folders': {
      get: {
        tags: ['Folders'],
        summary: 'List folders',
        description: 'Get all folders as a flat list',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'List of folders',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        folders: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/Folder' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/UnauthorizedError' },
        },
      },
      post: {
        tags: ['Folders'],
        summary: 'Create folder',
        description: 'Create a new folder',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: {
                  name: { type: 'string', minLength: 1, maxLength: 255, example: 'Semester 1' },
                  color: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$', example: '#9B59B6' },
                  parentId: {
                    type: 'string',
                    format: 'uuid',
                    description: 'Parent folder ID for nesting',
                  },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Folder created',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        folder: { $ref: '#/components/schemas/Folder' },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/UnauthorizedError' },
          '404': { $ref: '#/components/responses/NotFoundError' },
          '409': {
            description: 'Folder with this name already exists',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' },
              },
            },
          },
        },
      },
    },
    '/api/v1/folders/tree': {
      get: {
        tags: ['Folders'],
        summary: 'List folders (tree)',
        description: 'Get folders as a nested tree structure',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Folder tree',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        folders: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/FolderWithChildren' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/UnauthorizedError' },
        },
      },
    },
    '/api/v1/folders/{id}': {
      get: {
        tags: ['Folders'],
        summary: 'Get folder',
        description: 'Get a folder by ID with lecture count',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '200': {
            description: 'Folder details',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        folder: { $ref: '#/components/schemas/Folder' },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/UnauthorizedError' },
          '404': { $ref: '#/components/responses/NotFoundError' },
        },
      },
      patch: {
        tags: ['Folders'],
        summary: 'Update folder',
        description: 'Update folder name, color, or parent',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string', minLength: 1, maxLength: 255 },
                  color: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$', nullable: true },
                  parentId: {
                    type: 'string',
                    format: 'uuid',
                    nullable: true,
                    description: 'New parent folder ID, or null for root',
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Folder updated',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        folder: { $ref: '#/components/schemas/Folder' },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/UnauthorizedError' },
          '404': { $ref: '#/components/responses/NotFoundError' },
          '409': {
            description: 'Conflict (name exists or circular reference)',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' },
              },
            },
          },
        },
      },
      delete: {
        tags: ['Folders'],
        summary: 'Delete folder',
        description:
          'Delete a folder. Child folders move to parent (or root). Lectures have folderId set to null.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '200': {
            description: 'Folder deleted',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        message: { type: 'string', example: 'Folder deleted successfully' },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/UnauthorizedError' },
          '404': { $ref: '#/components/responses/NotFoundError' },
        },
      },
    },

    // Tag endpoints
    '/api/v1/tags': {
      get: {
        tags: ['Tags'],
        summary: 'List tags',
        description: 'Get all tags for the user',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'counts',
            in: 'query',
            schema: { type: 'boolean', default: false },
            description: 'Include lecture counts per tag',
          },
        ],
        responses: {
          '200': {
            description: 'List of tags',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        tags: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/Tag' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/UnauthorizedError' },
        },
      },
      post: {
        tags: ['Tags'],
        summary: 'Create tag',
        description: 'Create a new tag',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: {
                  name: { type: 'string', minLength: 1, maxLength: 100, example: 'Important' },
                  color: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$', example: '#FF5733' },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Tag created',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        tag: { $ref: '#/components/schemas/Tag' },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/UnauthorizedError' },
          '409': {
            description: 'Tag with this name already exists',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' },
              },
            },
          },
        },
      },
    },
    '/api/v1/tags/{id}': {
      get: {
        tags: ['Tags'],
        summary: 'Get tag',
        description: 'Get a tag by ID',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '200': {
            description: 'Tag details',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        tag: { $ref: '#/components/schemas/Tag' },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/UnauthorizedError' },
          '404': { $ref: '#/components/responses/NotFoundError' },
        },
      },
      patch: {
        tags: ['Tags'],
        summary: 'Update tag',
        description: 'Update tag name or color',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string', minLength: 1, maxLength: 100 },
                  color: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$', nullable: true },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Tag updated',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        tag: { $ref: '#/components/schemas/Tag' },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/UnauthorizedError' },
          '404': { $ref: '#/components/responses/NotFoundError' },
          '409': {
            description: 'Tag with this name already exists',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' },
              },
            },
          },
        },
      },
      delete: {
        tags: ['Tags'],
        summary: 'Delete tag',
        description: 'Delete a tag. The tag is automatically removed from all lectures.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '200': {
            description: 'Tag deleted',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        message: { type: 'string', example: 'Tag deleted successfully' },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/UnauthorizedError' },
          '404': { $ref: '#/components/responses/NotFoundError' },
        },
      },
    },

    // Users endpoints
    '/api/v1/users/stats': {
      get: {
        tags: ['Users'],
        summary: 'Get user statistics',
        description: "Get statistics about the authenticated user's lectures",
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'User statistics',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: { $ref: '#/components/schemas/UserStats' },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/UnauthorizedError' },
        },
      },
    },

    // Upload endpoints
    '/api/v1/uploads': {
      post: {
        tags: ['Uploads'],
        summary: 'Create upload',
        description: `
Create a new resumable upload using the tus.io protocol.

**Required Headers:**
- \`Tus-Resumable: 1.0.0\`
- \`Upload-Length: <total file size in bytes>\`
- \`Upload-Metadata: filename <base64>,filetype <base64>,title <base64>,language <base64>\`

**Example Metadata:**
\`\`\`
filename bGVjdHVyZS5tcDQ=,filetype dmlkZW8vbXA0,title TXkgTGVjdHVyZQ==,language dXo=
\`\`\`

**Response:**
Returns \`Location\` header with the upload URL for PATCH requests.
        `,
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'Tus-Resumable',
            in: 'header',
            required: true,
            schema: { type: 'string', example: '1.0.0' },
          },
          {
            name: 'Upload-Length',
            in: 'header',
            required: true,
            schema: { type: 'integer' },
          },
          {
            name: 'Upload-Metadata',
            in: 'header',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          '201': {
            description: 'Upload created',
            headers: {
              Location: {
                description: 'URL for uploading chunks',
                schema: { type: 'string' },
              },
              'Tus-Resumable': {
                schema: { type: 'string', example: '1.0.0' },
              },
            },
          },
          '401': { $ref: '#/components/responses/UnauthorizedError' },
        },
      },
    },
    '/api/v1/uploads/{id}': {
      head: {
        tags: ['Uploads'],
        summary: 'Get upload status',
        description: 'Get the current offset of an upload to resume from',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
          {
            name: 'Tus-Resumable',
            in: 'header',
            required: true,
            schema: { type: 'string', example: '1.0.0' },
          },
        ],
        responses: {
          '200': {
            description: 'Upload status',
            headers: {
              'Upload-Offset': {
                description: 'Current upload offset in bytes',
                schema: { type: 'integer' },
              },
              'Upload-Length': {
                description: 'Total file size in bytes',
                schema: { type: 'integer' },
              },
            },
          },
          '404': { $ref: '#/components/responses/NotFoundError' },
        },
      },
      patch: {
        tags: ['Uploads'],
        summary: 'Upload chunk',
        description: `
Upload a chunk of the file. The chunk is appended at the current offset.

**Required Headers:**
- \`Tus-Resumable: 1.0.0\`
- \`Upload-Offset: <current offset>\`
- \`Content-Type: application/offset+octet-stream\`

On completion, the response includes \`X-Lecture-Id\` header with the created lecture ID.
        `,
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
          {
            name: 'Tus-Resumable',
            in: 'header',
            required: true,
            schema: { type: 'string', example: '1.0.0' },
          },
          {
            name: 'Upload-Offset',
            in: 'header',
            required: true,
            schema: { type: 'integer' },
          },
          {
            name: 'Content-Type',
            in: 'header',
            required: true,
            schema: { type: 'string', example: 'application/offset+octet-stream' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/offset+octet-stream': {
              schema: {
                type: 'string',
                format: 'binary',
              },
            },
          },
        },
        responses: {
          '204': {
            description: 'Chunk uploaded successfully',
            headers: {
              'Upload-Offset': {
                description: 'New upload offset after this chunk',
                schema: { type: 'integer' },
              },
              'X-Lecture-Id': {
                description: 'Lecture ID (only on completion)',
                schema: { type: 'string', format: 'uuid' },
              },
            },
          },
          '401': { $ref: '#/components/responses/UnauthorizedError' },
          '404': { $ref: '#/components/responses/NotFoundError' },
        },
      },
      delete: {
        tags: ['Uploads'],
        summary: 'Cancel upload',
        description: 'Cancel an in-progress upload and delete the partial file',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
          {
            name: 'Tus-Resumable',
            in: 'header',
            required: true,
            schema: { type: 'string', example: '1.0.0' },
          },
        ],
        responses: {
          '204': {
            description: 'Upload cancelled',
          },
          '404': { $ref: '#/components/responses/NotFoundError' },
        },
      },
    },
  },
};
