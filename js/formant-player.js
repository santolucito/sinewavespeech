/**
 * FormantPlayer - Coordinates data loading and playback
 *
 * Loads formant trajectory data, uses speech synthesis for original audio,
 * and coordinates playback through the AudioEngine.
 */
import { AudioEngine } from './audio-engine.js';
import { PhonemeMapper } from './phoneme-mapper.js';

export class FormantPlayer {
    constructor() {
        this.audioEngine = new AudioEngine();
        this.phonemeMapper = new PhonemeMapper();
        this.utteranceData = null;
        this.currentText = '';
        this.speechSynthesis = window.speechSynthesis;
        this.selectedVoice = null;

        // Expose callbacks
        this.onPlaybackEnd = null;
        this.onProgress = null;
        this.onStateChange = null;

        // Forward events from audio engine
        this.audioEngine.onPlaybackEnd = () => {
            if (this.onPlaybackEnd) this.onPlaybackEnd();
        };

        this.audioEngine.onProgress = (progress, elapsed, duration) => {
            if (this.onProgress) this.onProgress(progress, elapsed, duration);
        };

        // Initialize voices
        this.initVoices();
    }

    /**
     * Initialize speech synthesis voices
     */
    initVoices() {
        const loadVoices = () => {
            const voices = this.speechSynthesis.getVoices();
            // Prefer a clear English voice
            this.selectedVoice = voices.find(v =>
                v.lang.startsWith('en') && v.name.includes('Google')
            ) || voices.find(v =>
                v.lang.startsWith('en-US')
            ) || voices.find(v =>
                v.lang.startsWith('en')
            ) || voices[0];
        };

        loadVoices();
        if (this.speechSynthesis.onvoiceschanged !== undefined) {
            this.speechSynthesis.onvoiceschanged = loadVoices;
        }
    }

    /**
     * Initialize the player
     */
    async init() {
        await this.audioEngine.init();
    }

    /**
     * Generate formant data from text
     * @param {string} text - Text to convert
     */
    generateFromText(text) {
        this.currentText = text;
        const trajectory = this.phonemeMapper.textToTrajectory(text);

        this.utteranceData = {
            id: 'custom',
            transcript: text,
            duration: trajectory.duration,
            formants: trajectory.formants
        };

        if (this.onStateChange) {
            this.onStateChange('generated');
        }

        return this.utteranceData;
    }

    /**
     * Play sinewave speech
     */
    async playSinewave() {
        if (!this.utteranceData) {
            throw new Error('No utterance generated');
        }

        await this.audioEngine.init();
        await this.audioEngine.playSinewave(
            this.utteranceData.formants,
            this.utteranceData.duration
        );

        if (this.onStateChange) {
            this.onStateChange('playing-sinewave');
        }
    }

    /**
     * Play original using speech synthesis
     */
    async playOriginal() {
        if (!this.currentText) {
            throw new Error('No text to speak');
        }

        await this.audioEngine.init();

        // Stop any current playback
        this.speechSynthesis.cancel();

        return new Promise((resolve, reject) => {
            const utterance = new SpeechSynthesisUtterance(this.currentText);

            if (this.selectedVoice) {
                utterance.voice = this.selectedVoice;
            }

            utterance.rate = 0.9;  // Slightly slower for clarity
            utterance.pitch = 1.0;

            // Track progress (approximate)
            const startTime = Date.now();
            const estimatedDuration = this.utteranceData.duration * 1000;

            const progressInterval = setInterval(() => {
                const elapsed = (Date.now() - startTime) / 1000;
                const progress = Math.min(elapsed / this.utteranceData.duration, 0.95);
                if (this.onProgress) {
                    this.onProgress(progress, elapsed, this.utteranceData.duration);
                }
            }, 50);

            utterance.onend = () => {
                clearInterval(progressInterval);
                if (this.onProgress) {
                    this.onProgress(1, this.utteranceData.duration, this.utteranceData.duration);
                }
                if (this.onPlaybackEnd) {
                    this.onPlaybackEnd();
                }
                resolve();
            };

            utterance.onerror = (e) => {
                clearInterval(progressInterval);
                reject(e);
            };

            if (this.onStateChange) {
                this.onStateChange('playing-original');
            }

            this.speechSynthesis.speak(utterance);
        });
    }

    /**
     * Stop playback
     */
    stop() {
        this.audioEngine.stop();
        this.speechSynthesis.cancel();

        if (this.onStateChange) {
            this.onStateChange('stopped');
        }
    }

    /**
     * Set volume
     * @param {number} value - Volume from 0 to 1
     */
    setVolume(value) {
        this.audioEngine.setVolume(value);
    }

    /**
     * Toggle formant
     * @param {string} formant - 'F1', 'F2', or 'F3'
     * @param {boolean} enabled - Whether to enable
     */
    setFormantEnabled(formant, enabled) {
        this.audioEngine.setFormantEnabled(formant, enabled);
    }

    /**
     * Get transcript of current utterance
     */
    getTranscript() {
        return this.currentText;
    }

    /**
     * Get duration of current utterance
     */
    getDuration() {
        return this.utteranceData ? this.utteranceData.duration : 0;
    }

    /**
     * Get formant data for visualization
     */
    getFormantData() {
        return this.utteranceData ? this.utteranceData.formants : null;
    }

    /**
     * Check if currently playing
     */
    isPlaying() {
        return this.audioEngine.isPlaying || this.speechSynthesis.speaking;
    }

    /**
     * Check if utterance is ready
     */
    isReady() {
        return this.utteranceData !== null;
    }
}
