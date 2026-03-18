/**
 * Audio Engine – Handles TTS audio generation with hash-based caching.
 * Biggest cost saver: audio is generated ONCE and reused forever.
 */

import { supabase } from './supabase';
import { generateTTSAudio } from './aiService';

const LISTENING_VOICES = {
    examiner_female: 'EXAVITQu4vr4xnSDxMaL',
    examiner_male: 'ErXwobaYiN019PkySvjV',
    passage_female_primary: '21m00Tcm4TlvDq8ikWAM',
    passage_female_secondary: 'AZnzlk1XvdvUeBnXmlld',
    passage_male_primary: 'TxGEqnHWrfWFTfGW9XjX',
    passage_male_secondary: 'VR6AewLTigWG4xSOukaG',
};

function isExaminerLikeSpeaker(label = '') {
    const normalized = label.toLowerCase();
    return normalized.includes('narrator')
        || normalized.includes('examiner')
        || normalized.includes('instructions')
        || normalized.includes('test voice')
        || normalized.includes('speaker');
}

function inferGenderFromLabel(label = '') {
    const normalized = label.toLowerCase();
    if (normalized.includes('(female)')) return 'female';
    if (normalized.includes('(male)')) return 'male';
    return 'unknown';
}

export function parseListeningScript(scriptText = '') {
    const lines = scriptText
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean);
    const segments = [];
    let current = null;

    for (const line of lines) {
        const match = line.match(/^([^:]+):\s*(.+)$/);
        if (match) {
            if (current?.text) {
                segments.push({
                    ...current,
                    text: current.text.trim(),
                });
            }
            const speakerLabel = match[1].trim();
            current = {
                speakerLabel,
                speakerName: speakerLabel.replace(/\s*\((female|male)\)\s*/i, '').trim(),
                gender: inferGenderFromLabel(speakerLabel),
                text: match[2].trim(),
            };
        } else if (current) {
            current.text += ` ${line}`;
        } else {
            current = {
                speakerLabel: 'NARRATOR',
                speakerName: 'NARRATOR',
                gender: 'unknown',
                text: line,
            };
        }
    }

    if (current?.text) {
        segments.push({
            ...current,
            text: current.text.trim(),
        });
    }

    return segments.filter(segment => segment.text);
}

export function assignVoicesToSegments(scriptText = '') {
    const segments = parseListeningScript(scriptText);
    const speakerVoiceMap = new Map();
    let femaleCount = 0;
    let maleCount = 0;

    return segments.map(segment => {
        const key = segment.speakerLabel;
        if (!speakerVoiceMap.has(key)) {
            let voiceId = LISTENING_VOICES.passage_male_primary;
            if (isExaminerLikeSpeaker(segment.speakerLabel)) {
                voiceId = segment.gender === 'male'
                    ? LISTENING_VOICES.examiner_male
                    : LISTENING_VOICES.examiner_female;
            } else if (segment.gender === 'female') {
                voiceId = femaleCount === 0
                    ? LISTENING_VOICES.passage_female_primary
                    : LISTENING_VOICES.passage_female_secondary;
                femaleCount += 1;
            } else if (segment.gender === 'male') {
                voiceId = maleCount === 0
                    ? LISTENING_VOICES.passage_male_primary
                    : LISTENING_VOICES.passage_male_secondary;
                maleCount += 1;
            } else {
                voiceId = speakerVoiceMap.size % 2 === 0
                    ? LISTENING_VOICES.passage_female_primary
                    : LISTENING_VOICES.passage_male_primary;
            }
            speakerVoiceMap.set(key, voiceId);
        }

        return {
            ...segment,
            voiceId: speakerVoiceMap.get(key),
        };
    });
}

// ========================================
// Audio Hash Generation
// ========================================

