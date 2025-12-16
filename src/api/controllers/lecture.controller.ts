import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as lectureService from '../../services/lecture/lecture.service.js';
import type { AuthenticatedRequest } from '../../types/index.js';
import { LECTURE_STATUS, PAGINATION, type LectureStatus } from '../../config/constants.js';

// ============================================
// ADDITIONAL VALIDATION SCHEMAS
// ============================================

export const paginationQuerySchema = z.object({
  page: z.string().transform(Number).pipe(z.number().int().positive()).optional(),
  limit: z
    .string()
    .transform(Number)
    .pipe(z.number().int().positive().max(PAGINATION.MAX_LIMIT))
    .optional(),
});

export const batchStatusSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(50),
});

export const listLecturesOptimizedQuerySchema = z.object({
  page: z.string().transform(Number).pipe(z.number().int().positive()).optional(),
  limit: z
    .string()
    .transform(Number)
    .pipe(z.number().int().positive().max(PAGINATION.MAX_LIMIT))
    .optional(),
  status: z
    .enum([
      LECTURE_STATUS.UPLOADED,
      LECTURE_STATUS.EXTRACTING,
      LECTURE_STATUS.TRANSCRIBING,
      LECTURE_STATUS.SUMMARIZING,
      LECTURE_STATUS.COMPLETED,
      LECTURE_STATUS.FAILED,
      'processing',
    ])
    .optional(),
  search: z.string().max(255).optional(),
  fields: z.enum(['minimal', 'full']).optional(),
});

// ============================================
// VALIDATION SCHEMAS
// ============================================

export const createLectureSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  originalFilename: z.string().min(1).max(500),
  gcsUri: z.string().min(1),
  fileSizeBytes: z.number().int().positive(),
  mimeType: z.string().min(1).max(100),
  language: z.enum(['uz', 'ru', 'en']).optional(),
});

export const updateLectureSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  language: z.enum(['uz', 'ru', 'en']).optional(),
  folderId: z.string().uuid().nullable().optional(),
});

export const listLecturesQuerySchema = z.object({
  page: z.string().transform(Number).pipe(z.number().int().positive()).optional(),
  limit: z
    .string()
    .transform(Number)
    .pipe(z.number().int().positive().max(PAGINATION.MAX_LIMIT))
    .optional(),
  status: z
    .enum([
      LECTURE_STATUS.UPLOADED,
      LECTURE_STATUS.EXTRACTING,
      LECTURE_STATUS.TRANSCRIBING,
      LECTURE_STATUS.SUMMARIZING,
      LECTURE_STATUS.COMPLETED,
      LECTURE_STATUS.FAILED,
    ])
    .optional(),
  search: z.string().max(255).optional(),
});

export const lectureIdParamSchema = z.object({
  id: z.string().uuid('Invalid lecture ID'),
});

// ============================================
// CONTROLLERS
// ============================================

/**
 * POST /lectures
 * Create a new lecture (usually called after upload completes)
 */
