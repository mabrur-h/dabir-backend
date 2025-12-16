import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as folderService from '../../services/organization/folder.service.js';
import type { AuthenticatedRequest } from '../../types/index.js';

// ============================================
// VALIDATION SCHEMAS
// ============================================

export const createFolderSchema = z.object({
  name: z.string().min(1).max(255),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  parentId: z.string().uuid().optional(),
});

export const updateFolderSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional(),
  parentId: z.string().uuid().nullable().optional(),
});

export const folderIdParamSchema = z.object({
  id: z.string().uuid('Invalid folder ID'),
});

// ============================================
// CONTROLLERS
// ============================================

/**
 * POST /folders
 * Create a new folder
 */
export async function create(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const input = createFolderSchema.parse(req.body);

    const folder = await folderService.createFolder(user.id, input);

    res.status(201).json({
      success: true,
      data: { folder },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /folders
 * List all folders (flat list)
 */
export async function list(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;

    const folders = await folderService.listFolders(user.id);

    res.json({
      success: true,
      data: { folders },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /folders/tree
 * List folders as a tree structure
 */
export async function listTree(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;

    const folders = await folderService.listFoldersTree(user.id);

    res.json({
      success: true,
      data: { folders },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /folders/:id
 * Get folder by ID
 */
export async function getById(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const { id } = folderIdParamSchema.parse(req.params);

    const folder = await folderService.getFolderWithLectureCount(id, user.id);

    res.json({
      success: true,
      data: { folder },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /folders/:id
 * Update a folder
 */
export async function update(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const { id } = folderIdParamSchema.parse(req.params);
    const input = updateFolderSchema.parse(req.body);

    const folder = await folderService.updateFolder(id, user.id, input);

    res.json({
      success: true,
      data: { folder },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /folders/:id
 * Delete a folder
 */
export async function remove(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const { id } = folderIdParamSchema.parse(req.params);

    await folderService.deleteFolder(id, user.id);

    res.json({
      success: true,
      data: { message: 'Folder deleted successfully' },
    });
  } catch (error) {
    next(error);
  }
}
