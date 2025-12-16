# API Endpoints Documentation

Base URL: `/api/v1`

All endpoints require authentication via Bearer token in the `Authorization` header.

---

## Table of Contents

1. [Lectures - CRUD](#lectures---crud)
2. [Lectures - Status](#lectures---status)
3. [Lectures - Content](#lectures---content)
4. [Lectures - CustDev](#lectures---custdev)
5. [Lectures - Tags](#lectures---tags)
6. [Folders](#folders)
7. [Tags](#tags)
8. [Users](#users)

---

## Lectures - CRUD

### List Lectures

```
GET /lectures
```

List user's lectures with pagination, filtering, and optional minimal response.

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `page` | number | No | 1 | Page number (1-indexed) |
| `limit` | number | No | 20 | Items per page (max: 100) |
| `status` | string | No | - | Filter by status |
| `search` | string | No | - | Search in title/filename |
| `fields` | string | No | `full` | Response fields: `minimal` or `full` |

**Status Values:**
- `uploaded` - File uploaded, waiting for processing
- `extracting` - Audio extraction in progress
- `transcribing` - Transcription in progress
- `summarizing` - Summarization in progress
- `completed` - Processing complete
- `failed` - Processing failed
- `processing` - Meta-status (uploaded + extracting + transcribing + summarizing)

**Response (fields=full):**

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "title": "Lecture Title",
      "originalFilename": "lecture.mp4",
      "fileSizeBytes": 104857600,
      "mimeType": "video/mp4",
      "durationSeconds": 3600,
      "durationFormatted": "01:00:00",
      "status": "completed",
      "language": "uz",
      "summarizationType": "lecture",
      "errorMessage": null,
      "createdAt": "2025-01-15T10:00:00.000Z",
      "updatedAt": "2025-01-15T11:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5,
    "hasNext": true,
    "hasPrev": false
  }
}
```

**Response (fields=minimal):**

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "title": "Lecture Title",
      "originalFilename": "lecture.mp4",
      "status": "completed",
      "summarizationType": "lecture",
      "durationFormatted": "01:00:00",
      "fileSizeBytes": 104857600,
      "createdAt": "2025-01-15T10:00:00.000Z",
      "language": "uz"
    }
  ],
  "pagination": { ... }
}
```

---

### Get Lecture Details

```
GET /lectures/{id}
```

Get lecture with full details including transcription, summary, and key points.

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | uuid | Yes | Lecture ID |

**Response:**

```json
{
  "success": true,
  "data": {
    "lecture": {
      "id": "uuid",
      "title": "Lecture Title",
      "originalFilename": "lecture.mp4",
      "fileSizeBytes": 104857600,
      "mimeType": "video/mp4",
      "durationSeconds": 3600,
      "durationFormatted": "01:00:00",
      "status": "completed",
      "language": "uz",
      "summarizationType": "lecture",
      "errorMessage": null,
      "createdAt": "2025-01-15T10:00:00.000Z",
      "updatedAt": "2025-01-15T11:00:00.000Z",
      "transcription": {
        "id": "uuid",
        "fullText": "Full transcription text...",
        "wordCount": 5000,
        "segments": [
          {
            "index": 0,
            "startTimeMs": 0,
            "endTimeMs": 5000,
            "startTimeFormatted": "00:00",
            "endTimeFormatted": "00:05",
            "text": "Segment text...",
            "speaker": "Speaker 1"
          }
        ]
      },
      "summary": {
        "id": "uuid",
        "summarizationType": "lecture",
        "overview": "Overview of the lecture...",
        "chapters": [
          {
            "index": 1,
            "title": "Introduction",
            "summary": "Chapter summary...",
            "startTimeMs": 0,
            "endTimeMs": 600000,
            "startTimeFormatted": "00:00",
            "endTimeFormatted": "10:00"
          }
        ],
        "custdevData": null
      },
      "keyPoints": [
        {
          "id": "uuid",
          "index": 1,
          "title": "Key Point Title",
          "description": "Description...",
          "timestampMs": 120000,
          "timestampFormatted": "02:00",
          "importance": 5
        }
      ]
    }
  }
}
```

---

### Create Lecture

```
POST /lectures
```

Create a new lecture record (typically called after upload completes).

**Request Body:**

```json
{
  "title": "Lecture Title",
  "originalFilename": "lecture.mp4",
  "gcsUri": "gs://bucket/path/to/file.mp4",
  "fileSizeBytes": 104857600,
  "mimeType": "video/mp4",
  "language": "uz"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | No | Lecture title (max 500 chars) |
| `originalFilename` | string | Yes | Original filename |
| `gcsUri` | string | Yes | GCS URI of uploaded file |
| `fileSizeBytes` | number | Yes | File size in bytes |
| `mimeType` | string | Yes | MIME type |
| `language` | string | No | Language code: `uz`, `ru`, `en` |

**Response:**

```json
{
  "success": true,
  "data": {
    "lecture": { ... }
  }
}
```

---

### Update Lecture

```
PATCH /lectures/{id}
```

Update lecture title, language, or folder assignment.

**Request Body:**

```json
{
  "title": "New Title",
  "language": "ru",
  "folderId": "uuid"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | No | Lecture title (max 500 chars) |
| `language` | string | No | Language code: `uz`, `ru`, `en` |
| `folderId` | uuid \| null | No | Folder ID to move lecture to, or `null` to remove from folder |

**Response:**

```json
{
  "success": true,
  "data": {
    "lecture": {
      "id": "uuid",
      "title": "New Title",
      "originalFilename": "lecture.mp4",
      "fileSizeBytes": 104857600,
      "mimeType": "video/mp4",
      "durationSeconds": 3600,
      "durationFormatted": "01:00:00",
      "status": "completed",
      "language": "ru",
      "summarizationType": "lecture",
      "folderId": "uuid",
      "errorMessage": null,
      "createdAt": "2025-01-15T10:00:00.000Z",
      "updatedAt": "2025-01-15T12:00:00.000Z"
    }
  }
}
```

---

### Delete Lecture

```
DELETE /lectures/{id}
```

Delete lecture and all related data.

**Response:**

```json
{
  "success": true,
  "data": {
    "message": "Lecture deleted successfully"
  }
}
```

---

## Lectures - Status

### Get Status (Detailed)

```
GET /lectures/{id}/status
```

Get detailed processing status with job information.

**Response:**

```json
{
  "success": true,
  "data": {
    "lectureId": "uuid",
    "status": "transcribing",
    "progress": 45,
    "jobs": [
      {
        "type": "audio_extraction",
        "status": "completed",
        "progress": 100,
        "error": null
      },
      {
        "type": "transcription",
        "status": "active",
        "progress": 45,
        "error": null
      },
      {
        "type": "summarization",
        "status": "pending",
        "progress": 0,
        "error": null
      }
    ]
  }
}
```

---

### Get Status (Lightweight)

```
GET /lectures/{id}/status/light
```

Get lightweight status for efficient polling. **Recommended for polling.**

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "status": "transcribing",
    "progress": 45,
    "errorMessage": null
  }
}
```

**Response Size:** ~100 bytes (vs ~500 bytes for detailed status)

---

### Batch Status Check

```
POST /lectures/status
```

Check status of multiple lectures in a single request.

**Request Body:**

```json
{
  "ids": [
    "uuid-1",
    "uuid-2",
    "uuid-3"
  ]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `ids` | string[] | Yes | Array of lecture UUIDs (max 50) |

**Response:**

```json
{
  "success": true,
  "data": {
    "statuses": {
      "uuid-1": {
        "id": "uuid-1",
        "status": "completed",
        "progress": 100,
        "errorMessage": null
      },
      "uuid-2": {
        "id": "uuid-2",
        "status": "transcribing",
        "progress": 60,
        "errorMessage": null
      },
      "uuid-3": {
        "id": "uuid-3",
        "status": "failed",
        "progress": 0,
        "errorMessage": "Transcription failed: Invalid audio format"
      }
    }
  }
}
```

**Note:** Only returns statuses for lectures that belong to the authenticated user.

---

## Lectures - Content

### Get Transcript (Paginated)

```
GET /lectures/{id}/transcript
```

Get transcription with optional pagination for segments.

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `page` | number | No | - | Page number (enables pagination) |
| `limit` | number | No | 20 | Segments per page (max: 100) |

**Response (without pagination):**

```json
{
  "success": true,
  "data": {
    "transcription": {
      "fullText": "Full transcription text...",
      "wordCount": 5000,
      "segments": [
        {
          "index": 0,
          "startTimeMs": 0,
          "endTimeMs": 5000,
          "startTimeFormatted": "00:00",
          "endTimeFormatted": "00:05",
          "text": "Segment text...",
          "speaker": "Speaker 1"
        }
      ]
    }
  }
}
```

**Response (with pagination - `?page=1&limit=50`):**

```json
{
  "success": true,
  "data": {
    "transcription": {
      "fullText": "Full transcription text...",
      "wordCount": 5000,
      "segments": [ ... ],
      "pagination": {
        "page": 1,
        "limit": 50,
        "total": 200,
        "totalPages": 4,
        "hasNext": true,
        "hasPrev": false
      }
    }
  }
}
```

---

### Get Transcription (Legacy)

```
GET /lectures/{id}/transcription
```

Legacy endpoint - returns all segments without pagination.

**Response:**

```json
{
  "success": true,
  "data": {
    "transcription": {
      "id": "uuid",
      "fullText": "...",
      "wordCount": 5000,
      "segments": [ ... ]
    }
  }
}
```

---

### Get Summary Only

```
GET /lectures/{id}/summary-only
```

Get summary without key points (smaller payload).

**Response:**

```json
{
  "success": true,
  "data": {
    "summary": {
      "id": "uuid",
      "summarizationType": "lecture",
      "overview": "Overview of the lecture...",
      "chapters": [
        {
          "index": 1,
          "title": "Introduction",
          "summary": "Chapter summary...",
          "startTimeMs": 0,
          "endTimeMs": 600000,
          "startTimeFormatted": "00:00",
          "endTimeFormatted": "10:00"
        }
      ]
    }
  }
}
```

---

### Get Summary with Key Points

```
GET /lectures/{id}/summary
```

Get summary combined with key points.

**Response:**

```json
{
  "success": true,
  "data": {
    "summary": {
      "id": "uuid",
      "summarizationType": "lecture",
      "overview": "Overview...",
      "chapters": [ ... ],
      "custdevData": null
    },
    "keyPoints": [
      {
        "id": "uuid",
        "index": 1,
        "title": "Key Point Title",
        "description": "Description...",
        "timestampMs": 120000,
        "timestampFormatted": "02:00",
        "importance": 5
      }
    ]
  }
}
```

---

### Get Key Points Only

```
GET /lectures/{id}/keypoints
```

Get key points array only.

**Response:**

```json
{
  "success": true,
  "data": {
    "keyPoints": [
      {
        "id": "uuid",
        "index": 1,
        "title": "Key Point Title",
        "description": "Description of the key point...",
        "timestampMs": 120000,
        "timestampFormatted": "02:00",
        "importance": 5
      },
      {
        "id": "uuid",
        "index": 2,
        "title": "Another Key Point",
        "description": "Another description...",
        "timestampMs": 300000,
        "timestampFormatted": "05:00",
        "importance": 4
      }
    ]
  }
}
```

---

## Lectures - CustDev

These endpoints are only available for lectures with `summarizationType: "custdev"`.

### Get Full CustDev Data

```
GET /lectures/{id}/custdev
```

Get all CustDev analysis data.

**Response:**

```json
{
  "success": true,
  "data": {
    "callSummary": {
      "title": "Customer Interview - Acme Corp",
      "overview": "Discussion about product pain points...",
      "customerMood": "Frustrated but hopeful"
    },
    "keyPainPoints": [
      {
        "painPoint": "Slow onboarding process",
        "impact": "Delays customer activation by 2 weeks",
        "timestampMs": 180000
      }
    ],
    "positiveFeedback": [
      {
        "feature": "Dashboard analytics",
        "benefit": "Provides clear visibility into metrics",
        "timestampMs": 420000
      }
    ],
    "productSuggestions": [
      {
        "type": "Feature Request",
        "priority": "High",
        "description": "Add bulk import functionality",
        "relatedPainPoint": "Manual data entry is time-consuming"
      }
    ],
    "internalActionItems": [
      {
        "owner": "Product",
        "action": "Evaluate bulk import feasibility",
        "timestampMs": 540000
      }
    ],
    "mindMap": {
      "centralNode": {
        "label": "Customer Interview",
        "description": "Acme Corp - Product Feedback"
      },
      "branches": {
        "customerProfile": {
          "label": "Customer Profile",
          "items": [
            { "key": "Company", "value": "Acme Corp" },
            { "key": "Role", "value": "Product Manager" }
          ]
        },
        "needsAndGoals": {
          "label": "Needs & Goals",
          "items": [
            { "goal": "Reduce onboarding time", "priority": "High" }
          ]
        },
        "painPoints": {
          "label": "Pain Points",
          "items": [
            { "pain": "Slow onboarding", "severity": "Critical", "emotion": "Frustrated" }
          ]
        },
        "journeyStage": {
          "label": "Journey Stage",
          "currentStage": "Evaluation",
          "touchpoints": ["Sales call", "Demo", "Trial"]
        },
        "opportunities": {
          "label": "Opportunities",
          "items": [
            { "opportunity": "Streamlined onboarding", "effort": "Medium", "impact": "High" }
          ]
        },
        "keyInsights": {
          "label": "Key Insights",
          "patterns": ["Users struggle with initial setup"],
          "quotes": [
            { "text": "The setup took way longer than expected", "context": "Onboarding discussion" }
          ]
        },
        "actionItems": {
          "label": "Action Items",
          "items": [
            { "action": "Review onboarding flow", "owner": "Product", "priority": "High" }
          ]
        }
      },
      "connections": [
        { "from": "painPoints", "to": "opportunities", "reason": "Pain points drive opportunities" }
      ]
    }
  }
}
```

---

### Get CustDev Mind Map

```
GET /lectures/{id}/custdev/mindmap
```

Get only the mind map visualization data.

**Response:**

```json
{
  "success": true,
  "data": {
    "mindMap": {
      "centralNode": { ... },
      "branches": { ... },
      "connections": [ ... ]
    }
  }
}
```

---

### Get CustDev Pain Points

```
GET /lectures/{id}/custdev/painpoints
```

Get only the pain points array.

**Response:**

```json
{
  "success": true,
  "data": {
    "keyPainPoints": [
      {
        "painPoint": "Slow onboarding process",
        "impact": "Delays customer activation by 2 weeks",
        "timestampMs": 180000
      },
      {
        "painPoint": "Complex pricing structure",
        "impact": "Confusion during sales process",
        "timestampMs": 360000
      }
    ]
  }
}
```

---

### Get CustDev Suggestions

```
GET /lectures/{id}/custdev/suggestions
```

Get only the product suggestions array.

**Response:**

```json
{
  "success": true,
  "data": {
    "productSuggestions": [
      {
        "type": "Feature Request",
        "priority": "High",
        "description": "Add bulk import functionality",
        "relatedPainPoint": "Manual data entry is time-consuming"
      },
      {
        "type": "UX Improvement",
        "priority": "Medium",
        "description": "Simplify navigation menu",
        "relatedPainPoint": "Users get lost in the interface"
      }
    ]
  }
}
```

---

### Get CustDev Action Items

```
GET /lectures/{id}/custdev/actions
```

Get only the internal action items array.

**Response:**

```json
{
  "success": true,
  "data": {
    "internalActionItems": [
      {
        "owner": "Product",
        "action": "Evaluate bulk import feasibility",
        "timestampMs": 540000
      },
      {
        "owner": "Sales",
        "action": "Update pricing documentation",
        "timestampMs": 720000
      },
      {
        "owner": "Support",
        "action": "Create onboarding checklist",
        "timestampMs": 900000
      }
    ]
  }
}
```

---

## Lectures - Tags

Manage tags associated with individual lectures.

### Get Lecture Tags

```
GET /lectures/{lectureId}/tags
```

Get all tags assigned to a lecture.

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `lectureId` | uuid | Yes | Lecture ID |

**Response:**

```json
{
  "success": true,
  "data": {
    "tags": [
      {
        "id": "uuid",
        "name": "Important",
        "color": "#FF5733",
        "createdAt": "2025-01-10T08:00:00.000Z"
      },
      {
        "id": "uuid",
        "name": "Review Later",
        "color": "#3498DB",
        "createdAt": "2025-01-12T10:00:00.000Z"
      }
    ]
  }
}
```

---

### Set Lecture Tags

```
PUT /lectures/{lectureId}/tags
```

Replace all tags on a lecture with the specified tags.

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `lectureId` | uuid | Yes | Lecture ID |

**Request Body:**

```json
{
  "tagIds": ["uuid-1", "uuid-2", "uuid-3"]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `tagIds` | string[] | Yes | Array of tag UUIDs to assign (can be empty to remove all) |

**Response:**

```json
{
  "success": true,
  "data": {
    "tags": [
      {
        "id": "uuid-1",
        "name": "Important",
        "color": "#FF5733",
        "createdAt": "2025-01-10T08:00:00.000Z"
      },
      {
        "id": "uuid-2",
        "name": "Review Later",
        "color": "#3498DB",
        "createdAt": "2025-01-12T10:00:00.000Z"
      }
    ]
  }
}
```

---

### Add Tag to Lecture

```
POST /lectures/{lectureId}/tags/{tagId}
```

Add a single tag to a lecture.

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `lectureId` | uuid | Yes | Lecture ID |
| `tagId` | uuid | Yes | Tag ID to add |

**Response:**

```json
{
  "success": true,
  "data": {
    "message": "Tag added to lecture"
  }
}
```

**Note:** If the tag is already assigned to the lecture, the operation succeeds silently.

---

### Remove Tag from Lecture

```
DELETE /lectures/{lectureId}/tags/{tagId}
```

Remove a single tag from a lecture.

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `lectureId` | uuid | Yes | Lecture ID |
| `tagId` | uuid | Yes | Tag ID to remove |

**Response:**

```json
{
  "success": true,
  "data": {
    "message": "Tag removed from lecture"
  }
}
```

---

## Folders

Organize lectures into hierarchical folders. Folders support nesting (parent/child relationships).

### Create Folder

```
POST /folders
```

Create a new folder.

**Request Body:**

```json
{
  "name": "Semester 1",
  "color": "#9B59B6",
  "parentId": "uuid"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Folder name (1-255 chars) |
| `color` | string | No | Hex color code (e.g., `#FF5733`) |
| `parentId` | uuid | No | Parent folder ID for nesting |

**Response:**

```json
{
  "success": true,
  "data": {
    "folder": {
      "id": "uuid",
      "name": "Semester 1",
      "color": "#9B59B6",
      "parentId": null,
      "createdAt": "2025-01-15T10:00:00.000Z",
      "updatedAt": "2025-01-15T10:00:00.000Z"
    }
  }
}
```

---

### List Folders

```
GET /folders
```

Get all folders as a flat list.

**Response:**

```json
{
  "success": true,
  "data": {
    "folders": [
      {
        "id": "uuid-1",
        "name": "Semester 1",
        "color": "#9B59B6",
        "parentId": null,
        "createdAt": "2025-01-15T10:00:00.000Z",
        "updatedAt": "2025-01-15T10:00:00.000Z"
      },
      {
        "id": "uuid-2",
        "name": "Mathematics",
        "color": "#3498DB",
        "parentId": "uuid-1",
        "createdAt": "2025-01-15T11:00:00.000Z",
        "updatedAt": "2025-01-15T11:00:00.000Z"
      }
    ]
  }
}
```

---

### List Folders (Tree)

```
GET /folders/tree
```

Get folders as a nested tree structure.

**Response:**

```json
{
  "success": true,
  "data": {
    "folders": [
      {
        "id": "uuid-1",
        "name": "Semester 1",
        "color": "#9B59B6",
        "parentId": null,
        "createdAt": "2025-01-15T10:00:00.000Z",
        "updatedAt": "2025-01-15T10:00:00.000Z",
        "children": [
          {
            "id": "uuid-2",
            "name": "Mathematics",
            "color": "#3498DB",
            "parentId": "uuid-1",
            "createdAt": "2025-01-15T11:00:00.000Z",
            "updatedAt": "2025-01-15T11:00:00.000Z",
            "children": []
          },
          {
            "id": "uuid-3",
            "name": "Physics",
            "color": "#E74C3C",
            "parentId": "uuid-1",
            "createdAt": "2025-01-15T11:30:00.000Z",
            "updatedAt": "2025-01-15T11:30:00.000Z",
            "children": []
          }
        ]
      }
    ]
  }
}
```

---

### Get Folder

```
GET /folders/{id}
```

Get a folder by ID with lecture count.

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | uuid | Yes | Folder ID |

**Response:**

```json
{
  "success": true,
  "data": {
    "folder": {
      "id": "uuid",
      "name": "Semester 1",
      "color": "#9B59B6",
      "parentId": null,
      "lectureCount": 12,
      "createdAt": "2025-01-15T10:00:00.000Z",
      "updatedAt": "2025-01-15T10:00:00.000Z"
    }
  }
}
```

---

### Update Folder

```
PATCH /folders/{id}
```

Update folder name, color, or parent.

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | uuid | Yes | Folder ID |

**Request Body:**

```json
{
  "name": "Semester 1 - Fall 2025",
  "color": "#2ECC71",
  "parentId": null
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | No | New folder name (1-255 chars) |
| `color` | string \| null | No | Hex color code, or `null` to remove |
| `parentId` | uuid \| null | No | New parent folder ID, or `null` for root |

**Response:**

```json
{
  "success": true,
  "data": {
    "folder": {
      "id": "uuid",
      "name": "Semester 1 - Fall 2025",
      "color": "#2ECC71",
      "parentId": null,
      "createdAt": "2025-01-15T10:00:00.000Z",
      "updatedAt": "2025-01-15T12:00:00.000Z"
    }
  }
}
```

**Note:** A folder cannot be its own parent (returns `CIRCULAR_REFERENCE` error).

---

### Delete Folder

```
DELETE /folders/{id}
```

Delete a folder. Child folders are moved to the deleted folder's parent (or root). Lectures in the folder have their `folderId` set to `null`.

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | uuid | Yes | Folder ID |

**Response:**

```json
{
  "success": true,
  "data": {
    "message": "Folder deleted successfully"
  }
}
```

---

## Tags

Manage user tags for organizing lectures. Tags can be assigned to multiple lectures.

### Create Tag

```
POST /tags
```

Create a new tag.

**Request Body:**

```json
{
  "name": "Important",
  "color": "#FF5733"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Tag name (1-100 chars, unique per user) |
| `color` | string | No | Hex color code (e.g., `#FF5733`) |

**Response:**

```json
{
  "success": true,
  "data": {
    "tag": {
      "id": "uuid",
      "name": "Important",
      "color": "#FF5733",
      "createdAt": "2025-01-15T10:00:00.000Z"
    }
  }
}
```

---

### List Tags

```
GET /tags
```

Get all tags for the user.

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `counts` | boolean | No | false | Include lecture counts per tag |

**Response (without counts):**

```json
{
  "success": true,
  "data": {
    "tags": [
      {
        "id": "uuid-1",
        "name": "Important",
        "color": "#FF5733",
        "createdAt": "2025-01-15T10:00:00.000Z"
      },
      {
        "id": "uuid-2",
        "name": "Review Later",
        "color": "#3498DB",
        "createdAt": "2025-01-15T11:00:00.000Z"
      }
    ]
  }
}
```

**Response (with `?counts=true`):**

```json
{
  "success": true,
  "data": {
    "tags": [
      {
        "id": "uuid-1",
        "name": "Important",
        "color": "#FF5733",
        "lectureCount": 8,
        "createdAt": "2025-01-15T10:00:00.000Z"
      },
      {
        "id": "uuid-2",
        "name": "Review Later",
        "color": "#3498DB",
        "lectureCount": 3,
        "createdAt": "2025-01-15T11:00:00.000Z"
      }
    ]
  }
}
```

---

### Get Tag

```
GET /tags/{id}
```

Get a tag by ID.

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | uuid | Yes | Tag ID |

**Response:**

```json
{
  "success": true,
  "data": {
    "tag": {
      "id": "uuid",
      "name": "Important",
      "color": "#FF5733",
      "createdAt": "2025-01-15T10:00:00.000Z"
    }
  }
}
```

---

### Update Tag

```
PATCH /tags/{id}
```

Update tag name or color.

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | uuid | Yes | Tag ID |

**Request Body:**

```json
{
  "name": "Very Important",
  "color": "#E74C3C"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | No | New tag name (1-100 chars) |
| `color` | string \| null | No | Hex color code, or `null` to remove |

**Response:**

```json
{
  "success": true,
  "data": {
    "tag": {
      "id": "uuid",
      "name": "Very Important",
      "color": "#E74C3C",
      "createdAt": "2025-01-15T10:00:00.000Z"
    }
  }
}
```

---

### Delete Tag

```
DELETE /tags/{id}
```

Delete a tag. The tag is automatically removed from all lectures.

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | uuid | Yes | Tag ID |

**Response:**

```json
{
  "success": true,
  "data": {
    "message": "Tag deleted successfully"
  }
}
```

---

## Users

### Get User Statistics

```
GET /users/stats
```

Get statistics about the authenticated user's lectures.

**Response:**

```json
{
  "success": true,
  "data": {
    "total": 25,
    "completed": 20,
    "processing": 3,
    "failed": 2
  }
}
```

| Field | Description |
|-------|-------------|
| `total` | Total number of lectures |
| `completed` | Lectures with status `completed` |
| `processing` | Lectures with status `uploaded`, `extracting`, `transcribing`, or `summarizing` |
| `failed` | Lectures with status `failed` |

---

## Error Responses

All endpoints return errors in a consistent format:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": { }
  }
}
```

### Common Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `LECTURE_NOT_FOUND` | 404 | Lecture does not exist |
| `ACCESS_DENIED` | 403 | User doesn't own the resource |
| `TRANSCRIPTION_NOT_FOUND` | 404 | Transcription not available |
| `SUMMARY_NOT_FOUND` | 404 | Summary not available |
| `KEYPOINTS_NOT_FOUND` | 404 | Key points not available |
| `CUSTDEV_NOT_FOUND` | 404 | CustDev data not available (wrong summarization type) |
| `MINDMAP_NOT_FOUND` | 404 | Mind map not available |
| `PAINPOINTS_NOT_FOUND` | 404 | Pain points not available |
| `SUGGESTIONS_NOT_FOUND` | 404 | Product suggestions not available |
| `ACTIONS_NOT_FOUND` | 404 | Action items not available |
| `FOLDER_NOT_FOUND` | 404 | Folder does not exist |
| `PARENT_FOLDER_NOT_FOUND` | 404 | Parent folder does not exist |
| `FOLDER_EXISTS` | 409 | Folder with this name already exists |
| `CIRCULAR_REFERENCE` | 409 | Folder cannot be its own parent |
| `TAG_NOT_FOUND` | 404 | Tag does not exist |
| `TAG_EXISTS` | 409 | Tag with this name already exists |
| `VALIDATION_ERROR` | 400 | Request validation failed |
| `UNAUTHORIZED` | 401 | Missing or invalid authentication |

---

## Optimization Summary

| Endpoint | Purpose | Payload Size |
|----------|---------|--------------|
| `GET /lectures?fields=minimal` | List with minimal data | ~200 bytes/item |
| `GET /lectures?fields=full` | List with full data | ~500 bytes/item |
| `GET /lectures/{id}/status/light` | Lightweight polling | ~100 bytes |
| `GET /lectures/{id}/status` | Detailed status | ~500 bytes |
| `POST /lectures/status` | Batch status check | ~100 bytes/item |
| `GET /lectures/{id}/transcript?page=1` | Paginated transcript | ~5KB/page |
| `GET /lectures/{id}/summary-only` | Summary without keypoints | ~2-5KB |
| `GET /lectures/{id}/keypoints` | Keypoints only | ~1-3KB |
| `GET /lectures/{id}/custdev/*` | Individual CustDev sections | ~1-10KB each |

**Recommended Usage:**

1. **Initial page load:** Use `GET /lectures?fields=minimal` for list
2. **Polling:** Use `GET /lectures/{id}/status/light` or `POST /lectures/status` for batch
3. **Tab switching:** Load content lazily with specific endpoints (`/transcript`, `/summary-only`, etc.)
4. **CustDev tabs:** Load each section only when user navigates to it
