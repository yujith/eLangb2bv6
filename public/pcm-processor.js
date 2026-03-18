/**
 * AudioWorklet processor for capturing PCM16 audio from the microphone.
 * Runs on the audio rendering thread — replaces deprecated ScriptProcessorNode.
 */
class PCMProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this._buffer = [];
        this._bufferSize = 4096;
    }

    process(inputs) {
        const input = inputs[0];
        if (!input || !input[0]) return true;

        const channelData = input[0];
        for (let i = 0; i < channelData.length; i++) {
            this._buffer.push(channelData[i]);
        }

        while (this._buffer.length >= this._bufferSize) {
            const chunk = this._buffer.splice(0, this._bufferSize);
            const float32 = new Float32Array(chunk);

            // Convert Float32 to PCM16
            const pcm16 = new Int16Array(float32.length);
            for (let i = 0; i < float32.length; i++) {
                const s = Math.max(-1, Math.min(1, float32[i]));
                pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
            }

            this.port.postMessage({ pcm16Buffer: pcm16.buffer }, [pcm16.buffer]);
        }

        return true;
    }
}

registerProcessor('pcm-processor', PCMProcessor);
