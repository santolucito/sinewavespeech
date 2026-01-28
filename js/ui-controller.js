/**
 * UIController - DOM and UI state management
 *
 * Manages button states, progress display, visualization,
 * and coordinates with FormantPlayer.
 */
export class UIController {
    constructor(formantPlayer) {
        this.player = formantPlayer;
        this.state = 'initial'; // initial, generated, first-listen, revealed, replay
        this.hasHeardOriginal = false;

        // DOM elements
        this.elements = {
            textInput: document.getElementById('text-input'),
            generateBtn: document.getElementById('generate-btn'),
            playSinewave: document.getElementById('play-sinewave'),
            revealOriginal: document.getElementById('reveal-original'),
            replaySinewave: document.getElementById('replay-sinewave'),
            progressFill: document.getElementById('progress-fill'),
            timeDisplay: document.getElementById('time-display'),
            volumeSlider: document.getElementById('volume-slider'),
            toggleF1: document.getElementById('toggle-f1'),
            toggleF2: document.getElementById('toggle-f2'),
            toggleF3: document.getElementById('toggle-f3'),
            canvas: document.getElementById('formant-canvas'),
            transcriptSection: document.getElementById('transcript-section'),
            transcriptText: document.getElementById('transcript-text'),
            analysisStatus: document.getElementById('analysis-status')
        };

        this.canvasCtx = this.elements.canvas.getContext('2d');

        this.setupEventListeners();
        this.setupPlayerCallbacks();
    }

