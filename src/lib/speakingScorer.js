/**
 * Speaking Scorer – Post-session transcription + evaluation pipeline.
 * After the realtime session ends:
 *   1. Transcribe audio via Whisper (if needed)
 *   2. Run evaluator prompt against transcript
 *   3. Compute fluency metrics from transcript
 *   4. Save everything to speaking_sessions table
 */

import { supabase } from './supabase';
import { SPEAKING_EVALUATOR_PROMPT } from './speakingInstructions';

const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;

function stripJsonFences(text) {
    return text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
}

/**
 * Transcribe an audio blob using Whisper API.
 * @param {Blob} audioBlob
 * @returns {Promise<string>} transcript text
 */
export async function transcribeAudio(audioBlob) {
    if (!audioBlob || audioBlob.size === 0) return '';

    const formData = new FormData();
    formData.append('file', audioBlob, 'recording.webm');
    formData.append('model', 'whisper-1');
    formData.append('language', 'en');
    formData.append('response_format', 'verbose_json');

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}` },
        body: formData,
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(`Whisper API error: ${err.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return data.text || '';
}

/**
 * Evaluate a speaking transcript using GPT-4o.
 * @param {Array} transcript - Array of { role, text, part, timestamp }
 * @returns {Promise<Object>} Score report JSON
 */
export async function evaluateTranscript(transcript) {
    if (!transcript || transcript.length === 0) {
        return getFallbackReport('No transcript available for evaluation.');
    }

    const formattedTranscript = transcript
        .map(t => `[${t.part?.toUpperCase() || 'UNKNOWN'}] ${t.role === 'examiner' ? 'EXAMINER' : 'CANDIDATE'}: ${t.text}`)
        .join('\n');

    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
            },
            body: JSON.stringify({
                model: 'gpt-4o',
                messages: [
                    { role: 'system', content: SPEAKING_EVALUATOR_PROMPT },
                    { role: 'user', content: `Here is the full IELTS Speaking test transcript:\n\n${formattedTranscript}` },
                ],
                temperature: 0.3,
                max_tokens: 3000,
                response_format: { type: 'json_object' },
            }),
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(`Evaluation API error: ${err.error?.message || response.statusText}`);
        }

        const data = await response.json();
        const content = stripJsonFences(data.choices[0].message.content);
        const report = JSON.parse(content);

        // Merge computed fluency metrics with AI-estimated ones
        const candidateText = transcript
            .filter(t => t.role === 'candidate')
            .map(t => t.text)
            .join(' ');

        const computedMetrics = computeFluencyMetrics(candidateText);
        report.fluencyMetrics = {
            ...report.fluencyMetrics,
            ...computedMetrics,
        };

        return report;
    } catch (err) {
        console.error('[SpeakingScorer] Evaluation failed:', err);
        return getFallbackReport(err.message);
    }
}

/**
 * Compute simple fluency metrics from candidate text.
 */
function computeFluencyMetrics(text) {
    if (!text) return { estimatedWPM: 0, fillerWordRate: 0, selfCorrections: 0, cohesiveDeviceCount: 0 };

    const words = text.split(/\s+/).filter(w => w.length > 0);
    const wordCount = words.length;

    // Estimate WPM (assume ~12 min test, ~8 min candidate speaking)
    const estimatedSpeakingMinutes = 8;
    const estimatedWPM = Math.round(wordCount / estimatedSpeakingMinutes);

    // Filler words
    const fillerWords = ['um', 'uh', 'er', 'like', 'you know', 'sort of', 'kind of', 'basically', 'actually', 'well'];
    const lowerText = text.toLowerCase();
    let fillerCount = 0;
    for (const filler of fillerWords) {
        const regex = new RegExp(`\\b${filler}\\b`, 'gi');
        const matches = lowerText.match(regex);
        if (matches) fillerCount += matches.length;
    }
    const fillerWordRate = wordCount > 0 ? Math.round((fillerCount / wordCount) * 100) / 100 : 0;

    // Self-corrections (look for patterns like "I mean", "sorry", "no wait", corrections)
    const correctionPatterns = /\b(i mean|sorry|no wait|what i meant|let me rephrase|i should say)\b/gi;
    const selfCorrections = (text.match(correctionPatterns) || []).length;

    // Cohesive devices
    const cohesiveDevices = [
        'however', 'moreover', 'furthermore', 'in addition', 'on the other hand',
        'nevertheless', 'consequently', 'therefore', 'although', 'whereas',
        'for instance', 'for example', 'such as', 'in contrast', 'similarly',
        'as a result', 'in conclusion', 'firstly', 'secondly', 'finally',
        'besides', 'meanwhile', 'overall', 'in particular', 'specifically',
    ];
    let cohesiveCount = 0;
    for (const device of cohesiveDevices) {
        const regex = new RegExp(`\\b${device}\\b`, 'gi');
        const matches = lowerText.match(regex);
        if (matches) cohesiveCount += matches.length;
    }

    return {
        estimatedWPM,
        fillerWordRate,
        selfCorrections,
        cohesiveDeviceCount: cohesiveCount,
        wordCount,
        fillerCount,
    };
}

