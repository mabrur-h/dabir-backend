import { Router } from 'express';
import healthRoutes from './health.routes.js';
import authRoutes from './auth.routes.js';
import lecturesRoutes from './lectures.routes.js';
import uploadsRoutes from './uploads.routes.js';

const router = Router();

// Health check routes (no version prefix)
router.use('/health', healthRoutes);

// API v1 routes
router.use('/api/v1/auth', authRoutes);
router.use('/api/v1/lectures', lecturesRoutes);
router.use('/api/v1/uploads', uploadsRoutes);

export default router;