    /**
     * Set up event listeners for UI elements
     */
    setupEventListeners() {
        // Generate button
        this.elements.generateBtn.addEventListener('click', () => this.handleGenerate());

        // Text input - generate on Enter
        this.elements.textInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.handleGenerate();
            }
        });

        // Example phrase buttons
        document.querySelectorAll('.example-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.elements.textInput.value = btn.dataset.text;
                this.handleGenerate();
            });
        });

        // Play buttons
        this.elements.playSinewave.addEventListener('click', () => this.handlePlaySinewave());
        this.elements.revealOriginal.addEventListener('click', () => this.handleRevealOriginal());
        this.elements.replaySinewave.addEventListener('click', () => this.handleReplaySinewave());

        // Volume slider
        this.elements.volumeSlider.addEventListener('input', (e) => {
            this.player.setVolume(e.target.value / 100);
        });

        // Formant toggles
        this.elements.toggleF1.addEventListener('change', (e) => {
            this.player.setFormantEnabled('F1', e.target.checked);
        });
        this.elements.toggleF2.addEventListener('change', (e) => {
            this.player.setFormantEnabled('F2', e.target.checked);
        });
        this.elements.toggleF3.addEventListener('change', (e) => {
            this.player.setFormantEnabled('F3', e.target.checked);
        });

        // Handle window resize for canvas
        window.addEventListener('resize', () => this.resizeCanvas());
    }

    /**
     * Set up callbacks from player
     */
    setupPlayerCallbacks() {
        this.player.onProgress = (progress, elapsed, duration) => {
            this.updateProgress(progress, elapsed, duration);
        };

        this.player.onPlaybackEnd = () => {
            this.handlePlaybackEnd();
        };

        this.player.onAnalysisStart = () => {
            this.showAnalysisStatus(true);
        };

        this.player.onAnalysisComplete = () => {
            this.showAnalysisStatus(false);
        };
    }

    /**
     * Show or hide analysis status indicator
     */
    showAnalysisStatus(show) {
        if (this.elements.analysisStatus) {
            this.elements.analysisStatus.hidden = !show;
        }
    }

    /**
     * Handle Generate button click
     */
    async handleGenerate() {
        const text = this.elements.textInput.value.trim();
        if (!text) return;

        try {
            // Disable generate button during analysis
            this.elements.generateBtn.disabled = true;

            // Hide transcript when generating new
            this.elements.transcriptSection.hidden = true;

            // Generate with LPC analysis (async)
            await this.player.generateFromText(text);

            this.state = 'generated';
            this.hasHeardOriginal = false;

            // Update visualization
            this.drawVisualization();

            // Update button states
            this.updateButtonStates();

            // Reset progress
            this.updateProgress(0, 0, this.player.getDuration());

        } catch (e) {
            console.error('Error generating:', e);
            this.showAnalysisStatus(false);
        } finally {
            this.elements.generateBtn.disabled = false;
        }
    }

    /**
     * Handle Play Sinewave button click
     */
    async handlePlaySinewave() {
        try {
            this.disableAllButtons();
            await this.player.playSinewave();
            this.state = 'first-listen';
            this.updateButtonStates();
        } catch (e) {
            console.error('Error playing sinewave:', e);
            this.enableButtons();
        }
    }

    /**
     * Handle Reveal Original button click
     */
    async handleRevealOriginal() {
        try {
            this.disableAllButtons();

            // Show transcript
            this.showTranscript();

            await this.player.playOriginal();
            this.hasHeardOriginal = true;
            this.state = 'revealed';
            this.updateButtonStates();
        } catch (e) {
            console.error('Error playing original:', e);
            // Still show transcript even if speech fails
            this.showTranscript();
            this.hasHeardOriginal = true;
            this.state = 'revealed';
            this.enableButtons();
        }
    }

    /**
     * Handle Replay Sinewave button click
     */
    async handleReplaySinewave() {
        try {
            this.disableAllButtons();
            await this.player.playSinewave();
            this.state = 'replay';
            this.updateButtonStates();
        } catch (e) {
            console.error('Error replaying sinewave:', e);
            this.enableButtons();
        }
    }

    /**
     * Handle playback end
     */
    handlePlaybackEnd() {
        this.enableButtons();
        this.updateButtonStates();
    }

    /**
     * Disable all play buttons
     */
    disableAllButtons() {
        this.elements.generateBtn.disabled = true;
        this.elements.playSinewave.disabled = true;
        this.elements.revealOriginal.disabled = true;
        this.elements.replaySinewave.disabled = true;
    }

    /**
     * Enable appropriate buttons based on state
     */
    enableButtons() {
        this.updateButtonStates();
    }

    /**
     * Update button states based on current state
     */
    updateButtonStates() {
        const isPlaying = this.player.isPlaying();
        const isReady = this.player.isReady();

        // Generate button always enabled unless playing
        this.elements.generateBtn.disabled = isPlaying;

        switch (this.state) {
            case 'initial':
                this.elements.playSinewave.disabled = true;
                this.elements.revealOriginal.disabled = true;
                this.elements.replaySinewave.disabled = true;
                break;

            case 'generated':
                this.elements.playSinewave.disabled = isPlaying;
                this.elements.revealOriginal.disabled = true;
                this.elements.replaySinewave.disabled = true;
                break;

            case 'first-listen':
                this.elements.playSinewave.disabled = isPlaying;
                this.elements.revealOriginal.disabled = isPlaying;
                this.elements.replaySinewave.disabled = true;
                break;

            case 'revealed':
            case 'replay':
                this.elements.playSinewave.disabled = isPlaying;
                this.elements.revealOriginal.disabled = isPlaying;
                this.elements.replaySinewave.disabled = isPlaying;
                break;
        }
    }

    /**
     * Update progress display
     */
    updateProgress(progress, elapsed, duration) {
        this.elements.progressFill.style.width = `${progress * 100}%`;

        const formatTime = (seconds) => {
            const mins = Math.floor(seconds / 60);
            const secs = Math.floor(seconds % 60);
            return `${mins}:${secs.toString().padStart(2, '0')}`;
        };

        this.elements.timeDisplay.textContent =
            `${formatTime(elapsed)} / ${formatTime(duration)}`;
    }

    /**
     * Show transcript section
     */
    showTranscript() {
        const transcript = this.player.getTranscript();
        if (transcript) {
            this.elements.transcriptText.textContent = `"${transcript}"`;
            this.elements.transcriptSection.hidden = false;
        }
    }

    /**
     * Resize canvas to fit container
     */
    resizeCanvas() {
        const container = this.elements.canvas.parentElement;
        const rect = container.getBoundingClientRect();
        this.elements.canvas.width = rect.width;
        this.elements.canvas.height = 200;
        this.drawVisualization();
    }

    /**
     * Draw formant trajectory visualization
     */
    drawVisualization() {
        const ctx = this.canvasCtx;
        const canvas = this.elements.canvas;
        const width = canvas.width;
        const height = canvas.height;

        // Clear canvas
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, width, height);

        const formants = this.player.getFormantData();
        if (!formants) return;

        const duration = this.player.getDuration();

        // Frequency range for display
        const minFreq = 200;
        const maxFreq = 3500;

        // Draw grid
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;

        // Horizontal grid lines (frequency)
        for (let f = 500; f <= 3000; f += 500) {
            const y = height - ((f - minFreq) / (maxFreq - minFreq)) * height;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();

            // Label
            ctx.fillStyle = '#666';
            ctx.font = '10px sans-serif';
            ctx.fillText(`${f} Hz`, 5, y - 2);
        }

        // Draw formant trajectories
        for (const [formant, data] of Object.entries(formants)) {
            if (!data.trajectory || data.trajectory.length === 0) continue;

            ctx.strokeStyle = data.color;
            ctx.lineWidth = 2;
            ctx.beginPath();

            let started = false;
            for (const point of data.trajectory) {
                const x = (point.t / duration) * width;
                const y = height - ((point.freq - minFreq) / (maxFreq - minFreq)) * height;

                // Only draw if amplitude > 0
                if (point.amp > 0.1) {
                    if (!started) {
                        ctx.moveTo(x, y);
                        started = true;
                    } else {
                        ctx.lineTo(x, y);
                    }
                } else {
                    if (started) {
                        ctx.stroke();
                        ctx.beginPath();
                        started = false;
                    }
                }
            }

            if (started) {
                ctx.stroke();
            }
        }

        // Draw legend
        let legendY = 20;
        for (const [formant, data] of Object.entries(formants)) {
            ctx.fillStyle = data.color;
            ctx.fillRect(width - 60, legendY - 10, 12, 12);
            ctx.fillStyle = '#fff';
            ctx.font = '12px sans-serif';
            ctx.fillText(formant, width - 42, legendY);
            legendY += 20;
        }
    }

    /**
     * Initialize UI
     */
    async initialize() {
        await this.player.init();
        this.resizeCanvas();
        this.updateButtonStates();

        // Set initial volume
        this.player.setVolume(this.elements.volumeSlider.value / 100);

        // Generate initial text if present
        if (this.elements.textInput.value.trim()) {
            this.handleGenerate();
        }
    }
}