async function generateAudioHash(scriptText, voiceId, speed, settings = {}) {
    const input = `${scriptText}|${voiceId}|${speed}|${JSON.stringify(settings)}`;

    // Try Web Crypto API first (only available in secure contexts / HTTPS)
    if (typeof crypto !== 'undefined' && crypto.subtle) {
        try {
            const encoder = new TextEncoder();
            const data = encoder.encode(input);
            const hashBuffer = await crypto.subtle.digest('SHA-256', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        } catch (error) {
            console.warn('crypto.subtle.digest failed, using fallback hash:', error);
        }
    }

    // Simple fallback hash for non-secure contexts (HTTP)
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (let i = 0; i < input.length; i++) {
        const ch = input.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    const hash = (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
    return hash;
}

// ========================================
// Get or Create Audio (Hash-based Caching)
// ========================================

/**
 * Check if audio already exists for this exact script+voice+speed combination.
 * If yes → return cached URL (no TTS cost)
 * If no → generate via TTS, store in Supabase Storage, cache forever
 */
export async function getOrCreateAudio({
    scriptText,
    contentItemId,
    voiceId = 'pNInz6obpgDQGcFmaJgB', // Default ElevenLabs voice (Adam)
    speed = 1.0,
    settings = {},
    organizationId = null,
}) {
    const assignedSegments = assignVoicesToSegments(scriptText);
    const uniqueSpeakers = new Set(assignedSegments.map(segment => segment.speakerLabel)).size;
    const primaryVoiceId = assignedSegments[0]?.voiceId || voiceId;

    if (assignedSegments.length > 1 && uniqueSpeakers > 1) {
        const estimatedDuration = Math.round((scriptText.split(/\s+/).length / 150) * 60 / speed);
        return {
            audioUrl: null,
            duration: estimatedDuration,
            wasReused: false,
            useSegmentedAudio: true,
            audioSegments: assignedSegments,
        };
    }

    // Step 1: Generate deterministic hash
    const audioHash = await generateAudioHash(scriptText, primaryVoiceId, speed, settings);

    // Step 2: Check if audio already exists in Supabase Storage
    const { data: existing } = await supabase
        .from('global_listening_audio')
        .select('*')
        .eq('audio_hash', audioHash)
        .maybeSingle();

    if (existing) {
        // Use signed URL instead of public URL (works even if bucket isn't public)
        const filePath = `listening/${audioHash}.mp3`;
        try {
            const { data: signedData, error: signedErr } = await supabase.storage
                .from('audio')
                .createSignedUrl(filePath, 3600);

            if (!signedErr && signedData?.signedUrl) {
                // Log as cache hit
                await supabase.from('ai_usage_log').insert({
                    organization_id: organizationId,
                    module: 'listening',
                    action: 'tts_generation',
                    tokens_used: 0,
                    cost_estimate: 0,
                    was_cache_hit: true,
                });

                console.log('[AudioEngine] Cache hit, using signed URL');
                return {
                    audioUrl: signedData.signedUrl,
                    duration: existing.duration_seconds,
                    wasReused: true,
                };
            } else {
                console.warn('[AudioEngine] Signed URL failed for cached entry, regenerating:', signedErr);
                await supabase.from('global_listening_audio').delete().eq('id', existing.id);
            }
        } catch (err) {
            console.warn('[AudioEngine] Cache retrieval failed, regenerating:', err.message);
            try {
                await supabase.from('global_listening_audio').delete().eq('id', existing.id);
            } catch (_) {
            }
        }
    }

    // Step 3: Generate new audio via ElevenLabs (with browser TTS fallback)
    try {
        console.log('[AudioEngine] Generating new audio via ElevenLabs...');
        const audioBlob = await generateTTSAudio(scriptText, primaryVoiceId, speed);

        // If browser TTS fallback was used, return special marker
        if (audioBlob === '__browser_tts__') {
            return {
                audioUrl: null,
                duration: Math.round((scriptText.split(/\s+/).length / 150) * 60 / speed),
                wasReused: false,
                useBrowserTTS: true,
            };
        }

        console.log('[AudioEngine] ElevenLabs returned blob:', audioBlob.type, audioBlob.size, 'bytes');

        // Create a local blob URL for immediate playback (most reliable)
        const blobUrl = URL.createObjectURL(audioBlob);

        // Step 4: Upload to Supabase Storage in background (for caching)
        const fileName = `listening/${audioHash}.mp3`;
        const wordCount = scriptText.split(/\s+/).length;
        const estimatedDuration = Math.round((wordCount / 150) * 60 / speed);

        // Fire-and-forget: upload & cache metadata in background
        (async () => {
            try {
                const { error: uploadError } = await supabase.storage
                    .from('audio')
                    .upload(fileName, audioBlob, {
                        contentType: 'audio/mpeg',
                        upsert: true,
                    });

                if (uploadError) {
                    console.warn('[AudioEngine] Background upload error (non-fatal):', uploadError);
                    return;
                }

                // Cache audio metadata
                await supabase
                    .from('global_listening_audio')
                    .insert({
                        content_item_id: contentItemId,
                        audio_url: fileName, // Store file path; signed URL generated on retrieval
                        voice_id: primaryVoiceId,
                        speed,
                        settings,
                        audio_hash: audioHash,
                        duration_seconds: estimatedDuration,
                        file_size_bytes: audioBlob.size,
                    })
                    .select()
                    .single();

                console.log('[AudioEngine] Audio cached to Supabase Storage');
            } catch (bgErr) {
                console.warn('[AudioEngine] Background caching failed (non-fatal):', bgErr);
            }

            // Log TTS generation cost
            const charCount = scriptText.length;
            const ttsCost = (charCount / 1000) * 0.30;
            try {
                await supabase.from('ai_usage_log').insert({
                    organization_id: organizationId,
                    module: 'listening',
                    action: 'tts_generation',
                    tokens_used: charCount,
                    cost_estimate: ttsCost,
                    was_cache_hit: false,
                });
            } catch (_) {
            }
        })();

        // Return blob URL immediately for playback
        return {
            audioUrl: blobUrl,
            duration: estimatedDuration,
            wasReused: false,
        };
    } catch (error) {
        console.error('[AudioEngine] TTS generation failed:', error);
        // Final fallback: use browser TTS
        return {
            audioUrl: null,
            duration: Math.round((scriptText.split(/\s+/).length / 150) * 60 / speed),
            wasReused: false,
            useBrowserTTS: true,
        };
    }
}

// ========================================
// Get Existing Audio for Content Item
// ========================================

export async function getAudioForContent(contentItemId) {
    const { data } = await supabase
        .from('global_listening_audio')
        .select('*')
        .eq('content_item_id', contentItemId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    return data;
}

// ========================================
// Audio Playback URL with Signed Access
// ========================================

export async function getSignedAudioUrl(filePath, expiresIn = 3600) {
    const { data, error } = await supabase.storage
        .from('audio')
        .createSignedUrl(filePath, expiresIn);

    if (error) {
        console.error('Error creating signed URL:', error);
        return null;
    }

    return data.signedUrl;
}
