/**
 * LPCAnalyzer - Linear Predictive Coding analysis for formant extraction
 *
 * Based on the approach from:
 * - Dan Ellis (Columbia University) MATLAB implementation
 * - vvolhejn/sine_wave_speech Python implementation
 *
 * Key insight: Amplitude is derived from pole magnitude (1 - |root|),
 * not from frame energy. This produces the characteristic sinewave speech sound.
 */

export class LPCAnalyzer {
    /**
     * @param {number} sampleRate - Audio sample rate (will be resampled to 8kHz internally)
     * @param {number} hopSize - Hop size in samples at 8kHz (default 256)
     * @param {number} lpcOrder - Number of LPC coefficients (default 12 for 6 formants)
     */
    constructor(sampleRate = 8000, hopSize = 256, lpcOrder = 12) {
        this.sampleRate = sampleRate;
        this.hopSize = hopSize;
        this.windowSize = hopSize * 2;  // 50% overlap
        this.lpcOrder = lpcOrder;

        // Pre-compute Hann window (reference implementations use Hann, not Hamming)
        this.window = this.createHannWindow(this.windowSize);
    }

    /**
     * Create a Hann window
     */
    createHannWindow(size) {
        const window = new Float32Array(size);
        for (let i = 0; i < size; i++) {
            window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
        }
        return window;
    }

    /**
     * Analyze audio buffer and extract formant trajectories
     * @param {Float32Array} audioBuffer - Audio samples (will be resampled to 8kHz)
     * @param {number} inputSampleRate - Sample rate of input audio
     * @returns {Object} Formant trajectories { F1: [], F2: [], F3: [] }
     */
    analyze(audioBuffer, inputSampleRate) {
        // Resample to 8kHz to focus LPC on formant region (< 4kHz)
        // This is a key step from Dan Ellis's implementation
        const targetRate = 8000;
        let audio = this.resample(audioBuffer, inputSampleRate, targetRate);
        this.sampleRate = targetRate;

        // Apply pre-emphasis filter [1, -0.9]
        audio = this.preEmphasis(audio, 0.9);

        // Pad audio for windowing
        const padSize = Math.floor((this.windowSize - this.hopSize) / 2);
        const paddedAudio = new Float32Array(audio.length + padSize * 2);
        paddedAudio.set(audio, padSize);

        const numHops = Math.floor(audio.length / this.hopSize);
        const trajectories = { F1: [], F2: [], F3: [] };

        // Track previous values for smoothing
        let prevFreqs = [500, 1500, 2500];
        let prevMags = [0, 0, 0];

        for (let hop = 0; hop < numHops; hop++) {
            const time = (hop * this.hopSize) / this.sampleRate;
            const startIdx = hop * this.hopSize;

            // Extract and window frame
            const frame = paddedAudio.slice(startIdx, startIdx + this.windowSize);
            const windowed = this.applyWindow(frame);

            // Compute autocorrelation
            const autocorr = this.autocorrelate(windowed, this.lpcOrder + 1);

            // Compute LPC coefficients using Levinson-Durbin
            const { coeffs, gain } = this.levinsonDurbin(autocorr);

            // Find roots of LPC polynomial and convert to frequencies/magnitudes
            const { frequencies, magnitudes } = this.coeffsToFormants(coeffs, gain);

            // Select the first 3 formants (F1, F2, F3)
            // Apply smoothing to avoid jumps
            const smoothing = 0.3;
            for (let i = 0; i < 3; i++) {
                if (frequencies[i] !== undefined && frequencies[i] > 0) {
                    prevFreqs[i] = prevFreqs[i] * (1 - smoothing) + frequencies[i] * smoothing;
                    prevMags[i] = prevMags[i] * (1 - smoothing) + (magnitudes[i] || 0) * smoothing;
                } else {
                    // Decay magnitude if no valid formant found
                    prevMags[i] *= 0.8;
                }
            }

            // Normalize magnitudes to 0-1 range with formant weighting
            const maxMag = Math.max(...prevMags, 0.001);
            trajectories.F1.push({ t: time, freq: prevFreqs[0], amp: (prevMags[0] / maxMag) * 1.0 });
            trajectories.F2.push({ t: time, freq: prevFreqs[1], amp: (prevMags[1] / maxMag) * 0.7 });
            trajectories.F3.push({ t: time, freq: prevFreqs[2], amp: (prevMags[2] / maxMag) * 0.4 });
        }

        // Post-process: normalize amplitudes across entire trajectory
        this.normalizeAmplitudes(trajectories);

        return trajectories;
    }

