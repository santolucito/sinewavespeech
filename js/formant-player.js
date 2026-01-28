/**
 * FormantPlayer - Coordinates data loading and playback
 *
 * Loads formant trajectory data via LPC analysis of TTS audio,
 * and coordinates playback through the AudioEngine.
 */
import { AudioEngine } from './audio-engine.js';
import { PhonemeMapper } from './phoneme-mapper.js';
import { LPCAnalyzer } from './lpc-analyzer.js';
import { TTSCapture } from './tts-capture.js';

export class FormantPlayer {
    constructor() {
        this.audioEngine = new AudioEngine();
        this.phonemeMapper = new PhonemeMapper();
        this.utteranceData = null;
        this.currentText = '';

        // LPC analysis components
        this.ttsCapture = new TTSCapture();
        this.lpcAnalyzer = null;
        this.useLPCAnalysis = true; // Set to false to use phoneme mapping fallback

        // Expose callbacks
        this.onPlaybackEnd = null;
        this.onProgress = null;
        this.onStateChange = null;
        this.onAnalysisStart = null;
        this.onAnalysisComplete = null;

        // Forward events from audio engine
        this.audioEngine.onPlaybackEnd = () => {
            if (this.onPlaybackEnd) this.onPlaybackEnd();
        };

        this.audioEngine.onProgress = (progress, elapsed, duration) => {
            if (this.onProgress) this.onProgress(progress, elapsed, duration);
        };
    }

    /**
     * Initialize the player
     */
    async init() {
        await this.audioEngine.init();

        // Try to initialize TTS capture (meSpeak)
        try {
            await this.ttsCapture.init();
            console.log('TTS capture initialized (meSpeak)');
        } catch (error) {
            console.warn('meSpeak not available, falling back to phoneme mapping:', error.message);
            this.useLPCAnalysis = false;
        }
    }

    /**
     * Generate formant data from text using LPC analysis
     * @param {string} text - Text to convert
     * @returns {Promise<Object>} Utterance data
     */
    async generateFromText(text) {
        this.currentText = text;

        if (this.onAnalysisStart) {
            this.onAnalysisStart();
        }

        try {
            if (this.useLPCAnalysis && this.ttsCapture.isReady()) {
                // Use LPC analysis of TTS audio
                this.utteranceData = await this.generateWithLPC(text);
            } else {
                // Fallback to phoneme mapping
                this.utteranceData = this.generateWithPhonemeMapping(text);
            }

            if (this.onStateChange) {
                this.onStateChange('generated');
            }

            if (this.onAnalysisComplete) {
                this.onAnalysisComplete();
            }

            return this.utteranceData;

        } catch (error) {
            console.error('LPC analysis failed, falling back to phoneme mapping:', error);

            // Fallback to phoneme mapping
            this.utteranceData = this.generateWithPhonemeMapping(text);

            if (this.onStateChange) {
                this.onStateChange('generated');
            }

            if (this.onAnalysisComplete) {
                this.onAnalysisComplete();
            }

            return this.utteranceData;
        }
    }

    /**
     * Generate formant data using LPC analysis of TTS audio
     * @param {string} text - Text to synthesize and analyze
     * @returns {Promise<Object>} Utterance data with formant trajectories
     */
    async generateWithLPC(text) {
        // 1. Synthesize TTS audio
        const ttsSampleRate = this.ttsCapture.getSampleRate();
        const audioBuffer = await this.ttsCapture.synthesize(text);

        // 2. Create LPC analyzer (resamples to 8kHz internally per Dan Ellis method)
        // Parameters: hopSize=256, lpcOrder=12 at 8kHz
        this.lpcAnalyzer = new LPCAnalyzer(8000, 256, 12);

        // 3. Analyze audio - pass original sample rate for internal resampling
        const trajectories = this.lpcAnalyzer.analyze(audioBuffer, ttsSampleRate);

        // 4. Calculate duration from original audio
        const duration = audioBuffer.length / ttsSampleRate;

        // 5. Store original audio for playback
        return {
            id: 'lpc-analyzed',
            transcript: text,
            duration: duration,
            formants: {
                F1: { color: '#e63946', trajectory: trajectories.F1 },
                F2: { color: '#457b9d', trajectory: trajectories.F2 },
                F3: { color: '#2a9d8f', trajectory: trajectories.F3 },
            },
            originalAudio: audioBuffer,
            originalSampleRate: ttsSampleRate,
            analysisMethod: 'lpc'
        };
    }

