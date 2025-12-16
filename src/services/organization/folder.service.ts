import { eq, and, isNull, desc } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';
import { createLogger } from '../../utils/logger.js';
import { NotFoundError, ForbiddenError, ConflictError } from '../../utils/errors.js';

const logger = createLogger('folder-service');

// ============================================
// TYPES
// ============================================

export interface CreateFolderInput {
  name: string;
  color?: string;
  parentId?: string;
}

export interface UpdateFolderInput {
  name?: string;
  color?: string | null;
  parentId?: string | null;
}

export interface FolderResponse {
  id: string;
  name: string;
  color: string | null;
  parentId: string | null;
  lectureCount?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface FolderWithChildren extends FolderResponse {
  children: FolderResponse[];
}

// ============================================
// FOLDER OPERATIONS
// ============================================

/**
 * Create a new folder
 */
export async function createFolder(
  userId: string,
  input: CreateFolderInput
): Promise<FolderResponse> {
  // If parentId is provided, verify it exists and belongs to user
  if (input.parentId) {
    const parent = await db.query.folders.findFirst({
      where: and(
        eq(schema.folders.id, input.parentId),
        eq(schema.folders.userId, userId)
      ),
    });

    if (!parent) {
      throw new NotFoundError('Parent folder not found', 'PARENT_FOLDER_NOT_FOUND');
    }
  }

  try {
    const [folder] = await db
      .insert(schema.folders)
      .values({
        userId,
        name: input.name,
        color: input.color || null,
        parentId: input.parentId || null,
      })
      .returning();

    if (!folder) {
      throw new Error('Failed to create folder');
    }

    logger.info({ folderId: folder.id, userId }, 'Folder created');

    return {
      id: folder.id,
      name: folder.name,
      color: folder.color,
      parentId: folder.parentId,
      createdAt: folder.createdAt,
      updatedAt: folder.updatedAt,
    };
  } catch (error: unknown) {
    // Handle unique constraint violation
    if (error instanceof Error && error.message.includes('unique')) {
      throw new ConflictError('Folder with this name already exists', 'FOLDER_EXISTS');
    }
    throw error;
  }
}

/**
 * Get folder by ID
 */
export async function getFolderById(
  folderId: string,
  userId: string
): Promise<FolderResponse> {
  const folder = await db.query.folders.findFirst({
    where: eq(schema.folders.id, folderId),
  });

  if (!folder) {
    throw new NotFoundError('Folder not found', 'FOLDER_NOT_FOUND');
  }

  if (folder.userId !== userId) {
    throw new ForbiddenError('Access denied', 'ACCESS_DENIED');
  }

  return {
    id: folder.id,
    name: folder.name,
    color: folder.color,
    parentId: folder.parentId,
    createdAt: folder.createdAt,
    updatedAt: folder.updatedAt,
  };
}

/**
 * List all folders for a user (flat list)
 */
export async function listFolders(userId: string): Promise<FolderResponse[]> {
  const folders = await db.query.folders.findMany({
    where: eq(schema.folders.userId, userId),
    orderBy: [schema.folders.name],
  });

  return folders.map((folder) => ({
    id: folder.id,
    name: folder.name,
    color: folder.color,
    parentId: folder.parentId,
    createdAt: folder.createdAt,
    updatedAt: folder.updatedAt,
  }));
}

/**
 * List folders as a tree structure
 */
export async function listFoldersTree(userId: string): Promise<FolderWithChildren[]> {
  const folders = await db.query.folders.findMany({
    where: eq(schema.folders.userId, userId),
    orderBy: [schema.folders.name],
  });

  // Build tree structure
  const folderMap = new Map<string, FolderWithChildren>();
  const rootFolders: FolderWithChildren[] = [];

  // First pass: create all folder objects
  for (const folder of folders) {
    folderMap.set(folder.id, {
      id: folder.id,
      name: folder.name,
      color: folder.color,
      parentId: folder.parentId,
      createdAt: folder.createdAt,
      updatedAt: folder.updatedAt,
      children: [],
    });
  }

  // Second pass: build tree
  for (const folder of folders) {
    const folderWithChildren = folderMap.get(folder.id)!;
    if (folder.parentId) {
      const parent = folderMap.get(folder.parentId);
      if (parent) {
        parent.children.push(folderWithChildren);
      } else {
        // Parent not found, treat as root
        rootFolders.push(folderWithChildren);
      }
    } else {
      rootFolders.push(folderWithChildren);
    }
  }

  return rootFolders;
}

/**
 * Update a folder
 */
export async function updateFolder(
  folderId: string,
  userId: string,
  input: UpdateFolderInput
): Promise<FolderResponse> {
  // Check ownership
  const existing = await db.query.folders.findFirst({
    where: eq(schema.folders.id, folderId),
  });

  if (!existing) {
    throw new NotFoundError('Folder not found', 'FOLDER_NOT_FOUND');
  }

  if (existing.userId !== userId) {
    throw new ForbiddenError('Access denied', 'ACCESS_DENIED');
  }

  // If changing parentId, verify the new parent
  if (input.parentId !== undefined && input.parentId !== null) {
    // Prevent circular reference
    if (input.parentId === folderId) {
      throw new ConflictError('Folder cannot be its own parent', 'CIRCULAR_REFERENCE');
    }

    const parent = await db.query.folders.findFirst({
      where: and(
        eq(schema.folders.id, input.parentId),
        eq(schema.folders.userId, userId)
      ),
    });

    if (!parent) {
      throw new NotFoundError('Parent folder not found', 'PARENT_FOLDER_NOT_FOUND');
    }
  }

  try {
    const [updated] = await db
      .update(schema.folders)
      .set({
        ...(input.name !== undefined && { name: input.name }),
        ...(input.color !== undefined && { color: input.color }),
        ...(input.parentId !== undefined && { parentId: input.parentId }),
        updatedAt: new Date(),
      })
      .where(eq(schema.folders.id, folderId))
      .returning();

    if (!updated) {
      throw new Error('Failed to update folder');
    }

    logger.info({ folderId }, 'Folder updated');

    return {
      id: updated.id,
      name: updated.name,
      color: updated.color,
      parentId: updated.parentId,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('unique')) {
      throw new ConflictError('Folder with this name already exists', 'FOLDER_EXISTS');
    }
    throw error;
  }
}

/**
 * Delete a folder (lectures in this folder will have folderId set to null)
 */
export async function deleteFolder(folderId: string, userId: string): Promise<void> {
  // Check ownership
  const existing = await db.query.folders.findFirst({
    where: eq(schema.folders.id, folderId),
  });

  if (!existing) {
    throw new NotFoundError('Folder not found', 'FOLDER_NOT_FOUND');
  }

  if (existing.userId !== userId) {
    throw new ForbiddenError('Access denied', 'ACCESS_DENIED');
  }

  // Move child folders to parent (or root if no parent)
  await db
    .update(schema.folders)
    .set({
      parentId: existing.parentId,
      updatedAt: new Date(),
    })
    .where(eq(schema.folders.parentId, folderId));

  // Delete the folder (lectures will have folderId set to null via onDelete: 'set null')
  await db.delete(schema.folders).where(eq(schema.folders.id, folderId));

  logger.info({ folderId, userId }, 'Folder deleted');
}

/**
 * Get folder with lecture count
 */
export async function getFolderWithLectureCount(
  folderId: string,
  userId: string
): Promise<FolderResponse> {
  const folder = await getFolderById(folderId, userId);

  const lectures = await db.query.lectures.findMany({
    where: eq(schema.lectures.folderId, folderId),
    columns: { id: true },
  });

  return {
    ...folder,
    lectureCount: lectures.length,
  };
}
