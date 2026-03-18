/**
 * AI Service – Handles all AI API calls for content generation and evaluation.
 * Uses OpenAI for text generation and ElevenLabs for TTS.
 */

const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;
const ELEVENLABS_API_KEY = import.meta.env.VITE_ELEVENLABS_API_KEY;

// ========================================
// OpenAI Helpers
// ========================================

function stripJsonFences(text) {
    // Remove ```json ... ``` or ``` ... ``` wrappers that AI sometimes adds
    return text
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```\s*$/, '')
        .trim();
}

async function callOpenAI(messages, options = {}) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
            model: options.model || 'gpt-4o-mini',
            messages,
            temperature: options.temperature ?? 0.7,
            max_tokens: options.maxTokens || 4000,
            response_format: options.json ? { type: 'json_object' } : undefined,
        }),
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(`OpenAI API error: ${err.error?.message || response.statusText}`);
    }

    const data = await response.json();
    const rawContent = data.choices[0].message.content;
    // For JSON requests, strip any accidental markdown fences before returning
    const content = options.json ? stripJsonFences(rawContent) : rawContent;
    return {
        content,
        tokensUsed: data.usage?.total_tokens || 0,
    };
}

// ========================================
// Reading Content Generation
// ========================================

export async function generateReadingPassage(topic, difficulty, ieltsType, passageNum = 1) {
    const bandDescriptions = {
        band_4_5: 'simple vocabulary, short sentences, basic ideas (Band 4-5 level)',
        band_6_7: 'moderate complexity, varied vocabulary, developed arguments (Band 6-7 level)',
        band_8_9: 'sophisticated vocabulary, complex sentence structures, nuanced arguments (Band 8-9 level)',
    };

    const academicPassageStyle = {
        1: 'Descriptive or factual. Write a straightforward informational passage about the topic. Use clear topic sentences, factual information, and moderate vocabulary. Length: 600-700 words.',
        2: 'Discursive or analytical. Present different viewpoints or a line of argument on the topic. Use a mix of evidence, opinion, and analysis. Intermediate-to-advanced vocabulary. Length: 700-800 words.',
        3: 'Complex and argumentative. Write an academic-style essay presenting a nuanced argument, referencing research or expert opinions, using sophisticated vocabulary and complex sentence structures. Length: 800-900 words.',
    };

    const generalSectionStyle = {
        A: 'Short practical texts. Write as if it is an advertisement, notice, timetable, or workplace announcement about the topic. Keep it under 350 words total. Can include multiple short texts under the same theme.',
        B: 'Workplace or training material. Write a longer informational text such as a company policy, staff handbook excerpt, job description, or training guide about the topic. Length: 400-550 words.',
        C: 'General interest passage. Write a longer, more complex text on the topic, similar in style to IELTS Academic Reading Passage 1. Length: 600-750 words.',
    };

    const styleGuide = ieltsType === 'academic'
        ? (academicPassageStyle[passageNum] || academicPassageStyle[1])
        : (generalSectionStyle[passageNum] || generalSectionStyle['A']);

    const { content, tokensUsed } = await callOpenAI([
        {
            role: 'system',
            content: `You are an expert IELTS examiner creating authentic reading passages for ${ieltsType === 'general' ? 'IELTS General Training' : 'IELTS Academic'} reading tests. Write in plain prose only — no markdown symbols, no asterisks, no hashes, no bullet points, no bold or italic formatting.`
        },
        {
            role: 'user',
            content: `Generate an IELTS ${ieltsType} reading passage about "${topic}".

Style and format: ${styleGuide}
Difficulty level: ${bandDescriptions[difficulty] || bandDescriptions.band_6_7}

Strict formatting rules:
- Start with a plain title on the first line only (no #, no **, no symbols)
- Write the passage in plain paragraphs separated by blank lines
- No markdown at all: no **, no *, no #, no bullet points, no numbered lists, no underscores
- Do NOT include any questions

Return ONLY the title on the first line, then the passage text.`
        }
    ], { maxTokens: 1800 });

    return { passage: cleanMarkdown(content.trim()), tokensUsed };
}

export async function generateReadingQuestions(passage, questionTypes, count = 13) {
    const typeDescriptions = {
        mcq: 'Multiple choice with 4 options (A-D)',
        tfng: 'True / False / Not Given — correctAnswer must be exactly "TRUE", "FALSE", or "NOT GIVEN"',
        ynng: 'Yes / No / Not Given — correctAnswer must be exactly "YES", "NO", or "NOT GIVEN"',
        matching_headings: 'Match paragraph headings — options are heading labels, correctAnswer is the matching heading',
        matching_info: 'Match information to paragraphs — correctAnswer is a paragraph letter (A, B, C...)',
        fill_blank: 'Complete the sentence with a word/phrase from the passage — correctAnswer is the exact word(s)',
        summary: 'Complete a summary using words from the passage — correctAnswer is the exact word(s)',
        short_answer: 'Short answer using words from the passage — correctAnswer is the exact word(s)',
        diagram: 'Label a diagram using words from the passage — correctAnswer is the exact label word(s)',
    };
    const requestedTypes = questionTypes.map(t => `${t}: ${typeDescriptions[t] || t}`).join('\n');

    const { content, tokensUsed } = await callOpenAI([
        {
            role: 'system',
            content: 'You are an expert IELTS examiner. Generate high-quality reading comprehension questions. Question text must be plain English — no asterisks, no markdown symbols. Always return valid JSON only.'
        },
        {
            role: 'user',
            content: `Based on this IELTS reading passage, generate exactly ${count} questions using the specified types.

PASSAGE:
${passage}

Question types to use (distribute evenly):
${requestedTypes}

Rules:
- Question text must be plain English — no **, no *, no # symbols
- For mcq: always include 4 options array
- For tfng/ynng: options must be the valid choices, correctAnswer must match exactly
- For fill_blank/summary/short_answer: options should be null
- correctAnswer must always be provided

Return ONLY valid JSON in this exact format:
{
  "questions": [
    {
      "index": 1,
      "type": "mcq",
      "question": "Plain question text here",
      "options": ["option A", "option B", "option C", "option D"],
      "correctAnswer": "option A",
      "explanation": "Brief plain-text explanation"
    }
  ]
}`
        }
    ], { json: true });

    const parsed = JSON.parse(content);
    return { questions: parsed.questions, tokensUsed };
}

// ========================================
// Listening Content Generation
// ========================================

export async function generateListeningScript(topic, difficulty, section = 1) {
    const sectionDescriptions = {
        1: 'A conversation between two people in an everyday social context (e.g., booking a hotel, asking for directions)',
        2: 'A monologue in an everyday social context (e.g., a speech about local facilities, a tour guide)',
        3: 'A conversation between up to four people in an educational/training context (e.g., university tutorial)',
        4: 'A monologue on an academic subject (e.g., a university lecture)',
    };

    const { content, tokensUsed } = await callOpenAI([
        {
            role: 'system',
            content: 'You are an expert IELTS examiner creating listening test scripts. Write natural-sounding dialogue and monologue scripts that are suitable for realistic voice performance.'
        },
        {
            role: 'user',
            content: `Generate an IELTS Listening Section ${section} script about "${topic}".

Section type: ${sectionDescriptions[section]}
Difficulty: ${difficulty}
Duration target: 3-5 minutes when spoken

Requirements:
- Natural conversational tone
- Include speaker labels on every spoken turn
- For dialogue sections, use realistic named speakers and include gender in the label, for example:
  EMMA (female): ...
  DANIEL (male): ...
- For monologues, use a single descriptive label such as:
  NARRATOR (female): ...
  LECTURER (male): ...
- Include key information that can be tested (names, numbers, dates, places)
- 300-500 words
- Keep each spoken turn reasonably short so it can be voiced naturally
- Do not include stage directions or explanations
- Do not use generic labels like SPEAKER A unless absolutely necessary

Return ONLY the script text.`
        }
    ]);

    return { script: content.trim(), tokensUsed };
}

export async function generateListeningQuestions(script, count = 10) {
    const { content, tokensUsed } = await callOpenAI([
        {
            role: 'system',
            content: 'You are an expert IELTS examiner. Generate listening comprehension questions. Always return valid JSON.'
        },
        {
            role: 'user',
            content: `Based on this IELTS listening script, generate ${count} questions.

SCRIPT:
${script}

Include a mix of: fill-in-the-blank, matching, MCQ, and short answer questions.

Return JSON in this exact format:
{
  "questions": [
    {
      "index": 1,
      "type": "fill_blank|mcq|matching|short_answer",
      "question": "The question text",
      "options": ["A", "B", "C"] or null,
      "correctAnswer": "the correct answer",
      "explanation": "Brief explanation"
    }
  ]
}`
        }
    ], { json: true });

    const parsed = JSON.parse(content);
    return { questions: parsed.questions, tokensUsed };
}

// ========================================
// Writing Content Generation & Evaluation
// ========================================

export function cleanMarkdown(text) {
    if (!text) return '';
    return text
        .replace(/\*\*([^*]+)\*\*/g, '$1')   // **bold**
        .replace(/\*([^*]+)\*/g, '$1')         // *italic*
        .replace(/^#{1,6}\s+/gm, '')           // ## headings
        .replace(/^[-•–]\s+/gm, '')            // bullet points
        .replace(/_{2,}/g, '')                  // __underline__
        .replace(/`[^`]+`/g, (m) => m.slice(1, -1)) // `code`
        .trim();
}

export async function generateWritingPrompt(taskType, ieltsType, topic, task1Subtype = null) {
    // Academic Task 1 — return structured JSON with chart data for in-browser rendering
    if (taskType === 1 && ieltsType === 'academic') {
        const subtypeMap = {
            graph:     'bar',
            pie_chart: 'pie',
            table:     'table',
            map:       'map',
            process:   'process',
        };
        const randomTypes = ['bar', 'line', 'pie', 'table', 'process'];
        const chartType = task1Subtype && subtypeMap[task1Subtype]
            ? subtypeMap[task1Subtype]
            : randomTypes[Math.floor(Math.random() * randomTypes.length)];

        const chartTypeExamples = {
            bar: `"chartData": {
    "type": "bar",
    "labels": ["2018", "2019", "2020", "2021", "2022"],
    "datasets": [
      { "label": "Category A", "data": [25, 30, 35, 28, 40] },
      { "label": "Category B", "data": [15, 22, 18, 32, 27] }
    ],
    "unit": "%",
    "xAxisLabel": "Year",
    "yAxisLabel": "Percentage"
  }`,
            line: `"chartData": {
    "type": "line",
    "labels": ["2010", "2012", "2014", "2016", "2018", "2020"],
    "datasets": [
      { "label": "Trend A", "data": [120, 135, 150, 180, 200, 230] },
      { "label": "Trend B", "data": [90, 100, 95, 110, 125, 140] }
    ],
    "unit": "millions",
    "xAxisLabel": "Year",
    "yAxisLabel": "Number"
  }`,
            pie: `"chartData": {
    "type": "pie",
    "labels": ["Segment A", "Segment B", "Segment C", "Segment D"],
    "datasets": [
      { "label": "Distribution", "data": [35, 25, 22, 18] }
    ],
    "unit": "%"
  }`,
            table: `"chartData": {
    "type": "table",
    "tableHeaders": ["Country", "2010", "2015", "2020"],
    "tableRows": [
      ["USA", "350", "420", "510"],
      ["UK", "210", "240", "280"],
      ["Japan", "180", "195", "220"]
    ],
    "unit": "thousands"
  }`,
            process: `"chartData": {
    "type": "process",
    "processSteps": ["Raw material collection", "Processing and refinement", "Manufacturing", "Quality testing", "Distribution", "Retail"]
  }`,
            map: `"chartData": {
    "type": "map",
    "mapDescription": "Map A shows the town centre in 1990 with a large park in the north, residential houses along Main Street, and a small shopping area in the south-east. Map B shows the same area in 2020 where the park has been replaced by a shopping mall, Main Street has been widened into a dual carriageway, and a new car park occupies the former residential area."
  }`,
        };

        const example = chartTypeExamples[chartType] || chartTypeExamples.bar;

        const { content, tokensUsed } = await callOpenAI([
            {
                role: 'system',
                content: 'You are an expert IELTS Academic examiner. Return ONLY valid JSON. No markdown, no extra text outside the JSON object.'
            },
            {
                role: 'user',
                content: `Generate an IELTS Academic Writing Task 1 prompt about "${topic}" using a ${chartType} chart/visual.

You MUST return a single JSON object with these exact keys:

{
  "title": "A descriptive title for the visual (e.g. 'Global Coffee Production by Country, 2015-2020')",
  "taskInstruction": "You should spend about 20 minutes on this task.\\n\\n[Describe what the visual shows in 1-2 sentences].\\n\\nSummarise the information by selecting and reporting the main features, and make comparisons where relevant.\\n\\nWrite at least 150 words.",
  ${example}
}

CRITICAL RULES:
- "chartData.type" MUST be exactly "${chartType}" (lowercase string)
- Use realistic, plausible numerical data
- "datasets" must be an array of objects, each with "label" (string) and "data" (array of numbers)
- "labels" must match the length of each "data" array
- "taskInstruction" must be plain text with no markdown symbols
- Include 4-8 data points for charts
- Include 2-4 datasets for bar/line charts`
            }
        ], { json: true, maxTokens: 2000 });

        const parsed = JSON.parse(content);
        // Ensure chartData.type is normalised
        if (parsed.chartData) {
            const t = (parsed.chartData.type || '').toLowerCase();
            if (t.includes('line')) parsed.chartData.type = 'line';
            else if (t.includes('bar')) parsed.chartData.type = 'bar';
            else if (t.includes('pie')) parsed.chartData.type = 'pie';
            else if (t.includes('table')) parsed.chartData.type = 'table';
            else if (t.includes('process')) parsed.chartData.type = 'process';
            else if (t.includes('map')) parsed.chartData.type = 'map';
            else parsed.chartData.type = chartType; // fallback to requested type
        }
        return {
            prompt: JSON.stringify(parsed),
            isStructured: true,
            tokensUsed,
        };
    }

    // General Training Task 1 — plain text prompt
    if (taskType === 1 && ieltsType === 'general') {
        const letterMap = {
            formal:      'a formal letter to an authority, company, or unknown recipient',
            semi_formal: 'a semi-formal letter to an acquaintance or colleague',
            informal:    'an informal letter to a friend or family member',
        };
        const letterType = task1Subtype && letterMap[task1Subtype]
            ? letterMap[task1Subtype]
            : 'a letter (choose the most appropriate register for the situation)';

        const { content, tokensUsed } = await callOpenAI([
            {
                role: 'system',
                content: 'You are an expert IELTS General Training examiner. Write authentic exam prompts in plain English. No markdown, no asterisks, no bullet symbols — use plain numbered points only.'
            },
            {
                role: 'user',
                content: `Generate an IELTS General Training Writing Task 1 prompt. The student must write ${letterType} about the topic "${topic}".

Format exactly as it appears on an IELTS exam paper:
- One paragraph describing the situation clearly.
- Then: "In your letter you should:"
- Then three numbered points (1. ... 2. ... 3. ...) the student must address.
- End with: "Write at least 150 words."

Use plain sentences only. No asterisks, no markdown symbols.`
            }
        ]);

        return { prompt: cleanMarkdown(content.trim()), isStructured: false, tokensUsed };
    }

    // Task 2 (same for Academic and General Training)
    const { content, tokensUsed } = await callOpenAI([
        {
            role: 'system',
            content: 'You are an expert IELTS examiner. Write authentic Task 2 essay prompts in plain English. No markdown, no asterisks, no bullet symbols.'
        },
        {
            role: 'user',
            content: `Generate an IELTS ${ieltsType} Writing Task 2 prompt about the topic "${topic}".

Format exactly as it appears on an IELTS exam paper:
- One or two sentences presenting a statement, opinion, or situation.
- Then the task instruction (e.g. "To what extent do you agree or disagree?", "Discuss both views and give your own opinion.", "What are the causes of this problem and what measures could be taken to solve it?").
- End with: "Give reasons for your answer and include any relevant examples from your own knowledge or experience. Write at least 250 words."

Use plain sentences only. No asterisks, no markdown symbols.`
        }
    ]);

    return { prompt: cleanMarkdown(content.trim()), isStructured: false, tokensUsed };
}

export async function evaluateWriting(essay, prompt, taskType) {
    const { content, tokensUsed } = await callOpenAI([
        {
            role: 'system',
            content: `You are a certified IELTS examiner. Evaluate the following essay using official IELTS Writing band descriptors. Be fair but precise. Always return valid JSON.`
        },
        {
            role: 'user',
            content: `Evaluate this IELTS Writing Task ${taskType} essay.

PROMPT: ${prompt}

ESSAY: ${essay}

Score each criterion on the IELTS 0-9 band scale (can use .5 increments).

Return JSON:
{
  "overallBand": 6.5,
  "criteria": {
    "taskResponse": { "band": 6.5, "feedback": "..." },
    "coherenceCohesion": { "band": 6.0, "feedback": "..." },
    "lexicalResource": { "band": 7.0, "feedback": "..." },
    "grammaticalRange": { "band": 6.5, "feedback": "..." }
  },
  "strengths": ["...", "..."],
  "improvements": ["...", "..."],
  "modelParagraph": "A short example of how one paragraph could be improved"
}`
        }
    ], { json: true, maxTokens: 2000 });

    const parsed = JSON.parse(content);
    return { evaluation: parsed, tokensUsed };
}

// ========================================
// Speaking Content Generation
// ========================================

export async function generateSpeakingQuestions(part, topic) {
    const partDescriptions = {
        1: 'Part 1: Introduction & Interview (4-5 questions on familiar topics)',
        2: 'Part 2: Individual Long Turn (1 cue card with bullet points, student speaks for 2 mins)',
        3: 'Part 3: Two-way Discussion (4-5 abstract/analytical questions related to Part 2 topic)',
    };

    const { content, tokensUsed } = await callOpenAI([
        {
            role: 'system',
            content: 'You are an expert IELTS examiner. Generate speaking test questions. Always return valid JSON.'
        },
        {
            role: 'user',
            content: `Generate IELTS Speaking ${partDescriptions[part]} questions about "${topic}".

Return JSON:
{
  ${part === 2 ? `"cueCard": {
    "topic": "Describe...",
    "bulletPoints": ["You should say:", "point 1", "point 2", "point 3", "and explain..."]
  },` : ''}
  "questions": [
    { "index": 1, "question": "..." }
  ]
}`
        }
    ], { json: true });

    const parsed = JSON.parse(content);
    return { questionSet: parsed, tokensUsed };
}

/**
 * Generate an IELTS Speaking Part 2 cue card with topic and bullet points.
 * Returns formatted text ready to display on the prep screen.
 */
export async function generateCueCardForTopic(topic) {
    const { content, tokensUsed } = await callOpenAI([
        {
            role: 'system',
            content: 'You are an expert IELTS examiner creating Part 2 cue cards. Return plain text only, no JSON, no markdown. Each cue card should feel unique and natural for IELTS.'
        },
        {
            role: 'user',
            content: `Generate an IELTS Speaking Part 2 cue card about "${topic}".

Format exactly like this example:

Describe a place you visited that left a strong impression on you.

You should say:
• Where this place is
• When you visited it
• What you did there
• And explain why it left a strong impression on you

Rules:
- Start with "Describe..." matching the topic
- Add "You should say:" followed by exactly 4 bullet points (use • symbol)
- The first 3 bullets should be specific to the topic
- The last bullet must start with "And explain..."
- Use plain text only, no markdown

Return ONLY the cue card text, nothing else.`
        }
    ], { maxTokens: 300, temperature: 0.9 });

    return { cueCardText: content.trim(), tokensUsed };
}

export async function generateCueCard() {
    const topics = [
        'a place you visited that left a strong impression on you',
        'a person who has had a significant influence on your life',
        'a memorable event from your childhood',
        'a skill you would like to learn in the future',
        'a book or film that you found very interesting',
        'a piece of technology you find particularly useful',
        'a time when you helped someone',
        'your favourite season and what you enjoy about it',
        'a local celebration or festival you have attended',
        'a journey you remember well',
        'a gift you gave that made someone happy',
        'an important decision you had to make',
        'a teacher who influenced you',
        'a building or structure you find interesting',
        'a time when you learned something new from a mistake',
        'a sport or physical activity you enjoy',
        'a meal you enjoyed with friends or family',
        'a piece of advice you received that was useful',
        'a historical place you have visited or would like to visit',
        'an achievement you are proud of',
        'a time when you had to wait a long time for something',
        'a neighbourhood you know well',
        'a song or piece of music that is special to you',
        'an outdoor activity you enjoy doing',
        'a website or app you use frequently',
        'a time when you were surprised by something',
        'a public transport experience you remember',
        'a hobby that helps you relax',
        'a volunteering experience you had or would like to have',
        'a photograph that is meaningful to you',
    ];

    const randomTopic = topics[Math.floor(Math.random() * topics.length)];

    return generateCueCardForTopic(randomTopic);
}

export async function generateTTSAudio(text, voiceId = 'pNInz6obpgDQGcFmaJgB', speed = 1.0) {
    if (!ELEVENLABS_API_KEY) {
        console.warn('No ElevenLabs API key configured, using browser TTS fallback');
        return generateBrowserTTSAudio(text, speed);
    }

    try {
        console.log('[TTS] Calling ElevenLabs API, voice:', voiceId, 'text length:', text.length);
        const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'xi-api-key': ELEVENLABS_API_KEY,
            },
            body: JSON.stringify({
                text: text.substring(0, 5000), // ElevenLabs has text length limits
                model_id: 'eleven_multilingual_v2',
                voice_settings: {
                    stability: 0.5,
                    similarity_boost: 0.75,
                },
            }),
        });

        console.log('[TTS] ElevenLabs response status:', response.status, 'content-type:', response.headers.get('content-type'));

        if (!response.ok) {
            const errBody = await response.text().catch(() => '');
            console.error(`[TTS] ElevenLabs API error ${response.status}: ${errBody}`);
            return generateBrowserTTSAudio(text, speed);
        }

        // Validate response is actually audio before returning
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('audio')) {
            const body = await response.text().catch(() => '');
            console.error('[TTS] ElevenLabs returned non-audio response:', contentType, body);
            return generateBrowserTTSAudio(text, speed);
        }

        const audioBlob = await response.blob();
        console.log('[TTS] ElevenLabs blob type:', audioBlob.type, 'size:', audioBlob.size);
        if (!audioBlob || audioBlob.size < 1000) {
            console.error('[TTS] ElevenLabs returned empty or tiny audio blob:', audioBlob?.size);
            return generateBrowserTTSAudio(text, speed);
        }
        return audioBlob;
    } catch (err) {
        console.warn('ElevenLabs request failed, using browser TTS fallback:', err.message);
        return generateBrowserTTSAudio(text, speed);
    }
}

/**
 * Browser-based TTS fallback using Web Speech API.
 * Records the speech output to an audio blob via MediaRecorder + AudioContext.
 * If MediaRecorder is unavailable, returns null so the caller can show the script.
 */
export async function generateBrowserTTSAudio(text, speed = 1.0) {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
        throw new Error('Browser TTS not supported');
    }

    // Return the marker immediately — actual playback is handled live
    // by the Listening component when the user clicks Play.
    return '__browser_tts__';
}