    /**
     * Generate formant data using phoneme mapping (fallback)
     * @param {string} text - Text to convert
     * @returns {Object} Utterance data
     */
    generateWithPhonemeMapping(text) {
        const trajectory = this.phonemeMapper.textToTrajectory(text);

        return {
            id: 'phoneme-mapped',
            transcript: text,
            duration: trajectory.duration,
            formants: trajectory.formants,
            originalAudio: null,
            originalSampleRate: null,
            analysisMethod: 'phoneme-mapping'
        };
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
     * Play original audio
     * Uses captured TTS buffer if available, otherwise Web Speech API
     */
    async playOriginal() {
        if (!this.currentText) {
            throw new Error('No text to speak');
        }

        await this.audioEngine.init();

        // If we have captured TTS audio, play it directly
        if (this.utteranceData?.originalAudio) {
            // Pass sinewave duration so original playback matches timing
            await this.audioEngine.playOriginalBuffer(
                this.utteranceData.originalAudio,
                this.utteranceData.originalSampleRate,
                this.utteranceData.duration  // Match sinewave timing
            );

            if (this.onStateChange) {
                this.onStateChange('playing-original');
            }
        } else {
            // Fallback to Web Speech API
            await this.playOriginalWebSpeech();
        }
    }

    /**
     * Play original using Web Speech API (fallback)
     */
    async playOriginalWebSpeech() {
        const speechSynthesis = window.speechSynthesis;

        // Stop any current playback
        speechSynthesis.cancel();

        return new Promise((resolve, reject) => {
            const utterance = new SpeechSynthesisUtterance(this.currentText);

            // Find a good voice
            const voices = speechSynthesis.getVoices();
            const selectedVoice = voices.find(v =>
                v.lang.startsWith('en') && v.name.includes('Google')
            ) || voices.find(v =>
                v.lang.startsWith('en-US')
            ) || voices.find(v =>
                v.lang.startsWith('en')
            ) || voices[0];

            if (selectedVoice) {
                utterance.voice = selectedVoice;
            }

            // Calculate speech rate to match sinewave duration
            const charCount = this.currentText.replace(/[^a-zA-Z]/g, '').length;
            const estimatedNaturalDuration = charCount / 12 + 0.3;
            const sinewaveDuration = this.utteranceData?.duration || estimatedNaturalDuration;

            let rate = estimatedNaturalDuration / sinewaveDuration;
            rate = Math.max(0.5, Math.min(1.5, rate));

            utterance.rate = rate;
            utterance.pitch = 1.0;

            // Track progress
            const startTime = Date.now();

            const progressInterval = setInterval(() => {
                const elapsed = (Date.now() - startTime) / 1000;
                const progress = Math.min(elapsed / sinewaveDuration, 0.95);
                if (this.onProgress) {
                    this.onProgress(progress, elapsed, sinewaveDuration);
                }
            }, 50);

            utterance.onend = () => {
                clearInterval(progressInterval);
                if (this.onProgress) {
                    this.onProgress(1, sinewaveDuration, sinewaveDuration);
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

            speechSynthesis.speak(utterance);
        });
    }

    /**
     * Stop playback
     */
    stop() {
        this.audioEngine.stop();
        window.speechSynthesis?.cancel();

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
        return this.audioEngine.isPlaying || window.speechSynthesis?.speaking;
    }

    /**
     * Check if utterance is ready
     */
    isReady() {
        return this.utteranceData !== null;
    }

    /**
     * Check if LPC analysis is being used
     */
    isUsingLPC() {
        return this.useLPCAnalysis && this.ttsCapture.isReady();
    }

    /**
     * Get analysis method used for current utterance
     */
    getAnalysisMethod() {
        return this.utteranceData?.analysisMethod || 'none';
    }
}