    /**
     * Normalize amplitudes across the entire trajectory
     */
    normalizeAmplitudes(trajectories) {
        // Find global max amplitude
        let globalMax = 0;
        for (const formant of ['F1', 'F2', 'F3']) {
            for (const point of trajectories[formant]) {
                globalMax = Math.max(globalMax, point.amp);
            }
        }

        // Normalize and apply curve for better dynamics
        if (globalMax > 0) {
            for (const formant of ['F1', 'F2', 'F3']) {
                const weight = formant === 'F1' ? 1.0 : formant === 'F2' ? 0.7 : 0.4;
                for (const point of trajectories[formant]) {
                    // Normalize to 0-1
                    let amp = point.amp / globalMax;
                    // Apply gentle compression for better dynamics
                    amp = Math.pow(amp, 0.6);
                    point.amp = amp * weight;
                }
            }
        }
    }

    /**
     * Apply window to frame
     */
    applyWindow(frame) {
        const windowed = new Float32Array(frame.length);
        const len = Math.min(frame.length, this.window.length);
        for (let i = 0; i < len; i++) {
            windowed[i] = frame[i] * this.window[i];
        }
        return windowed;
    }

    /**
     * Apply pre-emphasis filter: y[n] = x[n] - coeff * x[n-1]
     */
    preEmphasis(audio, coeff = 0.9) {
        const result = new Float32Array(audio.length);
        result[0] = audio[0];
        for (let i = 1; i < audio.length; i++) {
            result[i] = audio[i] - coeff * audio[i - 1];
        }
        return result;
    }

    /**
     * Compute autocorrelation
     */
    autocorrelate(frame, maxLag) {
        const r = new Float64Array(maxLag);
        for (let lag = 0; lag < maxLag; lag++) {
            let sum = 0;
            for (let i = 0; i < frame.length - lag; i++) {
                sum += frame[i] * frame[i + lag];
            }
            r[lag] = sum;
        }
        return r;
    }

    /**
     * Levinson-Durbin algorithm to compute LPC coefficients
     * Returns coefficients [1, a1, a2, ..., ap] and prediction gain
     */
    levinsonDurbin(r) {
        const p = this.lpcOrder;
        const a = new Float64Array(p + 1);
        a[0] = 1.0;

        if (r[0] < 1e-10) {
            return { coeffs: a, gain: 0 };
        }

        let e = r[0];
        const aTemp = new Float64Array(p + 1);

        for (let i = 1; i <= p; i++) {
            // Compute reflection coefficient
            let lambda = r[i];
            for (let j = 1; j < i; j++) {
                lambda -= a[j] * r[i - j];
            }
            lambda /= e;

            // Update coefficients
            aTemp[i] = lambda;
            for (let j = 1; j < i; j++) {
                aTemp[j] = a[j] - lambda * a[i - j];
            }

            for (let j = 1; j <= i; j++) {
                a[j] = aTemp[j];
            }

            // Update error
            e *= (1 - lambda * lambda);
            if (e <= 0) break;
        }

        // Gain is sqrt of prediction error
        const gain = Math.sqrt(Math.max(e, 0));

        return { coeffs: a, gain };
    }

    /**
     * Convert LPC coefficients to formant frequencies and magnitudes
     * Key insight: magnitude = gain / (1 - |root|)
     */
    coeffsToFormants(coeffs, gain) {
        // Find roots of the LPC polynomial
        const roots = this.findPolynomialRoots(coeffs);

        // Convert roots to frequencies and magnitudes
        const formants = [];

        for (const root of roots) {
            // Only consider roots with positive imaginary part (conjugate pairs)
            if (root.imag <= 0.001) continue;

            // Frequency from angle of root
            const freq = (Math.atan2(root.imag, root.real) * this.sampleRate) / (2 * Math.PI);

            // Magnitude from distance to unit circle
            // This is the key formula: amplitude relates to how resonant the formant is
            const rootMag = Math.sqrt(root.real * root.real + root.imag * root.imag);
            const magnitude = gain / Math.max(1 - rootMag, 0.01);

            // Bandwidth (for reference, not used directly)
            const bandwidth = (-Math.log(rootMag) * this.sampleRate) / Math.PI;

            // Filter to valid formant range
            if (freq > 90 && freq < 4000 && bandwidth > 0 && bandwidth < 600) {
                formants.push({ freq, magnitude, bandwidth });
            }
        }

        // Sort by frequency
        formants.sort((a, b) => a.freq - b.freq);

        // Return separate arrays for frequencies and magnitudes
        const frequencies = formants.map(f => f.freq);
        const magnitudes = formants.map(f => f.magnitude);

        return { frequencies, magnitudes };
    }

    /**
     * Find roots of LPC polynomial using companion matrix eigenvalue method
     */
    findPolynomialRoots(coeffs) {
        const n = coeffs.length - 1;
        if (n <= 0) return [];

        // Build companion matrix for polynomial [1, a1, a2, ..., an]
        // We need roots of 1 + a1*z^-1 + ... + an*z^-n
        // Which equals z^n + a1*z^(n-1) + ... + an
        const companion = [];
        for (let i = 0; i < n; i++) {
            companion[i] = new Float64Array(n);
            if (i < n - 1) {
                companion[i][i + 1] = 1;
            }
            // Note: coeffs[0] = 1, so we use -coeffs[j+1]
            companion[i][0] = -coeffs[n - i];
        }

        return this.computeEigenvalues(companion, n);
    }

