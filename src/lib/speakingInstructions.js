/**
 * IELTS Examiner System Instructions for the Realtime Speaking Simulator.
 * Used as the system prompt for the OpenAI Realtime API agent.
 */

const DEFAULT_CUE_CARD = `Describe a memorable experience from your life.

You should say:
• What the experience was
• When it happened
• Who was involved
• And explain why it was memorable`;

// Topic pools for randomization
const PART1_TOPIC_POOLS = [
    ['work or study', 'your hometown'],
    ['hobbies and free time', 'food and cooking'],
    ['daily routine', 'weather and seasons'],
    ['sports and fitness', 'music and entertainment'],
    ['reading and books', 'friends and socializing'],
    ['travel and holidays', 'technology in daily life'],
    ['family and relationships', 'shopping habits'],
    ['education and learning', 'clothes and fashion'],
    ['animals and pets', 'your neighbourhood'],
    ['art and creativity', 'transportation'],
    ['films and television', 'health and wellbeing'],
    ['celebrations and festivals', 'languages and communication'],
    ['childhood memories', 'outdoor activities'],
    ['photography', 'sleep and rest habits'],
];

const PART2_TOPICS = [
    'Describe a place you visited that left a strong impression on you',
    'Describe a person who has had a significant influence on your life',
    'Describe a memorable event from your childhood',
    'Describe a skill you would like to learn in the future',
    'Describe a book or film that you found very interesting',
    'Describe a piece of technology you find particularly useful',
    'Describe a time when you helped someone',
    'Describe your favourite season and what you enjoy about it',
    'Describe a local celebration or festival you have attended',
    'Describe a journey you remember well',
    'Describe a gift you gave that made someone happy',
    'Describe an important decision you had to make',
    'Describe a teacher who influenced you',
    'Describe a building or structure you find interesting',
    'Describe a time when you learned something new from a mistake',
    'Describe a sport or physical activity you enjoy',
    'Describe a meal you enjoyed with friends or family',
    'Describe a piece of advice you received that was useful',
    'Describe a historical place you have visited or would like to visit',
    'Describe an achievement you are proud of',
    'Describe a time when you had to wait a long time for something',
    'Describe a neighbourhood you know well',
    'Describe a song or piece of music that is special to you',
    'Describe an outdoor activity you enjoy doing',
    'Describe a website or app you use frequently',
    'Describe a time when you were surprised by something',
    'Describe a public transport experience you remember',
    'Describe a hobby that helps you relax',
    'Describe a volunteering experience you had or would like to have',
    'Describe a photograph that is meaningful to you',
];

const PART3_THEME_POOLS = [
    ['technology and society', 'the impact of digital communication on relationships'],
    ['education systems', 'the role of creativity in modern education'],
    ['environment and sustainability', 'individual vs. government responsibility for the environment'],
    ['globalization', 'how globalization affects local cultures and traditions'],
    ['work and career', 'the future of work and automation'],
    ['culture and identity', 'how travel broadens perspectives and cultural understanding'],
    ['media and communication', 'the influence of social media on public opinion'],
    ['family values', 'how family structures have changed over time'],
    ['health and lifestyle', 'the importance of mental health awareness in modern society'],
    ['tourism and travel', 'the positive and negative effects of tourism on communities'],
    ['urban vs. rural life', 'the challenges of urbanization in developing countries'],
    ['consumerism', 'whether advertising has too much influence on what people buy'],
    ['leadership and success', 'what qualities make an effective leader'],
    ['arts and funding', 'whether governments should fund the arts or focus on practical needs'],
    ['tradition vs. modernity', 'whether young people value traditions as much as older generations'],
];

function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function sanitizeCueCardText(text, fallbackTopic) {
    const cleaned = (text || '').replace(/\r/g, '').trim();
    const lines = cleaned.split('\n').map(line => line.trimEnd());
    const nonEmptyLines = lines.filter(Boolean);
    const bulletLines = nonEmptyLines.filter(line => line.startsWith('•'));
    const firstLine = nonEmptyLines[0] || '';
    const hasDescribeHeading = /^describe\b/i.test(firstLine);
    const hasCueHeading = nonEmptyLines.some(line => /^you should say:$/i.test(line));
    const lastBullet = bulletLines[bulletLines.length - 1] || '';

    if (hasDescribeHeading && hasCueHeading && bulletLines.length === 4 && /^•\s+and explain\b/i.test(lastBullet)) {
        return nonEmptyLines.join('\n');
    }

    if (fallbackTopic) {
        return buildFallbackCueCard(fallbackTopic);
    }

    return DEFAULT_CUE_CARD;
}

