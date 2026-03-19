/**
 * Realtime Speaking – Manages WebSocket connection to OpenAI Realtime API
 * for the IELTS Speaking test simulator.
 *
 * Uses the OpenAI Realtime API (WebRTC or WebSocket) for speech-to-speech.
 * For MVP, we use a direct client-side WebSocket connection.
 */

import { generateExaminerInstructions } from './speakingInstructions';

const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;
const REALTIME_MODEL = import.meta.env.VITE_OPENAI_REALTIME_MODEL || 'gpt-4o-realtime-preview-2024-12-17';

/**
 * @typedef {Object} RealtimeSession
 * @property {WebSocket} ws
 * @property {MediaRecorder} recorder
 * @property {MediaStream} stream
 * @property {AudioContext} audioCtx
 * @property {function} disconnect
 */

/**
 * Create and manage a realtime speaking session.
 * @param {Object} callbacks
 * @param {function} callbacks.onStageChange - (stage: string) => void
 * @param {function} callbacks.onTranscriptUpdate - (entry: {role, text, timestamp, part}) => void
 * @param {function} callbacks.onAudioResponse - (audioBlob: Blob) => void
 * @param {function} callbacks.onError - (error: Error) => void
 * @param {function} callbacks.onSessionEnd - () => void
 * @param {function} callbacks.onAgentSpeaking - (isSpeaking: boolean) => void
 * @returns {RealtimeSession}
 */
