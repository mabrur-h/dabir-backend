import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import path from 'path';
import { fileURLToPath } from 'url';
import routes from './api/routes/index.js';
import { errorHandler } from './api/middleware/errorHandler.middleware.js';
import { createLogger } from './utils/logger.js';
import { swaggerDocument } from './config/swagger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logger = createLogger('app');

export const createApp = () => {
  const app = express();

  // Trust proxy - required for Cloud Run to get real client IPs from X-Forwarded-For
  // This is necessary for rate limiting to work correctly
  app.set('trust proxy', true);

  // Security middleware
  app.use(
    helmet({
      crossOriginOpenerPolicy: false,
      crossOriginResourcePolicy: false,
    })
  );

  // CORS with TUS headers support
  // Note: Safari requires explicit origin when credentials: true (doesn't work with '*')
  const corsOrigin = process.env.CORS_ORIGIN;
  app.use(
    cors({
      origin: corsOrigin === '*' ? true : (corsOrigin || true),
      credentials: true,
      exposedHeaders: [
        'Upload-Offset',
        'Upload-Length',
        'Upload-Metadata',
        'Tus-Resumable',
        'Tus-Version',
        'Tus-Extension',
        'Tus-Max-Size',
        'X-Lecture-Id',
        'Location',
      ],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'Upload-Offset',
        'Upload-Length',
        'Upload-Metadata',
        'Tus-Resumable',
        'X-HTTP-Method-Override',
      ],
    })
  );

  // Body parsing - skip for TUS upload routes (they handle raw binary data)
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/v1/uploads')) {
      return next();
    }
    express.json({ limit: '10mb' })(req, res, next);
  });
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/v1/uploads')) {
      return next();
    }
    express.urlencoded({ extended: true })(req, res, next);
  });

  // Swagger API documentation
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'UzNotes-AI API Documentation',
  }));

  // Serve static test UI
  app.use(express.static(path.join(__dirname, '../public')));

  // Serve OpenAPI spec as JSON
  app.get('/api/docs.json', (_req, res) => {
    res.json(swaggerDocument);
  });

  // Request logging
  app.use((req, _res, next) => {
    logger.debug({ method: req.method, path: req.path }, 'Incoming request');
    next();
  });

  // Routes
  app.use(routes);

  // 404 handler
  app.use((_req, res) => {
    res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'The requested resource was not found',
      },
    });
  });

  // Error handler
  app.use(errorHandler);

  return app;
};
