import { VertexAI, GenerativeModel, Part } from '@google-cloud/vertexai';
import { config } from '../../config/index.js';
import { createLogger } from '../../utils/logger.js';
import { timeStringToMs } from '../../utils/time.js';
import type { TranscriptionResult, SummaryResult } from '../../types/index.js';

const logger = createLogger('gemini-service');

// ============================================
// INITIALIZATION
// ============================================

let vertexAI: VertexAI;
let model: GenerativeModel;

function initializeGemini(): void {
  vertexAI = new VertexAI({
    project: config.gcp.projectId,
    location: config.gcp.region,
  });

  model = vertexAI.getGenerativeModel({
    model: config.gemini.model,
    // Safety settings can be added here if needed
  });

  logger.info({ model: config.gemini.model }, 'Gemini initialized');
}

function getModel(): GenerativeModel {
  if (!model) {
    initializeGemini();
  }
  return model;
}

// ============================================
// PROMPTS (OPTIMIZED FOR NOTE TAKING)
// ============================================

/**
 * Best practice: Define the JSON schema inside the prompt for strict adherence,
 * combined with `responseMimeType: 'application/json'` in the config.
 */

const TRANSCRIPTION_PROMPT = `
Siz professional AI kotibi va lingvistisiz. Vazifangiz: Audio faylni matnga aylantirish (Transkripsiya).

ASOSIY TILAR VA TERMINOLOGIYA:
1. **Asosiy til:** O'zbek tili.
2. **Aralash terminlar:** Suhbat davomida Rus va Ingliz tilidagi terminlar (IT, Biznes, Kundalik so'zlar) ishlatilishi mumkin. Ularni tarjima qilmang, eshitilganidek lekin to'g'ri orfografiya bilan yozing (Masalan: "Software", "Deadline", "Pechat", "Smeta").
3. **Uslub:** So'zma-so'z emas, "Clean Verbatim" (Toza matn). "Eee", "Xmm", "Aaa" kabi parazit so'zlarni olib tashlang, lekin mazmunni saqlang.

SEGMENTATSIYA QOIDALARI (MUHIM):
1. **Sun'iy vaqt chegaralari yo'q:** Har 30 soniyada bo'lish SHART EMAS.
2. **Mantiqiy bo'linish:** Matnni faqat quyidagi hollarda yangi segmentga o'tkazing:
   - Gap tugab, yangi mustaqil fikr boshlanganda.
   - Ma'ruzachi o'zgarganda.
   - Mavzu o'zgarganda yoki uzoq pauza bo'lganda.
3. Segmentlar uzunligi tabiiy nutq oqimiga mos bo'lsin (bir gapdan tortib bir paragrafgacha bo'lishi mumkin).

CHIQISH FORMATI (JSON):
{
  "fullText": "Tuzatilgan, o'qishga qulay, yaxlit matn.",
  "segments": [
    {
      "startTime": "MM:SS",
      "endTime": "MM:SS",
      "text": "Segment matni...",
      "speaker": "Speaker 1" 
    }
  ],
  "detectedLanguage": "uz",
  "confidence": 0.95
}
`;

const SUMMARIZATION_PROMPT = `
Siz ta'lim va biznes materiallarini tahlil qiluvchi ekspertsiz. Quyidagi transkripsiyadan "Smart Note" (Aqlli qaydlar) tayyorlang.

KIRISH MATNI (TRANSKRIPSIYA):
{transcription}

TALABLAR:
1. **Tahlil tili:** O'zbek tili (kirill yoki lotin alifbosi transkripsiyaga qarab, lekin lotin afzal).
2. **Struktura:**
   - **Qisqacha mazmun (TL;DR):** Butun suhbatning 2-3 gaplik "qaymog'i".
   - **Mavzular bo'yicha bo'limlar:** Xronologik tartibda emas, balki MANTIQIY mavzular bo'yicha guruhlang.
   - **Asosiy insaytlar:** Shunchaki faktlar emas, balki qimmatli xulosa va fikrlar.
   - **Terminlar:** Rus/Ingliz terminlarini o'zgartirmay kontekstda to'g'ri ishlating.

CHIQISH FORMATI (JSON):
{
  "overview": "Suhbatning qisqacha, lo'nda mazmuni (Executive Summary)",
  "chapters": [
    {
      "index": 1,
      "title": "Mavzu sarlavhasi (Qiziqarli va aniq bo'lsin)",
      "summary": "Ushbu qismda nimalar haqida gap ketgani haqida batafsilroq ma'lumot.",
      "startTimeMs": 0,
      "endTimeMs": 150000
    }
  ],
  "keyPoints": [
    {
      "title": "Muhim fikr yoki Topshiriq",
      "description": "Nima uchun bu muhim yoki nima qilish kerak?",
      "timestampMs": 45000,
      "importance": 5
    }
  ]
}
`;