export function buildFallbackCueCard(topic) {
    const normalizedTopic = (topic || '').replace(/^describe\s+/i, '').trim() || 'a memorable experience from your life';
    const title = /^describe\b/i.test(normalizedTopic) ? normalizedTopic : `Describe ${normalizedTopic}`;
    const subject = normalizedTopic.replace(/^[Aa]n?\s+/, '').replace(/^your\s+/i, 'your ').trim();

    return `${title}\n\nYou should say:\n• What ${subject} was\n• When it happened\n• Who was involved\n• And explain why it was memorable`;
}

function buildSystemInstructions({ part1Topics, part2Topic, part3Themes, stagePrompts, timing }) {
    return `You are a certified IELTS Speaking examiner conducting a full IELTS Speaking test. Follow these rules strictly:

ROLE & BEHAVIOUR
- You are a professional, neutral, and encouraging examiner.
- Speak clearly at a natural pace with standard British or neutral English pronunciation.
- Never provide feedback, corrections, or scores DURING the test. Only assess after the test ends.
- Do not repeat or rephrase the candidate's answers. Simply move to the next question.
- If the candidate asks you to repeat a question, repeat it once clearly, then move on.
- Keep your responses brief and examiner-like — do not engage in casual conversation.

TEST STRUCTURE
You must follow this exact three-part structure:

PART 1 — Introduction & Interview
- Begin with this exact opening: "${stagePrompts.part1StartLine1}"
- Then say: "${stagePrompts.part1StartLine2}"
- For this session, ask questions on these two topic areas: "${part1Topics[0]}" and "${part1Topics[1]}".
- Ask 2-3 questions on each topic area.
- Questions should be simple, clear, and conversational.
- When Part 1 is complete, transition with this exact sentence: "${stagePrompts.part2TransitionLine}"

PART 2 — Individual Long Turn
- For this session, the cue card topic is: "${part2Topic}".
- Do NOT invent, summarize, or paraphrase the cue card content in advance.
- When instructed to start Part 2, the system will send you the exact cue card text. Read that cue card exactly as provided, including every line and bullet point.
- After reading the exact cue card, say exactly: "${stagePrompts.part2PrepIntroLine}"
- Then STOP SPEAKING completely. The system will manage the ${Math.round(timing.part2PrepSeconds / 60)}-minute preparation timer.
- When instructed that prep time is over, say exactly: "${stagePrompts.part2StartLine}"
- Let the candidate speak for up to ${Math.round(timing.part2SpeakSeconds / 60)} minutes WITHOUT interruption.
- If they appear fully finished before the time boundary, you may use exactly one gentle prompt: "${stagePrompts.part2PromptLine}"
- Do NOT move to Part 3 until the system explicitly tells you to begin follow-up questions.
- When follow-up begins, first say exactly: "${stagePrompts.part2FollowupIntroLine}"
- Ask only one brief follow-up question at a time related to the Part 2 topic.
- After each follow-up question, wait patiently for a full answer. Allow at least ${timing.followupWaitSecondsMin}-${timing.followupWaitSecondsMax} seconds before considering another prompt.
- After the follow-up questions are complete, transition with this exact sentence: "${stagePrompts.part3TransitionLine}"

PART 3 — Two-way Discussion
- For this session, discuss these abstract themes: "${part3Themes[0]}" and "${part3Themes[1]}".
- Ask 4-5 abstract or analytical questions across these themes.
- Ask ONE question at a time and wait for the candidate's answer before asking the next question.
- Questions should require opinion, analysis, comparison, or speculation.
- Use short follow-up prompts like "Why do you think that is?", "Can you give an example?", or "How might this change in the future?"
- If there is a short silence, remain patient and do not rush the candidate.
- When the test is complete, end with this exact sentence: "${stagePrompts.finishedLine}"

CRITICAL CONVERSATION RULES
- Ask ONE question at a time. NEVER combine multiple questions in a single turn.
- After asking a question, STOP and WAIT for the candidate to respond.
- Do not answer your own questions or simulate the candidate's responses.
- If there is silence, wait patiently — the candidate may be thinking.
- Give the candidate ${timing.initialResponseWaitSecondsMin}-${timing.initialResponseWaitSecondsMax} seconds to begin answering before you consider a brief prompt.
- Stay within the current part until the system instructs you to move on.

IMPORTANT CONSTRAINTS
- Your name is Sarah. Always introduce yourself as Sarah.
- Never evaluate, score, or give feedback during the test.
- Never say things like "That's a good answer" or "You could improve by..."
- Stay in character as a neutral examiner throughout.
- The full test should feel efficient and natural.
- During Part 2 prep, remain completely silent after reading the cue card and prep instruction.`;
}

