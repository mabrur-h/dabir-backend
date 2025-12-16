import { VertexAI, GenerativeModel, Part } from '@google-cloud/vertexai';
import { config } from '../../config/index.js';
import { createLogger } from '../../utils/logger.js';
import { timeStringToMs } from '../../utils/time.js';
import * as gcsService from '../upload/gcs.service.js';
import { SUMMARIZATION_TYPE, type SummarizationType } from '../../config/constants.js';
import type { TranscriptionResult, SummaryResult, CustDevSummaryResult } from '../../types/index.js';

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

const SUMMARIZATION_PROMPT_LECTURE = `
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

const SUMMARIZATION_PROMPT_CUSTDEV = `
Siz yuqori darajadagi Biznes Tahlilchisi va Mahsulot Menejerisiz. Sizning vazifangiz Mijozlar bilan Suhbat (Customer Call) transkripsiyasini tahlil qilish va Mahsulotni Rivojlantirish (Customer Development) uchun qimmatli ma'lumotlarni ajratib olish, shuningdek MIND MAP yaratish.

KIRISH MATNI (TRANSKRIPSIYA):
{transcription}

ASOSIY TALABLAR:
1. **Fokus:** Suhbatdagi mijozning muammolari, ehtiyojlari, ijobiy fikrlari va yechimga bo'lgan munosabatini aniqlang.
2. **Til va Terminlar:** O'zbek tilida professional, tahliliy uslubda yozing. Rus/Ingliz tilidagi terminlarni to'g'ri kontekstda saqlang.
3. **Ob'ektivlik:** His-tuyg'ularni emas, faktlarni va mijoz aytgan aniq fikrlarni tahlil qiling.
4. **Mind Map:** Suhbatdan olingan ma'lumotlarni vizual tuzilmaga aylantiring - markaziy g'oya, asosiy tarmoqlar va bog'lanishlar bilan.

CHIQISH FORMATI (JSON):
{
  "callSummary": {
    "title": "Suhbatning qisqa sarlavhasi (Mijozning asosiy mavzusi)",
    "overview": "Suhbatning 2-3 jumlalik umumiy qisqacha mazmuni. Asosiy natija nima bo'ldi (yangi xususiyat so'raldimi, shikoyat qilindimi yoki ijobiy fikr bildirildimi)?",
    "customerMood": "Mijozning umumiy hissiy holati (Masalan: 'Umumiy qoniqish, ammo bitta funksiyadan norozilik')"
  },
  "keyPainPoints": [
    {
      "painPoint": "Aniqlangan asosiy muammo (Mijozning og'riq nuqtasi)",
      "impact": "Bu muammo mijozning ishiga qanday ta'sir qiladi?",
      "timestampMs": 120000
    }
  ],
  "positiveFeedback": [
    {
      "feature": "Mijoz maqtov bilan tilga olgan xususiyat/afzallik",
      "benefit": "Bu xususiyat mijozga qanday foyda keltirgan?",
      "timestampMs": 300000
    }
  ],
  "productSuggestions": [
    {
      "type": "Yangi xususiyat/O'zgartirish/Yaxshilanish",
      "priority": "High / Medium / Low",
      "description": "Mijoz nima taklif qildi yoki nima yetishmayotganini aniq ta'riflang.",
      "relatedPainPoint": "Yuqoridagi qaysi muammo bilan bog'liq?"
    }
  ],
  "internalActionItems": [
    {
      "owner": "Sales / Support / Product",
      "action": "Mijozning savoliga javob berish, tizimni tekshirish yoki unga qo'ng'iroq qilish kabi ichki harakatlar.",
      "timestampMs": 450000
    }
  ],
  "mindMap": {
    "centralNode": {
      "label": "Mijoz nomi yoki asosiy muammo (Masalan: 'Kichik biznes egasi - Hisobot muammosi')",
      "description": "Suhbatning bir jumlalik mohiyati"
    },
    "branches": {
      "customerProfile": {
        "label": "Mijoz Profili",
        "items": [
          { "key": "Rol", "value": "Mijozning lavozimi yoki roli" },
          { "key": "Kompaniya", "value": "Kompaniya turi yoki sohasi" },
          { "key": "Tajriba", "value": "Mahsulot bilan ishlash tajribasi" }
        ]
      },
      "needsAndGoals": {
        "label": "Ehtiyojlar va Maqsadlar",
        "items": [
          { "goal": "Mijozning asosiy maqsadi", "priority": "High" },
          { "goal": "Ikkinchi darajali maqsad", "priority": "Medium" }
        ]
      },
      "painPoints": {
        "label": "Og'riq Nuqtalari",
        "items": [
          { "pain": "Asosiy muammo", "severity": "Critical", "emotion": "Frustrated" },
          { "pain": "Ikkinchi muammo", "severity": "Major", "emotion": "Concerned" }
        ]
      },
      "journeyStage": {
        "label": "Mijoz Sayohati",
        "currentStage": "Consideration / Purchase / Retention",
        "touchpoints": ["Qanday tanishgan", "Qanday foydalanmoqda", "Keyingi qadamlar"]
      },
      "opportunities": {
        "label": "Imkoniyatlar",
        "items": [
          { "opportunity": "Taklif qilingan yechim", "effort": "Low", "impact": "High" }
        ]
      },
      "keyInsights": {
        "label": "Asosiy Insaytlar",
        "patterns": ["Takrorlanuvchi mavzular yoki so'zlar"],
        "quotes": [
          { "text": "Mijozning muhim so'zlari (verbatim)", "context": "Qaysi kontekstda aytildi" }
        ]
      },
      "actionItems": {
        "label": "Harakatlar",
        "items": [
          { "action": "Nima qilish kerak", "owner": "Product / Sales / Support", "priority": "High" }
        ]
      }
    },
    "connections": [
      { "from": "painPoints", "to": "opportunities", "reason": "Bu muammo uchun bu yechim taklif qilinadi" },
      { "from": "needsAndGoals", "to": "actionItems", "reason": "Bu maqsadga erishish uchun bu harakat kerak" }
    ]
  }
}

