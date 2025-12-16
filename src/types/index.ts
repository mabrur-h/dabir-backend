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
  summarizationType: 'lecture' | 'custdev';
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

// CustDev Summarization Types
export interface CustDevCallSummary {
  title: string;
  overview: string;
  customerMood: string;
}

export interface CustDevPainPoint {
  painPoint: string;
  impact: string;
  timestampMs: number;
}

export interface CustDevPositiveFeedback {
  feature: string;
  benefit: string;
  timestampMs: number;
}

export interface CustDevProductSuggestion {
  type: string;
  priority: 'High' | 'Medium' | 'Low';
  description: string;
  relatedPainPoint: string;
}

export interface CustDevActionItem {
  owner: 'Sales' | 'Support' | 'Product' | string;
  action: string;
  timestampMs: number;
}

export interface CustDevSummaryResult {
  callSummary: CustDevCallSummary;
  keyPainPoints: CustDevPainPoint[];
  positiveFeedback: CustDevPositiveFeedback[];
  productSuggestions: CustDevProductSuggestion[];
  internalActionItems: CustDevActionItem[];
  mindMap: CustDevMindMap;
}

// CustDev Mind Map Types
export interface MindMapNode {
  id: string;
  label: string;
  type: 'central' | 'main' | 'sub' | 'detail' | 'action';
  color?: string;
  icon?: string;
  children?: MindMapNode[];
}

export interface MindMapConnection {
  from: string;
  to: string;
  label?: string;
  style?: 'solid' | 'dashed';
}

export interface CustDevMindMap {
  centralNode: {
    label: string;
    description: string;
  };
  branches: {
    customerProfile: {
      label: string;
      items: Array<{ key: string; value: string }>;
    };
    needsAndGoals: {
      label: string;
      items: Array<{ goal: string; priority: 'High' | 'Medium' | 'Low' }>;
    };
    painPoints: {
      label: string;
      items: Array<{ pain: string; severity: 'Critical' | 'Major' | 'Minor'; emotion: string }>;
    };
    journeyStage: {
      label: string;
      currentStage: string;
      touchpoints: string[];
    };
    opportunities: {
      label: string;
      items: Array<{ opportunity: string; effort: 'High' | 'Medium' | 'Low'; impact: 'High' | 'Medium' | 'Low' }>;
    };
    keyInsights: {
      label: string;
      patterns: string[];
      quotes: Array<{ text: string; context: string }>;
    };
    actionItems: {
      label: string;
      items: Array<{ action: string; owner: string; priority: 'High' | 'Medium' | 'Low' }>;
    };
  };
  connections: Array<{ from: string; to: string; reason: string }>;
}
