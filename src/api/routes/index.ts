import { Router } from 'express';
import healthRoutes from './health.routes.js';
import authRoutes from './auth.routes.js';
import lecturesRoutes from './lectures.routes.js';
import uploadsRoutes from './uploads.routes.js';
import usersRoutes from './users.routes.js';
import foldersRoutes from './folders.routes.js';
import tagsRoutes from './tags.routes.js';
import publicShareRoutes, { shareUtilRouter } from './shares.routes.js';
import subscriptionRoutes from './subscription.routes.js';

const router = Router();

// Health check routes (no version prefix)
router.use('/health', healthRoutes);

// API v1 routes
router.use('/api/v1/auth', authRoutes);
router.use('/api/v1/lectures', lecturesRoutes);
router.use('/api/v1/uploads', uploadsRoutes);
router.use('/api/v1/users', usersRoutes);
router.use('/api/v1/folders', foldersRoutes);
router.use('/api/v1/tags', tagsRoutes);
router.use('/api/v1/subscription', subscriptionRoutes);

// Share routes
router.use('/api/v1/shares', shareUtilRouter); // Authenticated utility routes (check-slug)
router.use('/api/v1/s', publicShareRoutes); // Public share access (no auth)

export default router;