Faqat yaroqli JSON chiqaring, boshqa hech qanday izoh yoki tushuntirish yozmang.
`;

// ============================================
// TRANSCRIPTION
// ============================================

export async function transcribeAudio(
  audioGcsUri: string
): Promise<TranscriptionResult> {
  const genModel = getModel();

  logger.info({ audioGcsUri }, 'Starting transcription with smart segmentation');
  const startTime = Date.now();

  try {
    // Download audio from GCS and convert to base64 for inline sending
    // Vertex AI needs inline data or a File API upload, not direct GCS URIs
    const { path: gcsPath } = gcsService.parseGcsUri(audioGcsUri);
    logger.debug({ gcsPath }, 'Downloading audio for transcription');

    const audioBuffer = await gcsService.downloadBuffer(gcsPath);
    const audioBase64 = audioBuffer.toString('base64');

    logger.debug({ audioSizeBytes: audioBuffer.length }, 'Audio downloaded, sending to Gemini');

    // Create audio part with inline base64 data
    const audioPart: Part = {
      inlineData: {
        mimeType: 'audio/mpeg',
        data: audioBase64,
      },
    };

    const textPart: Part = {
      text: TRANSCRIPTION_PROMPT,
    };

    const result = await genModel.generateContent({
      contents: [
        {
          role: 'user',
          parts: [audioPart, textPart],
        },
      ],
      generationConfig: {
        temperature: 0.2, // Low temperature for factual accuracy
        maxOutputTokens: 65536, // Max allowed by Gemini
        responseMimeType: 'application/json', // Force JSON output mode (Best Practice)
      },
    });

    const response = result.response;
    const text = response.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      throw new Error('No response from Gemini');
    }

    // Parse JSON response with repair for truncated responses
    let parsed: TranscriptionResult;
    try {
      parsed = JSON.parse(text) as TranscriptionResult;
    } catch (parseError) {
      logger.warn({ parseError: parseError instanceof Error ? parseError.message : String(parseError) }, 'JSON parse failed, attempting repair');
      parsed = repairAndParseJSON(text) as TranscriptionResult;
    }

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
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    logger.error({
      errorMessage,
      errorStack,
      audioGcsUri
    }, 'Transcription failed');
    throw error;
  }
}

// ============================================
// SUMMARIZATION
// ============================================

/**
 * Summarize transcription for lecture type (default)
 */
export async function summarizeTranscription(
  transcription: string,
  summarizationType: SummarizationType = SUMMARIZATION_TYPE.LECTURE
): Promise<SummaryResult | CustDevSummaryResult> {
  const genModel = getModel();

  // Select prompt based on summarization type
  const promptTemplate = summarizationType === SUMMARIZATION_TYPE.CUSTDEV
    ? SUMMARIZATION_PROMPT_CUSTDEV
    : SUMMARIZATION_PROMPT_LECTURE;

  // Insert transcription into the template
  const prompt = promptTemplate.replace('{transcription}', transcription);

  logger.info(
    { transcriptionLength: transcription.length, summarizationType },
    'Starting summarization'
  );
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

    const parsed = JSON.parse(text);
    const processingTimeMs = Date.now() - startTime;

    if (summarizationType === SUMMARIZATION_TYPE.CUSTDEV) {
      const custDevResult = parsed as CustDevSummaryResult;
      logger.info(
        {
          painPointCount: custDevResult.keyPainPoints?.length || 0,
          suggestionCount: custDevResult.productSuggestions?.length || 0,
          processingTimeMs,
          summarizationType,
        },
        'CustDev summarization completed'
      );
      return custDevResult;
    }

    const lectureResult = parsed as SummaryResult;
    logger.info(
      {
        chapterCount: lectureResult.chapters?.length || 0,
        keyPointCount: lectureResult.keyPoints?.length || 0,
        processingTimeMs,
        summarizationType,
      },
      'Lecture summarization completed'
    );

    return lectureResult;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    logger.error({
      errorMessage,
      errorStack,
      summarizationType
    }, 'Summarization failed');
    throw error;
  }
}

// ============================================
// HELPERS
// ============================================

/**
 * Attempt to repair and parse truncated JSON responses
 * Common issue when Gemini output is cut off due to token limits
 */
function repairAndParseJSON(text: string): unknown {
  let repaired = text.trim();

  logger.debug({ textLength: repaired.length }, 'Attempting JSON repair');

  // First, try progressively more aggressive truncation strategies
  const truncationPoints = [
    // Find last complete segment object (ends with })
    () => {
      // Look for pattern like }\n    ],  or },\n    { which indicates end of object in array
      const patterns = [
        /\}\s*\]\s*,?\s*"[^"]+"\s*:\s*\[/g, // End of array, start of next property
        /\}\s*,\s*\{[^{}]*"text"\s*:/g, // End of segment, start of next segment
        /\}\s*\]/g, // End of array
      ];

      let bestMatch = -1;
      for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(repaired)) !== null) {
          // We want the position after the }
          const pos = match.index + 1;
          if (pos > bestMatch) {
            bestMatch = pos;
          }
        }
      }
      return bestMatch > 0 ? repaired.substring(0, bestMatch) : null;
    },
    // Find last complete key-value pair ending with ","
    () => {
      // Match: "key": "value", or "key": number, or "key": [...],
      const match = repaired.match(/^([\s\S]*"[^"]+"\s*:\s*(?:"[^"]*"|[\d.]+|\[[^\]]*\]|\{[^}]*\}))\s*,/);
      if (match) {
        // Find the last occurrence of such pattern
        let lastGoodPos = 0;
        const regex = /("[^"]+"\s*:\s*(?:"[^"]*"|[\d.]+|\[[^\]]*\]|\{[^}]*\}))\s*,/g;
        let m;
        while ((m = regex.exec(repaired)) !== null) {
          if (m[1]) {
            lastGoodPos = m.index + m[1].length;
          }
        }
        return lastGoodPos > 0 ? repaired.substring(0, lastGoodPos) : null;
      }
      return null;
    },
    // Aggressive: find last closing brace or bracket followed by comma
    () => {
      const lastBraceComma = Math.max(
        repaired.lastIndexOf('},'),
        repaired.lastIndexOf('],')
      );
      if (lastBraceComma > 0) {
        return repaired.substring(0, lastBraceComma + 1);
      }
      return null;
    },
    // Find last complete string value
    () => {
      const lastQuoteComma = repaired.lastIndexOf('",');
      if (lastQuoteComma > 0) {
        return repaired.substring(0, lastQuoteComma + 1);
      }
      return null;
    },
    // Find last closing brace or bracket (without comma)
    () => {
      const lastBrace = Math.max(
        repaired.lastIndexOf('}'),
        repaired.lastIndexOf(']')
      );
      if (lastBrace > 0) {
        return repaired.substring(0, lastBrace + 1);
      }
      return null;
    },
  ];

  // Try each truncation strategy
  for (let i = 0; i < truncationPoints.length; i++) {
    const strategy = truncationPoints[i];
    if (!strategy) continue;
    const truncated = strategy();
    if (truncated && truncated.length > 100) { // Ensure we have meaningful content
      const closed = closeJSON(truncated);
      try {
        const result = JSON.parse(closed);
        logger.info({ strategy: i, originalLength: text.length, repairedLength: closed.length }, 'JSON repair successful');
        return result;
      } catch {
        // Continue to next strategy
        logger.debug({ strategy: i }, 'JSON repair strategy failed, trying next');
      }
    }
  }

  // Final fallback: Try simple bracket closing on original
  const closed = closeJSON(repaired);
  try {
    const result = JSON.parse(closed);
    logger.info({ originalLength: text.length, repairedLength: closed.length }, 'JSON repair successful with simple closing');
    return result;
  } catch (finalError) {
    logger.error({
      originalLength: text.length,
      truncatedSample: text.substring(Math.max(0, text.length - 500)),
      finalError: finalError instanceof Error ? finalError.message : String(finalError)
    }, 'All JSON repair strategies failed');
    throw new Error('Unable to repair truncated JSON response from Gemini');
  }
}

/**
 * Close unclosed brackets in JSON string
 */
function closeJSON(text: string): string {
  let result = text;
  let openBraces = 0;
  let openBrackets = 0;
  let inString = false;
  let escapeNext = false;

  for (const char of result) {
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    if (char === '\\') {
      escapeNext = true;
      continue;
    }
    if (char === '"' && !escapeNext) {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === '{') openBraces++;
      if (char === '}') openBraces--;
      if (char === '[') openBrackets++;
      if (char === ']') openBrackets--;
    }
  }

  // If ended inside a string, close it
  if (inString) {
    result += '"';
  }

  // Remove trailing comma if present (common truncation artifact)
  result = result.replace(/,\s*$/, '');

  // Close any open arrays/objects
  while (openBrackets > 0) {
    result += ']';
    openBrackets--;
  }
  while (openBraces > 0) {
    result += '}';
    openBraces--;
  }

  return result;
}

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