export async function create(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const input = createLectureSchema.parse(req.body);

    const lecture = await lectureService.createLecture({
      userId: user.id,
      ...input,
    });

    res.status(201).json({
      success: true,
      data: { lecture },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /lectures
 * List user's lectures with pagination
 */
export async function list(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const query = listLecturesQuerySchema.parse(req.query);

    const result = await lectureService.listLectures(
      user.id,
      {
        page: query.page ?? PAGINATION.DEFAULT_PAGE,
        limit: query.limit ?? PAGINATION.DEFAULT_LIMIT,
      },
      {
        status: query.status as LectureStatus | undefined,
        search: query.search,
      }
    );

    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /lectures/:id
 * Get lecture details with transcription and summary
 */
export async function getById(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const { id } = lectureIdParamSchema.parse(req.params);

    const lecture = await lectureService.getLectureDetails(id, user.id);

    res.json({
      success: true,
      data: { lecture },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /lectures/:id
 * Update lecture (title, language)
 */
export async function update(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const { id } = lectureIdParamSchema.parse(req.params);
    const input = updateLectureSchema.parse(req.body);

    const lecture = await lectureService.updateLecture(id, user.id, input);

    res.json({
      success: true,
      data: { lecture },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /lectures/:id
 * Delete lecture and all related data
 */
export async function remove(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const { id } = lectureIdParamSchema.parse(req.params);

    await lectureService.deleteLecture(id, user.id);

    res.json({
      success: true,
      data: { message: 'Lecture deleted successfully' },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /lectures/:id/status
 * Get lecture processing status
 */
export async function getStatus(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const { id } = lectureIdParamSchema.parse(req.params);

    const status = await lectureService.getLectureStatus(id, user.id);

    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /lectures/:id/transcription
 * Get lecture transcription only
 */
export async function getTranscription(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const { id } = lectureIdParamSchema.parse(req.params);

    const lecture = await lectureService.getLectureDetails(id, user.id);

    if (!lecture.transcription) {
      res.status(404).json({
        success: false,
        error: {
          code: 'TRANSCRIPTION_NOT_FOUND',
          message: 'Transcription not available for this lecture',
        },
      });
      return;
    }

    res.json({
      success: true,
      data: { transcription: lecture.transcription },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /lectures/:id/summary
 * Get lecture summary and key points
 */
export async function getSummary(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const { id } = lectureIdParamSchema.parse(req.params);

    const lecture = await lectureService.getLectureDetails(id, user.id);

    if (!lecture.summary) {
      res.status(404).json({
        success: false,
        error: {
          code: 'SUMMARY_NOT_FOUND',
          message: 'Summary not available for this lecture',
        },
      });
      return;
    }

    res.json({
      success: true,
      data: {
        summary: lecture.summary,
        keyPoints: lecture.keyPoints,
      },
    });
  } catch (error) {
    next(error);
  }
}

// ============================================
// OPTIMIZED CONTROLLERS
// ============================================

/**
 * GET /lectures/:id/status/light
 * Lightweight status for polling (no jobs array)
 */
export async function getStatusLight(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const { id } = lectureIdParamSchema.parse(req.params);

    const status = await lectureService.getLectureStatusLight(id, user.id);

    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /lectures/status
 * Batch status check for multiple lectures
 */
export async function getBatchStatus(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const { ids } = batchStatusSchema.parse(req.body);

    const result = await lectureService.getBatchLectureStatus(ids, user.id);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /lectures/:id/transcript
 * Get transcription with optional pagination
 */
export async function getTranscript(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const { id } = lectureIdParamSchema.parse(req.params);
    const query = paginationQuerySchema.parse(req.query);

    const pagination = query.page && query.limit
      ? { page: query.page, limit: query.limit }
      : query.page
        ? { page: query.page, limit: PAGINATION.DEFAULT_LIMIT }
        : undefined;

    const transcription = await lectureService.getTranscriptionPaginated(id, user.id, pagination);

    if (!transcription) {
      res.status(404).json({
        success: false,
        error: {
          code: 'TRANSCRIPTION_NOT_FOUND',
          message: 'Transcription not available for this lecture',
        },
      });
      return;
    }

    res.json({
      success: true,
      data: { transcription },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /lectures/:id/summary-only
 * Get summary without keypoints
 */
export async function getSummaryOnly(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const { id } = lectureIdParamSchema.parse(req.params);

    const summary = await lectureService.getSummaryOnly(id, user.id);

    if (!summary) {
      res.status(404).json({
        success: false,
        error: {
          code: 'SUMMARY_NOT_FOUND',
          message: 'Summary not available for this lecture',
        },
      });
      return;
    }

    res.json({
      success: true,
      data: { summary },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /lectures/:id/keypoints
 * Get keypoints only
 */
export async function getKeyPoints(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const { id } = lectureIdParamSchema.parse(req.params);

    const result = await lectureService.getKeyPointsOnly(id, user.id);

    if (!result) {
      res.status(404).json({
        success: false,
        error: {
          code: 'KEYPOINTS_NOT_FOUND',
          message: 'Key points not available for this lecture',
        },
      });
      return;
    }

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /lectures/:id/custdev
 * Get full custdev data
 */
export async function getCustDev(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const { id } = lectureIdParamSchema.parse(req.params);

    const data = await lectureService.getCustDevData(id, user.id);

    if (!data) {
      res.status(404).json({
        success: false,
        error: {
          code: 'CUSTDEV_NOT_FOUND',
          message: 'CustDev data not available for this lecture',
        },
      });
      return;
    }

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /lectures/:id/custdev/mindmap
 * Get custdev mind map only
 */
export async function getCustDevMindMap(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const { id } = lectureIdParamSchema.parse(req.params);

    const data = await lectureService.getCustDevMindMap(id, user.id);

    if (!data) {
      res.status(404).json({
        success: false,
        error: {
          code: 'MINDMAP_NOT_FOUND',
          message: 'Mind map not available for this lecture',
        },
      });
      return;
    }

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /lectures/:id/custdev/painpoints
 * Get custdev pain points only
 */
export async function getCustDevPainPoints(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const { id } = lectureIdParamSchema.parse(req.params);

    const data = await lectureService.getCustDevPainPoints(id, user.id);

    if (!data) {
      res.status(404).json({
        success: false,
        error: {
          code: 'PAINPOINTS_NOT_FOUND',
          message: 'Pain points not available for this lecture',
        },
      });
      return;
    }

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /lectures/:id/custdev/suggestions
 * Get custdev suggestions only
 */
export async function getCustDevSuggestions(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const { id } = lectureIdParamSchema.parse(req.params);

    const data = await lectureService.getCustDevSuggestions(id, user.id);

    if (!data) {
      res.status(404).json({
        success: false,
        error: {
          code: 'SUGGESTIONS_NOT_FOUND',
          message: 'Product suggestions not available for this lecture',
        },
      });
      return;
    }

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /lectures/:id/custdev/actions
 * Get custdev action items only
 */
export async function getCustDevActions(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const { id } = lectureIdParamSchema.parse(req.params);

    const data = await lectureService.getCustDevActions(id, user.id);

    if (!data) {
      res.status(404).json({
        success: false,
        error: {
          code: 'ACTIONS_NOT_FOUND',
          message: 'Action items not available for this lecture',
        },
      });
      return;
    }

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /lectures (optimized)
 * List lectures with optional minimal fields and processing filter
 */
export async function listOptimized(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const query = listLecturesOptimizedQuerySchema.parse(req.query);

    const result = await lectureService.listLecturesOptimized(
      user.id,
      {
        page: query.page ?? PAGINATION.DEFAULT_PAGE,
        limit: query.limit ?? PAGINATION.DEFAULT_LIMIT,
      },
      {
        status: query.status as LectureStatus | 'processing' | undefined,
        search: query.search,
        fields: query.fields,
      }
    );

    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /users/stats
 * Get user statistics (total, completed, processing, failed)
 */
export async function getUserStats(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;

    const stats = await lectureService.getUserStats(user.id);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    next(error);
  }
}
