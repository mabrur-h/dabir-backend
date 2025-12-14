import { Router } from 'express';

const router = Router();

// Basic health check
router.get('/', (_req, res) => {
  res.json({
    success: true,
    data: {
      status: 'healthy',
      timestamp: new Date().toISOString(),
    },
  });
});

// Readiness check (includes DB and Redis)
router.get('/ready', async (_req, res) => {
  // TODO: Add actual DB and Redis health checks
  const checks = {
    database: true,
    redis: true,
  };

  const isReady = Object.values(checks).every(Boolean);

  res.status(isReady ? 200 : 503).json({
    success: isReady,
    data: {
      status: isReady ? 'ready' : 'not ready',
      checks,
      timestamp: new Date().toISOString(),
    },
  });
});

export default router;