export function createRealtimeSession(callbacks = {}) {
    let ws = null;
    let mediaStream = null;
    let mediaRecorder = null;
    let audioContext = null;
    let processorNode = null;
    let sourceNode = null;
    let fullRecordingChunks = [];
    let partRecordings = { part1: [], part2: [], part2_followup: [], part3: [] };
    let currentPart = 'part1';
    let transcript = [];
    let isConnected = false;
    let isAgentSpeaking = false;
    let isMuted = false;
    let isResponsePending = false;
    let sessionTimerHandle = null;

    // Max session duration (20 minutes) to prevent runaway resource usage
    const MAX_SESSION_DURATION_MS = 20 * 60 * 1000;
    // Max recording chunks to cap memory usage
    const MAX_CHUNKS_PER_PART = 600;

    // Audio playback context for examiner responses
    let playbackCtx = null;
    let gainNode = null;
    let nextPlayTime = 0;
    let sessionConfig = callbacks.sessionConfig || null;

    const ensurePlaybackCtx = () => {
        if (!playbackCtx || playbackCtx.state === 'closed') {
            playbackCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
            gainNode = playbackCtx.createGain();
            gainNode.gain.value = 1.0;
            gainNode.connect(playbackCtx.destination);
            nextPlayTime = 0;
        }
        if (playbackCtx.state === 'suspended') {
            playbackCtx.resume();
        }
        return playbackCtx;
    };

    /**
     * Connect to the OpenAI Realtime API and start the session.
     */
    const connect = async () => {
        if (!OPENAI_API_KEY) {
            callbacks.onError?.(new Error('OpenAI API key not configured. Set VITE_OPENAI_API_KEY in your .env file.'));
            return;
        }

        try {
            // Get microphone access
            mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    sampleRate: 24000,
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true,
                },
            });

            // Set up AudioContext for PCM16 encoding
            audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
            sourceNode = audioContext.createMediaStreamSource(mediaStream);

            // Full session recorder for playback
            mediaRecorder = new MediaRecorder(mediaStream, { mimeType: 'audio/webm' });
            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    fullRecordingChunks.push(e.data);
                    // Cap per-part chunks to prevent unbounded memory growth
                    if (partRecordings[currentPart] && partRecordings[currentPart].length < MAX_CHUNKS_PER_PART) {
                        partRecordings[currentPart].push(e.data);
                    }
                }
            };
            mediaRecorder.start(1000); // chunk every second

            // Connect WebSocket
            ws = new WebSocket(
                `wss://api.openai.com/v1/realtime?model=${REALTIME_MODEL}`,
                ['realtime', `openai-insecure-api-key.${OPENAI_API_KEY}`, 'openai-beta.realtime-v1']
            );

            // Generate fresh randomized instructions for this session
            sessionConfig = sessionConfig || generateExaminerInstructions();
            const sessionInstructions = sessionConfig.instructions;
            console.log('[Realtime] Session topics:', {
                part1: sessionConfig.part1Topics,
                part2: sessionConfig.part2Topic,
                part3: sessionConfig.part3Themes,
            });

            ws.onopen = () => {
                isConnected = true;
                // Configure session with randomized instructions
                ws.send(JSON.stringify({
                    type: 'session.update',
                    session: {
                        modalities: ['text', 'audio'],
                        instructions: sessionInstructions,
                        voice: 'alloy',
                        input_audio_format: 'pcm16',
                        output_audio_format: 'pcm16',
                        input_audio_transcription: {
                            model: 'whisper-1',
                        },
                        turn_detection: {
                            type: 'server_vad',
                            threshold: 0.6,
                            prefix_padding_ms: 300,
                            silence_duration_ms: 4860,
                        },
                    },
                }));

                // Start the conversation - examiner begins
                ws.send(JSON.stringify({
                    type: 'response.create',
                    response: {
                        modalities: ['text', 'audio'],
                        instructions: 'Begin the IELTS Speaking test. Start with Part 1: introduce yourself as examiner Sarah and ask the candidate their name. Ask ONE question at a time and wait for the candidate to respond before asking the next question.',
                    },
                }));

                // Safety timeout to end session after max duration
                sessionTimerHandle = setTimeout(() => {
                    console.warn('[Realtime] Max session duration reached, ending session.');
                    endSession();
                }, MAX_SESSION_DURATION_MS);

                callbacks.onStageChange?.('part1');
            };

            ws.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    handleServerMessage(msg);
                } catch (err) {
                    console.error('[Realtime] Failed to parse message:', err);
                }
            };

            ws.onerror = (event) => {
                console.error('[Realtime] WebSocket error:', event);
                isConnected = false;
                cleanupAudio();
                callbacks.onError?.(new Error('WebSocket connection error. Check your API key and network.'));
            };

            ws.onclose = (event) => {
                isConnected = false;
                if (event.code !== 1000) {
                    console.warn('[Realtime] WebSocket closed:', event.code, event.reason);
                }
            };

            // Start sending audio via AudioWorklet (or ScriptProcessor fallback)
            await startAudioStreaming();

            // Add a small delay before allowing mic input so examiner intro plays first
            isMuted = true;
            setTimeout(() => { isMuted = false; }, 1000);

        } catch (err) {
            callbacks.onError?.(err);
        }
    };

    /**
     * Stream microphone audio as PCM16 to the WebSocket.
     */
    /**
     * Mute/unmute the mic input to the WebSocket.
     * Used to prevent echo loops when agent is speaking and during Part 2 prep.
     */
    const setMuted = (muted) => {
        isMuted = muted;
    };

    /**
     * Send a PCM16 buffer (ArrayBuffer) to the WebSocket as base64.
     */
    const sendPCM16 = (pcm16Buffer) => {
        if (!isConnected || !ws || ws.readyState !== WebSocket.OPEN) return;
        if (isAgentSpeaking || isMuted) return;

        const bytes = new Uint8Array(pcm16Buffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        const base64Audio = btoa(binary);

        ws.send(JSON.stringify({
            type: 'input_audio_buffer.append',
            audio: base64Audio,
        }));
    };

    const startAudioStreaming = async () => {
        // Prefer AudioWorkletNode (modern, no deprecation warnings).
        // Fall back to ScriptProcessorNode if AudioWorklet is unavailable.
        if (audioContext.audioWorklet) {
            try {
                await audioContext.audioWorklet.addModule('/pcm-processor.js');
                processorNode = new AudioWorkletNode(audioContext, 'pcm-processor');
                processorNode.port.onmessage = (e) => {
                    if (e.data?.pcm16Buffer) {
                        sendPCM16(e.data.pcm16Buffer);
                    }
                };
                sourceNode.connect(processorNode);
                processorNode.connect(audioContext.destination);
                return;
            } catch (err) {
                console.warn('[Realtime] AudioWorklet failed, falling back to ScriptProcessor:', err.message);
            }
        }

        // Fallback: ScriptProcessorNode (deprecated but widely supported)
        const bufferSize = 4096;
        processorNode = audioContext.createScriptProcessor(bufferSize, 1, 1);

        processorNode.onaudioprocess = (e) => {
            if (!isConnected || !ws || ws.readyState !== WebSocket.OPEN) return;
            if (isAgentSpeaking || isMuted) return;

            const inputData = e.inputBuffer.getChannelData(0);
            const pcm16 = new Int16Array(inputData.length);
            for (let i = 0; i < inputData.length; i++) {
                const s = Math.max(-1, Math.min(1, inputData[i]));
                pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
            }
            sendPCM16(pcm16.buffer);
        };

        sourceNode.connect(processorNode);
        processorNode.connect(audioContext.destination);
    };

    /**
     * Handle messages from the OpenAI Realtime API server.
     */
    const handleServerMessage = (msg) => {
        switch (msg.type) {
            case 'session.created':
            case 'session.updated':
                // Session ready
                break;

            case 'response.created':
                isResponsePending = true;
                break;

            case 'response.audio.delta':
                // Examiner audio chunk - queue for playback
                if (msg.delta) {
                    if (!isAgentSpeaking) {
                        isAgentSpeaking = true;
                        callbacks.onAgentSpeaking?.(true);
                    }
                    playAudioDelta(msg.delta);
                }
                break;

            case 'response.audio.done':
                // Add a brief delay before unmuting mic to let echo dissipate
                isAgentSpeaking = false;
                callbacks.onAgentSpeaking?.(false);
                break;

            case 'response.audio_transcript.delta':
                // Examiner text transcript delta — accumulate
                break;

            case 'response.audio_transcript.done':
                if (msg.transcript) {
                    const entry = {
                        role: 'examiner',
                        text: msg.transcript,
                        timestamp: new Date().toISOString(),
                        part: currentPart,
                    };
                    transcript.push(entry);
                    callbacks.onTranscriptUpdate?.(entry);

                    // Detect stage transitions from examiner speech
                    detectStageTransition(msg.transcript);
                }
                break;

            case 'conversation.item.input_audio_transcription.completed':
                if (msg.transcript) {
                    const entry = {
                        role: 'candidate',
                        text: msg.transcript,
                        timestamp: new Date().toISOString(),
                        part: currentPart,
                    };
                    transcript.push(entry);
                    callbacks.onTranscriptUpdate?.(entry);
                }
                break;

            case 'response.done':
                isResponsePending = false;
                // Check if the test has ended
                if (msg.response?.output) {
                    const lastText = msg.response.output
                        .map(o => o.content?.map(c => c.transcript || c.text || '').join('') || '')
                        .join('');
                    if (lastText.toLowerCase().includes('end of the speaking test')) {
                        setTimeout(() => {
                            endSession();
                        }, 2000);
                    }
                }
                break;

            case 'input_audio_buffer.speech_started':
                // If a response is currently being generated, cancel it to prevent overlap
                if (isResponsePending && ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'response.cancel' }));
                }
                break;

            case 'error': {
                const errCode = msg.error?.code || '';
                const errMsg = msg.error?.message || 'Realtime API error';
                // Benign errors that should NOT kill the session
                const benignCodes = [
                    'response_cancel_not_active',
                    'response_already_in_progress',
                ];
                if (benignCodes.includes(errCode)) {
                    console.warn('[Realtime] Non-fatal server error (ignored):', errCode, errMsg);
                } else {
                    console.error('[Realtime] Server error:', msg.error);
                    callbacks.onError?.(new Error(errMsg));
                }
                break;
            }

            default:
                // Other events (rate_limits, etc.)
                break;
        }
    };

    /**
     * Play a base64-encoded PCM16 audio chunk through the speakers.
     * Chunks are scheduled sequentially to prevent overlap / muffled audio.
     */
    const playAudioDelta = (base64Audio) => {
        try {
            const ctx = ensurePlaybackCtx();
            const binaryString = atob(base64Audio);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }

            // Convert PCM16 to Float32
            const pcm16 = new Int16Array(bytes.buffer);
            const float32 = new Float32Array(pcm16.length);
            for (let i = 0; i < pcm16.length; i++) {
                float32[i] = pcm16[i] / 32768.0;
            }

            const audioBuffer = ctx.createBuffer(1, float32.length, 24000);
            audioBuffer.getChannelData(0).set(float32);

            const source = ctx.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(gainNode || ctx.destination);

            // Schedule this chunk after the previous one ends
            const startTime = Math.max(ctx.currentTime, nextPlayTime);
            source.start(startTime);
            nextPlayTime = startTime + audioBuffer.duration;
        } catch (err) {
            console.error('[Realtime] Audio playback error:', err);
        }
    };

    /**
     * Detect stage transitions based on examiner speech content.
     */
    const detectStageTransition = (text) => {
        const lower = text.toLowerCase();
        if (currentPart === 'part1' && (lower.includes('move on to part 2') || lower.includes('move on to part two'))) {
            currentPart = 'part2_prep';
            // Mute mic immediately so the AI doesn't hear anything during prep
            isMuted = true;
            callbacks.onStageChange?.('part2_prep');
        } else if (currentPart === 'part2_prep' && (lower.includes('please begin') || lower.includes('start speaking'))) {
            // Ignore auto-detection during prep — the client-side timer handles the transition
            // This prevents the AI from skipping prep time
            return;
        } else if (currentPart === 'part2' && (lower.includes("we'll now move on to part 3") || lower.includes('we will now move on to part 3') || lower.includes('move on to part 3'))) {
            // If AI tries to skip straight to Part 3 during Part 2, route through follow-up first
            currentPart = 'part2_followup';
            isMuted = false;
            callbacks.onStageChange?.('part2_followup');
        } else if (currentPart === 'part2_followup' && (lower.includes("we'll now move on to part 3") || lower.includes('we will now move on to part 3') || lower.includes('move on to part 3'))) {
            currentPart = 'part3';
            isMuted = false;
            callbacks.onStageChange?.('part3');
        } else if (currentPart === 'part3' && lower.includes('end of the speaking test')) {
            currentPart = 'finished';
            callbacks.onStageChange?.('finished');
        }
    };

    /**
     * Manually advance to next part (for fallback / user control).
     */
    const advancePart = (toPart) => {
        currentPart = toPart;
        callbacks.onStageChange?.(toPart);

        if (toPart === 'part2_prep') {
            // MUTE mic during Part 2 prep so the AI doesn't hear anything and
            // the student gets a genuine 60-second silent prep window.
            isMuted = true;

            // Tell the model to present the cue card, then we handle the timer client-side.
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'response.create',
                    response: {
                        modalities: ['text', 'audio'],
                        instructions: `Now transition to Part 2. Read the following cue card aloud EXACTLY as written, line by line. Do not summarize, rephrase, simplify, or replace any bullet point. Read the title and every line under "You should say:" exactly.

CUE CARD START
${sessionConfig?.cueCardText || 'Describe a memorable experience from your life.\n\nYou should say:\n• What the experience was\n• When it happened\n• Who was involved\n• And explain why it was memorable'}
CUE CARD END

After reading the full cue card exactly, tell the candidate they have one minute to prepare. After you finish presenting the cue card, DO NOT speak again until told to. The system will handle the preparation timer.`,
                    },
                }));
            }
            return;
        }

        if (toPart === 'part2') {
            // Unmute mic — prep time is over, student should now speak
            isMuted = false;
        }

        if (toPart === 'part2_followup') {
            // Unmute mic for follow-up Q&A
            isMuted = false;
        }

        if (ws && ws.readyState === WebSocket.OPEN) {
            const instructions = {
                part2: 'The preparation time is now over. Say exactly: "All right, please begin speaking." Then remain silent while the candidate answers. If they pause briefly, do not interrupt. Only use a short prompt such as "Is there anything else you would like to add?" if they appear fully finished. Do NOT move to Part 3 yet.',
                part2_followup: 'Thank the candidate for their response. Ask only ONE brief follow-up question at a time related to the Part 2 topic. After each follow-up question, STOP and wait patiently for a full answer. Do not speak again after a short pause. Allow substantial thinking time before speaking again. Only after the first follow-up answer is complete may you ask a second brief follow-up question. When both follow-ups are complete, say "We\'ll now move on to Part 3."',
                part3: 'Now move on to Part 3. Ask ONE abstract discussion question at a time related to the Part 2 topic, and wait patiently for the candidate to respond before asking the next question. Do not rush the candidate after short pauses.',
                finished: 'End the speaking test. Thank the candidate and tell them the test is now complete.',
            };

            if (instructions[toPart]) {
                ws.send(JSON.stringify({
                    type: 'response.create',
                    response: {
                        modalities: ['text', 'audio'],
                        instructions: instructions[toPart],
                    },
                }));
            }
        }
    };

    /**
     * Clean up audio resources (mic, processor) without ending the full session.
     */
    const cleanupAudio = () => {
        if (processorNode) {
            try { processorNode.disconnect(); } catch (_) {}
            processorNode = null;
        }
        if (sourceNode) {
            try { sourceNode.disconnect(); } catch (_) {}
            sourceNode = null;
        }
        if (audioContext && audioContext.state !== 'closed') {
            audioContext.close().catch(() => {});
            audioContext = null;
        }
        if (mediaStream) {
            mediaStream.getTracks().forEach(t => t.stop());
            mediaStream = null;
        }
    };

    /**
     * End the session and clean up resources.
     */
    const endSession = () => {
        if (!isConnected && !ws) return; // Prevent double-cleanup
        isConnected = false;
        isAgentSpeaking = false;
        isMuted = true;

        // Clear session timeout
        if (sessionTimerHandle) {
            clearTimeout(sessionTimerHandle);
            sessionTimerHandle = null;
        }

        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            try { mediaRecorder.stop(); } catch (_) {}
        }

        cleanupAudio();

        if (ws) {
            try {
                if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
                    ws.close(1000, 'Session ended');
                }
            } catch (_) {}
            ws = null;
        }

        if (playbackCtx && playbackCtx.state !== 'closed') {
            playbackCtx.close().catch(() => {});
            playbackCtx = null;
            gainNode = null;
        }

        nextPlayTime = 0;

        // Release memory held by recording chunks
        fullRecordingChunks = [];

        callbacks.onSessionEnd?.();
    };

    /**
     * Get all recorded audio blobs.
     */
    const getRecordings = () => {
        const fullBlob = fullRecordingChunks.length > 0
            ? new Blob(fullRecordingChunks, { type: 'audio/webm' })
            : null;

        const parts = {};
        for (const [key, chunks] of Object.entries(partRecordings)) {
            if (chunks.length > 0) {
                parts[key] = new Blob(chunks, { type: 'audio/webm' });
            }
        }

        return { fullRecording: fullBlob, partRecordings: parts };
    };

    /**
     * Get the full transcript.
     */
    const getTranscript = () => [...transcript];

    /**
     * Get the current stage.
     */
    const getCurrentPart = () => currentPart;

    return {
        connect,
        disconnect: endSession,
        advancePart,
        setMuted,
        getRecordings,
        getTranscript,
        getCurrentPart,
        getSessionConfig: () => sessionConfig,
    };
}
