// Lecture status enum
export const LECTURE_STATUS = {
  UPLOADED: 'uploaded',
  EXTRACTING: 'extracting',
  TRANSCRIBING: 'transcribing',
  SUMMARIZING: 'summarizing',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;

export type LectureStatus = (typeof LECTURE_STATUS)[keyof typeof LECTURE_STATUS];

// Job types
export const JOB_TYPE = {
  AUDIO_EXTRACTION: 'audio_extraction',
  TRANSCRIPTION: 'transcription',
  SUMMARIZATION: 'summarization',
} as const;

export type JobType = (typeof JOB_TYPE)[keyof typeof JOB_TYPE];

// Job status
export const JOB_STATUS = {
  PENDING: 'pending',
  ACTIVE: 'active',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;

export type JobStatus = (typeof JOB_STATUS)[keyof typeof JOB_STATUS];

// Queue names
export const QUEUE_NAMES = {
  AUDIO_EXTRACTION: 'audio-extraction',
  TRANSCRIPTION: 'transcription',
  SUMMARIZATION: 'summarization',
} as const;

// Supported languages
export const LANGUAGES = {
  UZBEK: 'uz',
  RUSSIAN: 'ru',
  ENGLISH: 'en',
} as const;

export type Language = (typeof LANGUAGES)[keyof typeof LANGUAGES];

// Default language
export const DEFAULT_LANGUAGE = LANGUAGES.UZBEK;

// Summarization types
export const SUMMARIZATION_TYPE = {
  LECTURE: 'lecture',
  CUSTDEV: 'custdev',
} as const;

export type SummarizationType = (typeof SUMMARIZATION_TYPE)[keyof typeof SUMMARIZATION_TYPE];

// Default summarization type
export const DEFAULT_SUMMARIZATION_TYPE = SUMMARIZATION_TYPE.LECTURE;

// Importance levels for key points
export const IMPORTANCE_LEVELS = {
  LOW: 1,
  MEDIUM_LOW: 2,
  MEDIUM: 3,
  MEDIUM_HIGH: 4,
  HIGH: 5,
} as const;

// Pagination defaults
export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
} as const;

// File upload
export const FILE_UPLOAD = {
  CHUNK_SIZE: 10 * 1024 * 1024, // 10MB chunks for tus
  MAX_FILE_SIZE: 5 * 1024 * 1024 * 1024, // 5GB
} as const;

// GCS paths
export const GCS_PATHS = {
  UPLOADS: 'uploads',
  AUDIO: 'audio',
  PROCESSED: 'processed',
} as const;