// ============================================
// TRANSCRIPTION
// ============================================

export async function transcribeAudio(
  audioGcsUri: string
): Promise<TranscriptionResult> {
  const genModel = getModel();

  // Create audio part from GCS URI
  const audioPart: Part = {
    fileData: {
      mimeType: 'audio/mpeg', // Ensure this matches your actual file type, or use audio/mp3 / audio/wav
      fileUri: audioGcsUri,
    },
  };

  const textPart: Part = {
    text: TRANSCRIPTION_PROMPT,
  };

  logger.info({ audioGcsUri }, 'Starting transcription with smart segmentation');
  const startTime = Date.now();

  try {
    const result = await genModel.generateContent({
      contents: [
        {
          role: 'user',
          parts: [audioPart, textPart], // Audio first helps Gemini process context better sometimes
        },
      ],
      generationConfig: {
        temperature: 0.2, // Low temperature for factual accuracy
        maxOutputTokens: 8192,
        responseMimeType: 'application/json', // Force JSON output mode (Best Practice)
      },
    });

    const response = result.response;
    const text = response.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      throw new Error('No response from Gemini');
    }

    // Parse JSON response (Simplify parser since we enforce JSON mode)
    const parsed = JSON.parse(text) as TranscriptionResult;

    // Convert time strings to milliseconds and ensure structure
    const segments = parsed.segments.map((seg, index) => ({
      ...seg,
      startTimeMs: timeStringToMs(seg.startTime),
      endTimeMs: timeStringToMs(seg.endTime),
      index,
    }));

    const processingTimeMs = Date.now() - startTime;

    logger.info(
      {
        audioGcsUri,
        segmentCount: segments.length,
        processingTimeMs,
      },
      'Transcription completed'
    );

    return {
      fullText: parsed.fullText,
      segments: segments,
      detectedLanguage: 'uz', // Defaulting to uz as requested, or use parsed.detectedLanguage
      confidence: parsed.confidence || 0.9,
    };
  } catch (error) {
    logger.error({ error, audioGcsUri }, 'Transcription failed');
    throw error;
  }
}

// ============================================
// SUMMARIZATION
// ============================================

export async function summarizeTranscription(
  transcription: string
): Promise<SummaryResult> {
  const genModel = getModel();

  // Insert transcription into the template
  const prompt = SUMMARIZATION_PROMPT.replace('{transcription}', transcription);

  logger.info({ transcriptionLength: transcription.length }, 'Starting summarization');
  const startTime = Date.now();

  try {
    const result = await genModel.generateContent({
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.4, // Slightly higher for better synthesis and natural language flow
        maxOutputTokens: 8192,
        responseMimeType: 'application/json', // Force JSON output mode
      },
    });

    const response = result.response;
    const text = response.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      throw new Error('No response from Gemini');
    }

    const parsed = JSON.parse(text) as SummaryResult;
    const processingTimeMs = Date.now() - startTime;

    logger.info(
      {
        chapterCount: parsed.chapters?.length || 0,
        keyPointCount: parsed.keyPoints?.length || 0,
        processingTimeMs,
      },
      'Summarization completed'
    );

    return parsed;
  } catch (error) {
    logger.error({ error }, 'Summarization failed');
    throw error;
  }
}

// ============================================
// HELPERS
// ============================================

/**
 * Check if Gemini is available
 */
export async function checkGeminiHealth(): Promise<boolean> {
  try {
    const genModel = getModel();
    const result = await genModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: 'Ping' }] }],
      generationConfig: { maxOutputTokens: 5 },
    });

    return !!result.response.candidates?.[0]?.content;
  } catch (error) {
    logger.error({ error }, 'Gemini health check failed');
    return false;
  }
}