/**
 * AudioEngine - WebAudio synthesis engine for sinewave speech
 *
 * Manages 3 oscillators tracking formant frequencies (F1, F2, F3)
 * and handles original audio playback.
 */
export class AudioEngine {
    constructor() {
        this.audioContext = null;
        this.masterGain = null;
        this.oscillators = {};
        this.oscillatorGains = {};
        this.formantMuted = { F1: false, F2: false, F3: false };
        this.originalBuffer = null;
        this.originalSource = null;
        this.originalGain = null;
        this.isPlaying = false;
        this.playbackStartTime = 0;
        this.currentDuration = 0;
        this.onPlaybackEnd = null;
        this.onProgress = null;
        this.progressInterval = null;
    }

    /**
     * Initialize the AudioContext (must be called on user gesture)
     */
    async init() {
        if (this.audioContext) {
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }
            return;
        }

        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        this.audioContext = new AudioContextClass();

        // Create master gain node
        this.masterGain = this.audioContext.createGain();
        this.masterGain.connect(this.audioContext.destination);
        this.masterGain.gain.value = 0.3;  // Lower default to prevent clipping with 3 oscillators

        // Create gain node for original audio (separate path)
        this.originalGain = this.audioContext.createGain();
        this.originalGain.connect(this.audioContext.destination);
        this.originalGain.gain.value = 0.7;
    }

    /**
     * Load original audio file
     * @param {string} url - URL to the audio file
     */
    async loadOriginalAudio(url) {
        await this.init();

        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        this.originalBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
    }

    /**
     * Set master volume
     * @param {number} value - Volume from 0 to 1
     */
    setVolume(value) {
        if (this.masterGain) {
            // Scale down for sinewave to prevent clipping
            this.masterGain.gain.value = value * 0.4;
        }
        if (this.originalGain) {
            this.originalGain.gain.value = value;
        }
    }

    /**
     * Toggle a specific formant on/off
     * @param {string} formant - 'F1', 'F2', or 'F3'
     * @param {boolean} enabled - Whether the formant should be audible
     */
    setFormantEnabled(formant, enabled) {
        this.formantMuted[formant] = !enabled;

        if (this.oscillatorGains[formant]) {
            // If currently playing, smoothly transition the gain
            const gain = this.oscillatorGains[formant];
            const now = this.audioContext.currentTime;
            gain.gain.cancelScheduledValues(now);
            gain.gain.setValueAtTime(gain.gain.value, now);
            gain.gain.linearRampToValueAtTime(enabled ? 1 : 0, now + 0.05);
        }
    }

    /**
     * Create oscillators for sinewave playback
     * @param {Object} formantsData - Object with F1, F2, F3 trajectory data
     */
    createOscillators(formantsData) {
        // Clean up any existing oscillators
        this.stopOscillators();

        for (const [formant, data] of Object.entries(formantsData)) {
            // Create oscillator
            const oscillator = this.audioContext.createOscillator();
            oscillator.type = 'sine';

            // Create gain node for this formant - start at 0, trajectory will control
            const gainNode = this.audioContext.createGain();
            gainNode.gain.value = 0;

            // Connect: oscillator → formant gain → master gain
            oscillator.connect(gainNode);
            gainNode.connect(this.masterGain);

            this.oscillators[formant] = oscillator;
            this.oscillatorGains[formant] = gainNode;
        }
    }

    /**
     * Schedule formant trajectory on oscillators
     * @param {Object} formantsData - Object with F1, F2, F3 trajectory data
     * @param {number} startTime - AudioContext time to start playback
     */
    scheduleFormantTrajectory(formantsData, startTime) {
        for (const [formant, data] of Object.entries(formantsData)) {
            const oscillator = this.oscillators[formant];
            const gainNode = this.oscillatorGains[formant];
            const trajectory = data.trajectory;

            if (!trajectory || trajectory.length === 0) continue;

            // Mute multiplier (0 if muted, 1 if not)
            const muteMultiplier = this.formantMuted[formant] ? 0 : 1;

            // Schedule frequency and amplitude changes
            for (let i = 0; i < trajectory.length; i++) {
                const point = trajectory[i];
                const time = startTime + point.t;
                const amp = point.amp * muteMultiplier;

                if (i === 0) {
                    // Set initial values
                    oscillator.frequency.setValueAtTime(point.freq, time);
                    gainNode.gain.setValueAtTime(amp, time);
                } else {
                    // Ramp to next value
                    oscillator.frequency.linearRampToValueAtTime(point.freq, time);
                    gainNode.gain.linearRampToValueAtTime(amp, time);
                }
            }
        }
    }

    /**
     * Play sinewave speech
     * @param {Object} formantsData - Object with F1, F2, F3 trajectory data
     * @param {number} duration - Duration in seconds
     */
    async playSinewave(formantsData, duration) {
        await this.init();

        if (this.isPlaying) {
            this.stop();
        }

        this.createOscillators(formantsData);

        const startTime = this.audioContext.currentTime + 0.05;
        this.playbackStartTime = startTime;
        this.currentDuration = duration;

        this.scheduleFormantTrajectory(formantsData, startTime);

        // Start all oscillators
        for (const oscillator of Object.values(this.oscillators)) {
            oscillator.start(startTime);
            oscillator.stop(startTime + duration);
        }

        this.isPlaying = true;
        this.startProgressTracking(duration);

        // Schedule end callback
        const endTime = (startTime + duration - this.audioContext.currentTime) * 1000;
        setTimeout(() => {
            this.handlePlaybackEnd();
        }, endTime);
    }

    /**
     * Play original audio
     */
    async playOriginal() {
        await this.init();

        if (this.isPlaying) {
            this.stop();
        }

        if (!this.originalBuffer) {
            throw new Error('Original audio not loaded');
        }

        this.originalSource = this.audioContext.createBufferSource();
        this.originalSource.buffer = this.originalBuffer;
        this.originalSource.connect(this.originalGain);

        const startTime = this.audioContext.currentTime + 0.05;
        this.playbackStartTime = startTime;
        this.currentDuration = this.originalBuffer.duration;

        this.originalSource.start(startTime);
        this.isPlaying = true;
        this.startProgressTracking(this.originalBuffer.duration);

        this.originalSource.onended = () => {
            this.handlePlaybackEnd();
        };
    }

    /**
     * Stop all playback
     */
    stop() {
        this.stopOscillators();
        this.stopOriginal();
        this.stopProgressTracking();
        this.isPlaying = false;
    }

    /**
     * Stop oscillators
     */
    stopOscillators() {
        for (const oscillator of Object.values(this.oscillators)) {
            try {
                oscillator.stop();
                oscillator.disconnect();
            } catch (e) {
                // Oscillator may already be stopped
            }
        }
        for (const gain of Object.values(this.oscillatorGains)) {
            gain.disconnect();
        }
        this.oscillators = {};
        this.oscillatorGains = {};
    }

    /**
     * Stop original audio
     */
    stopOriginal() {
        if (this.originalSource) {
            try {
                this.originalSource.stop();
                this.originalSource.disconnect();
            } catch (e) {
                // Source may already be stopped
            }
            this.originalSource = null;
        }
    }

    /**
     * Start tracking playback progress
     * @param {number} duration - Duration in seconds
     */
    startProgressTracking(duration) {
        this.stopProgressTracking();

        this.progressInterval = setInterval(() => {
            if (this.isPlaying && this.onProgress) {
                const elapsed = this.audioContext.currentTime - this.playbackStartTime;
                const progress = Math.min(elapsed / duration, 1);
                this.onProgress(progress, elapsed, duration);
            }
        }, 50);
    }

    /**
     * Stop tracking playback progress
     */
    stopProgressTracking() {
        if (this.progressInterval) {
            clearInterval(this.progressInterval);
            this.progressInterval = null;
        }
    }

    /**
     * Handle playback end
     */
    handlePlaybackEnd() {
        this.isPlaying = false;
        this.stopProgressTracking();

        if (this.onProgress) {
            this.onProgress(1, this.currentDuration, this.currentDuration);
        }

        if (this.onPlaybackEnd) {
            this.onPlaybackEnd();
        }
    }

    /**
     * Get current AudioContext time
     */
    getCurrentTime() {
        return this.audioContext ? this.audioContext.currentTime : 0;
    }
}