/**
 * Generate a fallback report when scoring fails.
 */
function getFallbackReport(reason) {
    return {
        overallBand: null,
        subScores: {
            fluencyCoherence: { band: null, evidence: [], justification: 'Scoring unavailable' },
            lexicalResource: { band: null, evidence: [], justification: 'Scoring unavailable' },
            grammaticalRange: { band: null, evidence: [], justification: 'Scoring unavailable' },
            pronunciation: { band: null, evidence: [], justification: 'Scoring unavailable' },
        },
        strengths: [],
        improvements: [],
        fluencyMetrics: {},
        practicePlan: [],
        error: reason,
        isFallback: true,
    };
}

/**
 * Save a complete speaking session to the database.
 * @param {Object} params
 * @returns {Promise<Object>} The saved session record
 */
export async function saveSpeakingSession({
    studentId,
    organizationId,
    transcript,
    scoreReport,
    recordings,
    startedAt,
    completedAt,
}) {
    // Upload recordings to storage
    const audioUrls = {};
    if (recordings) {
        for (const [part, blob] of Object.entries(recordings.partRecordings || {})) {
            if (blob && blob.size > 0) {
                const fileName = `speaking-sim/${studentId}/${Date.now()}_${part}.webm`;
                const { error: uploadErr } = await supabase.storage
                    .from('recordings')
                    .upload(fileName, blob, { contentType: 'audio/webm' });

                if (!uploadErr) {
                    const { data: { publicUrl } } = supabase.storage
                        .from('recordings')
                        .getPublicUrl(fileName);
                    audioUrls[part] = publicUrl;
                }
            }
        }

        // Full recording
        if (recordings.fullRecording && recordings.fullRecording.size > 0) {
            const fullFileName = `speaking-sim/${studentId}/${Date.now()}_full.webm`;
            const { error: uploadErr } = await supabase.storage
                .from('recordings')
                .upload(fullFileName, recordings.fullRecording, { contentType: 'audio/webm' });

            if (!uploadErr) {
                const { data: { publicUrl } } = supabase.storage
                    .from('recordings')
                    .getPublicUrl(fullFileName);
                audioUrls.full = publicUrl;
            }
        }
    }

    const durationSeconds = startedAt && completedAt
        ? Math.round((new Date(completedAt) - new Date(startedAt)) / 1000)
        : null;

    const { data, error } = await supabase
        .from('speaking_sessions')
        .insert({
            student_id: studentId,
            organization_id: organizationId,
            status: scoreReport?.isFallback ? 'failed' : 'completed',
            current_stage: 'finished',
            audio_urls: audioUrls,
            transcript,
            examiner_prompts: transcript.filter(t => t.role === 'examiner'),
            score_report: scoreReport,
            overall_band: scoreReport?.overallBand || null,
            sub_scores: scoreReport?.subScores || null,
            fluency_metrics: scoreReport?.fluencyMetrics || null,
            started_at: startedAt,
            completed_at: completedAt || new Date().toISOString(),
            duration_seconds: durationSeconds,
        })
        .select()
        .single();

    if (error) {
        console.error('[SpeakingScorer] Error saving session:', error);
        throw error;
    }

    return data;
}
