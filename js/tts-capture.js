/**
 * TTSCapture - Captures TTS audio using meSpeak.js
 *
 * meSpeak.js is a JavaScript speech synthesizer that returns audio buffers
 * directly, allowing us to analyze the waveform with LPC.
 */

export class TTSCapture {
    constructor() {
        this.sampleRate = 22050; // meSpeak default sample rate
        this.initialized = false;
        this.initPromise = null;
    }

    /**
     * Initialize meSpeak library
     * @returns {Promise<void>}
     */
    async init() {
        if (this.initialized) return;

        if (this.initPromise) {
            return this.initPromise;
        }

        this.initPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                if (!this.initialized) {
                    reject(new Error('meSpeak failed to initialize - timeout'));
                }
            }, 10000);

            const checkAndInit = () => {
                if (typeof meSpeak === 'undefined') {
                    // meSpeak not loaded yet, wait a bit
                    setTimeout(checkAndInit, 100);
                    return;
                }

                // Check if already configured
                if (meSpeak.isConfigLoaded && meSpeak.isConfigLoaded()) {
                    clearTimeout(timeout);
                    this.initialized = true;
                    resolve();
                    return;
                }

                // Load voice directly (meSpeak 2.0 can load voice without config)
                try {
                    meSpeak.loadVoice('lib/mespeak/voices/en/en-us.json', (success) => {
                        clearTimeout(timeout);
                        if (success) {
                            this.initialized = true;
                            resolve();
                        } else {
                            reject(new Error('Failed to load meSpeak voice'));
                        }
                    });
                } catch (e) {
                    clearTimeout(timeout);
                    reject(new Error('meSpeak initialization error: ' + e.message));
                }
            };

            checkAndInit();
        });

        return this.initPromise;
    }

    /**
     * Synthesize text to audio buffer
     * @param {string} text - Text to synthesize
     * @param {Object} options - Synthesis options
     * @returns {Promise<Float32Array>} Audio samples
     */
    async synthesize(text, options = {}) {
        await this.init();

        return new Promise((resolve, reject) => {
            try {
                // meSpeak options
                const speakOptions = {
                    amplitude: options.amplitude || 100,
                    pitch: options.pitch || 50,
                    speed: options.speed || 150,
                    wordgap: options.wordgap || 0,
                    variant: options.variant || 'm3',
                    rawdata: 'array'  // Return raw audio data as array
                };

                // Generate speech synchronously when rawdata is set
                const result = meSpeak.speak(text, speakOptions);

                if (!result || result.length === 0) {
                    reject(new Error('meSpeak.speak() returned no data'));
                    return;
                }

                // Convert to Float32Array
                // meSpeak returns Uint8Array WAV data when rawdata='array'
                const audioData = this.parseWavToFloat32(result);
                resolve(audioData);

            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Parse WAV byte array to Float32Array of samples
     * @param {Array|Uint8Array} wavData - WAV file data as byte array
     * @returns {Float32Array} Audio samples normalized to [-1, 1]
     */
    parseWavToFloat32(wavData) {
        // Convert to Uint8Array if needed
        const bytes = wavData instanceof Uint8Array ? wavData : new Uint8Array(wavData);

        // WAV header parsing
        // Find 'data' chunk
        let offset = 12; // Skip RIFF header ('RIFF' + size + 'WAVE')
        let dataOffset = 0;
        let dataSize = 0;

        while (offset < bytes.length - 8) {
            const chunkId = String.fromCharCode(
                bytes[offset],
                bytes[offset + 1],
                bytes[offset + 2],
                bytes[offset + 3]
            );

            const chunkSize = bytes[offset + 4] |
                             (bytes[offset + 5] << 8) |
                             (bytes[offset + 6] << 16) |
                             (bytes[offset + 7] << 24);

            if (chunkId === 'fmt ') {
                // Read sample rate from format chunk
                this.sampleRate = bytes[offset + 12] |
                                 (bytes[offset + 13] << 8) |
                                 (bytes[offset + 14] << 16) |
                                 (bytes[offset + 15] << 24);
            }

            if (chunkId === 'data') {
                dataOffset = offset + 8;
                dataSize = chunkSize;
                break;
            }

            offset += 8 + chunkSize;
            // Align to even byte boundary
            if (chunkSize % 2 !== 0) offset++;
        }

        if (dataOffset === 0 || dataSize === 0) {
            throw new Error('Could not find data chunk in WAV');
        }

        // Read samples (assuming 16-bit signed PCM mono)
        const numSamples = Math.floor(dataSize / 2);
        const samples = new Float32Array(numSamples);

        for (let i = 0; i < numSamples; i++) {
            const byteOffset = dataOffset + i * 2;
            // Read 16-bit signed integer (little-endian)
            let sample = bytes[byteOffset] | (bytes[byteOffset + 1] << 8);
            // Convert from unsigned to signed
            if (sample >= 32768) sample -= 65536;
            // Normalize to [-1, 1]
            samples[i] = sample / 32768;
        }

        return samples;
    }

    /**
     * Get the sample rate of generated audio
     * @returns {number} Sample rate in Hz
     */
    getSampleRate() {
        return this.sampleRate;
    }

    /**
     * Check if meSpeak is available and loaded
     * @returns {boolean}
     */
    isReady() {
        return this.initialized && typeof meSpeak !== 'undefined';
    }
}

/**
 * Alternative TTS capture using Web Speech API + MediaRecorder
 * This is a fallback if meSpeak is not available
 */
export class WebSpeechCapture {
    constructor() {
        this.sampleRate = 44100;
        this.audioContext = null;
    }

    /**
     * Initialize audio context
     */
    async init() {
        if (!this.audioContext) {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            this.audioContext = new AudioContextClass();
            this.sampleRate = this.audioContext.sampleRate;
        }
    }

    /**
     * Capture speech synthesis to audio buffer
     * Note: This requires user interaction and may not work in all browsers
     * @param {string} text - Text to synthesize
     * @returns {Promise<Float32Array>} Audio samples
     */
    async synthesize(text) {
        await this.init();

        // This approach uses AudioWorklet or ScriptProcessor to capture
        // the audio output, but it's complex and browser-dependent.
        // For now, return a rejection suggesting meSpeak instead.
        throw new Error(
            'Web Speech API capture not implemented. Please use meSpeak.js for TTS audio capture.'
        );
    }

    getSampleRate() {
        return this.sampleRate;
    }
}
