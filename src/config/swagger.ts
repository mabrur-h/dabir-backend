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
          'Authenticate using Telegram ID. Creates a new account if user does not exist.',
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
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Authentication successful',
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
                        isNewUser: { type: 'boolean' },
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
                  title: { type: 'string' },
                  language: { type: 'string' },
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
        tags: ['Lectures'],
        summary: 'Get summary',
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