    /**
     * Compute eigenvalues using QR iteration
     */
    computeEigenvalues(matrix, n) {
        const H = matrix.map(row => Float64Array.from(row));
        const eigenvalues = [];
        const maxIter = 50;

        let m = n;
        while (m > 0) {
            let iter = 0;
            while (iter < maxIter) {
                if (m === 1) {
                    eigenvalues.push({ real: H[0][0], imag: 0 });
                    m = 0;
                    break;
                }

                // Check for deflation
                const subdiag = Math.abs(H[m - 1][m - 2]);
                const diag = Math.abs(H[m - 2][m - 2]) + Math.abs(H[m - 1][m - 1]);
                if (subdiag < 1e-10 * diag) {
                    eigenvalues.push({ real: H[m - 1][m - 1], imag: 0 });
                    m--;
                    break;
                }

                // Check for 2x2 block with complex eigenvalues
                if (m >= 2) {
                    const a = H[m - 2][m - 2];
                    const b = H[m - 2][m - 1];
                    const c = H[m - 1][m - 2];
                    const d = H[m - 1][m - 1];

                    const trace = a + d;
                    const det = a * d - b * c;
                    const disc = trace * trace - 4 * det;

                    if (disc < 0) {
                        const realPart = trace / 2;
                        const imagPart = Math.sqrt(-disc) / 2;
                        eigenvalues.push({ real: realPart, imag: imagPart });
                        eigenvalues.push({ real: realPart, imag: -imagPart });
                        m -= 2;
                        break;
                    }
                }

                // QR step with Wilkinson shift
                const shift = this.wilkinsonShift(H, m);
                this.qrStep(H, m, shift);
                iter++;
            }

            if (iter >= maxIter) {
                for (let i = 0; i < m; i++) {
                    eigenvalues.push({ real: H[i][i], imag: 0 });
                }
                m = 0;
            }
        }

        return eigenvalues;
    }

    wilkinsonShift(H, m) {
        if (m < 2) return H[0][0];
        const a = H[m - 2][m - 2];
        const b = H[m - 2][m - 1];
        const c = H[m - 1][m - 2];
        const d = H[m - 1][m - 1];

        const trace = a + d;
        const det = a * d - b * c;
        const disc = trace * trace - 4 * det;

        if (disc >= 0) {
            const sqrtDisc = Math.sqrt(disc);
            const e1 = (trace + sqrtDisc) / 2;
            const e2 = (trace - sqrtDisc) / 2;
            return Math.abs(e1 - d) < Math.abs(e2 - d) ? e1 : e2;
        }
        return trace / 2;
    }

    qrStep(H, m, shift) {
        for (let i = 0; i < m; i++) H[i][i] -= shift;

        const cos = new Float64Array(m - 1);
        const sin = new Float64Array(m - 1);

        for (let i = 0; i < m - 1; i++) {
            const a = H[i][i];
            const b = H[i + 1][i];
            const r = Math.sqrt(a * a + b * b);
            cos[i] = r < 1e-15 ? 1 : a / r;
            sin[i] = r < 1e-15 ? 0 : b / r;

            for (let j = 0; j < m; j++) {
                const temp = cos[i] * H[i][j] + sin[i] * H[i + 1][j];
                H[i + 1][j] = -sin[i] * H[i][j] + cos[i] * H[i + 1][j];
                H[i][j] = temp;
            }
        }

        for (let i = 0; i < m - 1; i++) {
            for (let j = 0; j < m; j++) {
                const temp = cos[i] * H[j][i] + sin[i] * H[j][i + 1];
                H[j][i + 1] = -sin[i] * H[j][i] + cos[i] * H[j][i + 1];
                H[j][i] = temp;
            }
        }

        for (let i = 0; i < m; i++) H[i][i] += shift;
    }

    /**
     * Resample audio to target sample rate using linear interpolation
     */
    resample(audio, fromRate, toRate) {
        if (fromRate === toRate) return audio;

        const ratio = fromRate / toRate;
        const outputLength = Math.floor(audio.length / ratio);
        const output = new Float32Array(outputLength);

        for (let i = 0; i < outputLength; i++) {
            const srcIdx = i * ratio;
            const srcFloor = Math.floor(srcIdx);
            const srcCeil = Math.min(srcFloor + 1, audio.length - 1);
            const t = srcIdx - srcFloor;
            output[i] = audio[srcFloor] * (1 - t) + audio[srcCeil] * t;
        }

        return output;
    }
}