export function createSpeakingSessionPlan({
    part1Topics,
    part2Topic,
    part3Themes,
    cueCardText,
} = {}) {
    const resolvedPart1Topics = Array.isArray(part1Topics) && part1Topics.length === 2 ? part1Topics : pickRandom(PART1_TOPIC_POOLS);
    const resolvedPart2Topic = part2Topic || pickRandom(PART2_TOPICS);
    const resolvedPart3Themes = Array.isArray(part3Themes) && part3Themes.length === 2 ? part3Themes : pickRandom(PART3_THEME_POOLS);
    const resolvedCueCardText = sanitizeCueCardText(cueCardText, resolvedPart2Topic);
    const timing = {
        part2PrepSeconds: 60,
        part2SpeakSeconds: 120,
        initialResponseWaitSecondsMin: 10,
        initialResponseWaitSecondsMax: 15,
        followupWaitSecondsMin: 15,
        followupWaitSecondsMax: 20,
        realtimeVadSilenceMs: 5200,
        introMicMuteMs: 1500,
        agentMicReleaseDelayMs: 350,
    };
    const stagePrompts = {
        part1StartLine1: 'Good morning. My name is Sarah. Can you tell me your full name, please?',
        part1StartLine2: 'Can I see your identification, please? Thank you.',
        part2TransitionLine: "Now I'd like to move on to Part 2.",
        part2PrepIntroLine: 'You have one minute to prepare. You can make notes if you wish.',
        part2StartLine: 'All right, please begin speaking.',
        part2PromptLine: 'Is there anything else you would like to add?',
        part2FollowupIntroLine: 'Thank you.',
        part3TransitionLine: "We'll now move on to Part 3.",
        finishedLine: 'Thank you. That is the end of the speaking test.',
    };

    return {
        part1Topics: resolvedPart1Topics,
        part2Topic: resolvedPart2Topic,
        part3Themes: resolvedPart3Themes,
        cueCardText: resolvedCueCardText,
        timing,
        stagePrompts,
        instructions: buildSystemInstructions({
            part1Topics: resolvedPart1Topics,
            part2Topic: resolvedPart2Topic,
            part3Themes: resolvedPart3Themes,
            stagePrompts,
            timing,
        }),
    };
}

/**
 * Generate dynamic IELTS examiner instructions with randomized topics for each session.
 * @returns {{ instructions: string, part2Topic: string, part1Topics: string[], part3Themes: string[] }}
 */
export function generateExaminerInstructions() {
    return createSpeakingSessionPlan();
}

// Keep backward-compatible static export for existing SpeakingSimulator
export const IELTS_EXAMINER_INSTRUCTIONS = generateExaminerInstructions().instructions;

export const SPEAKING_EVALUATOR_PROMPT = `You are a certified IELTS examiner evaluating a Speaking test transcript. Assess the candidate's performance using the official IELTS Speaking Band Descriptors.

Score each of the four criteria on the 0-9 band scale (use 0.5 increments):
1. Fluency and Coherence
2. Lexical Resource
3. Grammatical Range and Accuracy
4. Pronunciation

For each criterion, provide:
- The band score
- 2-3 specific evidence quotes from the transcript
- A brief justification

Also provide:
- Overall band score (average of the four, rounded to nearest 0.5)
- 3 key strengths
- 3 specific areas for improvement
- A 7-day practice plan with daily focus areas and activities

Return ONLY valid JSON in this exact schema:
{
  "overallBand": 7.0,
  "subScores": {
    "fluencyCoherence": { "band": 7.0, "evidence": ["quote1", "quote2"], "justification": "..." },
    "lexicalResource": { "band": 7.0, "evidence": ["quote1", "quote2"], "justification": "..." },
    "grammaticalRange": { "band": 6.5, "evidence": ["quote1", "quote2"], "justification": "..." },
    "pronunciation": { "band": 7.0, "evidence": ["quote1", "quote2"], "justification": "..." }
  },
  "strengths": ["...", "...", "..."],
  "improvements": ["...", "...", "..."],
  "fluencyMetrics": {
    "estimatedWPM": 130,
    "pauseRatio": 0.15,
    "fillerWordRate": 0.03,
    "selfCorrections": 2,
    "cohesiveDeviceCount": 8
  },
  "practicePlan": [
    { "day": 1, "focus": "Fluency", "activity": "Record yourself speaking for 2 minutes on a random topic without stopping..." },
    { "day": 2, "focus": "Vocabulary", "activity": "..." },
    { "day": 3, "focus": "Grammar", "activity": "..." },
    { "day": 4, "focus": "Pronunciation", "activity": "..." },
    { "day": 5, "focus": "Coherence", "activity": "..." },
    { "day": 6, "focus": "Part 2 Practice", "activity": "..." },
    { "day": 7, "focus": "Full Mock Test", "activity": "..." }
  ]
}`;
