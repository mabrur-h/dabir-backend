import type { Request } from 'express';

// Authenticated user payload (from JWT)
export interface AuthUser {
  id: string;
  email: string;
  telegramId?: number;
  authProvider?: 'email' | 'telegram';
}

// Extended Express Request with authenticated user
export interface AuthenticatedRequest extends Request {
  user: AuthUser;
}

// Pagination parameters
export interface PaginationParams {
  page: number;
  limit: number;
}

// Paginated response
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// API Response wrapper
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

// Job data types for BullMQ
export interface AudioExtractionJobData {
  lectureId: string;
  gcsUri: string;
  mimeType: string;
}

export interface TranscriptionJobData {
  lectureId: string;
  audioGcsUri: string;
  language: string;
}

export interface SummarizationJobData {
  lectureId: string;
  transcriptionId: string;
  language: string;
}

// Gemini response types
export interface TranscriptionSegment {
  startTime: string; // "MM:SS" format
  endTime: string;
  text: string;
  speaker?: string;
}

export interface TranscriptionResult {
  fullText: string;
  segments: TranscriptionSegment[];
  detectedLanguage: string;
  confidence: number;
}

export interface ChapterSummary {
  index: number;
  title: string;
  summary: string;
  startTimeMs: number;
  endTimeMs: number;
}

export interface KeyPoint {
  title: string;
  description: string;
  timestampMs: number;
  importance: number;
}

export interface SummaryResult {
  overview: string;
  chapters: ChapterSummary[];
  keyPoints: KeyPoint[];
}
