/**
 * PhonemeMapper - Maps text to phonemes and phonemes to formant values
 *
 * Uses a simplified English phoneme set with typical formant frequencies.
 * Formant values based on Peterson & Barney (1952) and other acoustic phonetics research.
 */

// Formant frequencies (Hz) for common phonemes - average adult values
// Format: [F1, F2, F3]
const PHONEME_FORMANTS = {
    // Vowels
    'IY': [270, 2290, 3010],   // "beat" - high front
    'IH': [390, 1990, 2550],   // "bit"
    'EH': [530, 1840, 2480],   // "bet"
    'AE': [660, 1720, 2410],   // "bat"
    'AA': [730, 1090, 2440],   // "father" - low back
    'AO': [570, 840, 2410],    // "bought"
    'UH': [440, 1020, 2240],   // "book"
    'UW': [300, 870, 2240],    // "boot" - high back
    'AH': [640, 1190, 2390],   // "but" / schwa
    'ER': [490, 1350, 1690],   // "bird" - r-colored

    // Diphthongs (use starting position)
    'EY': [450, 2000, 2600],   // "bait"
    'AY': [750, 1200, 2600],   // "bite"
    'OY': [550, 900, 2500],    // "boy"
    'AW': [750, 1200, 2500],   // "bout"
    'OW': [500, 900, 2500],    // "boat"

    // Glides and liquids (voiced, with formant structure)
    'W':  [350, 700, 2400],    // "wet" - like /u/
    'Y':  [300, 2200, 3000],   // "yet" - like /i/
    'R':  [420, 1300, 1600],   // "red" - distinctive low F3
    'L':  [400, 1100, 2600],   // "let"

    // Nasals (voiced, formants visible but damped)
    'M':  [300, 1200, 2500],   // lips closed
    'N':  [300, 1700, 2500],   // tongue tip
    'NG': [350, 2000, 2700],   // back of tongue

    // Voiced fricatives (weak formants)
    'V':  [300, 1300, 2400],
    'DH': [350, 1600, 2600],   // "the"
    'Z':  [350, 1800, 2600],
    'ZH': [350, 2000, 2600],

    // Voiced stops (brief formant burst)
    'B':  [350, 1100, 2400],
    'D':  [350, 1700, 2600],
    'G':  [350, 2000, 2600],
    'JH': [350, 2200, 2800],   // "judge"

    // Unvoiced - no periodic voicing, amplitude goes to near zero
    'P':  [0, 0, 0],
    'T':  [0, 0, 0],
    'K':  [0, 0, 0],
    'F':  [0, 0, 0],
    'TH': [0, 0, 0],
    'S':  [0, 0, 0],
    'SH': [0, 0, 0],
    'CH': [0, 0, 0],
    'HH': [0, 0, 0],

    // Silence
    'SIL': [0, 0, 0],
};

// Amplitude multipliers for each formant (F1 loudest, F3 quietest)
const FORMANT_AMPLITUDES = {
    F1: 1.0,
    F2: 0.7,
    F3: 0.4
};

// Simple letter/digraph to phoneme mapping
const LETTER_TO_PHONEME = {
    'a': 'AE', 'e': 'EH', 'i': 'IH', 'o': 'AA', 'u': 'AH',
    'b': 'B', 'c': 'K', 'd': 'D', 'f': 'F', 'g': 'G',
    'h': 'HH', 'j': 'JH', 'k': 'K', 'l': 'L', 'm': 'M',
    'n': 'N', 'p': 'P', 'q': 'K', 'r': 'R', 's': 'S',
    't': 'T', 'v': 'V', 'w': 'W', 'x': 'K', 'y': 'Y', 'z': 'Z',
};

// Common digraphs and patterns
const DIGRAPH_TO_PHONEME = {
    'th': 'TH', 'sh': 'SH', 'ch': 'CH', 'ng': 'NG', 'wh': 'W',
    'ph': 'F', 'ck': 'K', 'ee': 'IY', 'ea': 'IY', 'oo': 'UW',
    'ou': 'AW', 'ow': 'OW', 'oi': 'OY', 'oy': 'OY', 'ai': 'EY',
    'ay': 'EY', 'ie': 'IY', 'igh': 'AY', 'au': 'AO', 'aw': 'AO',
    'er': 'ER', 'ir': 'ER', 'ur': 'ER', 'or': 'AO', 'ar': 'AA',
};

// Common word pronunciations
const WORD_PRONUNCIATIONS = {
    'the': ['DH', 'AH'],
    'a': ['AH'],
    'an': ['AE', 'N'],
    'is': ['IH', 'Z'],
    'are': ['AA', 'R'],
    'was': ['W', 'AH', 'Z'],
    'were': ['W', 'ER'],
    'where': ['W', 'EH', 'R'],
    'what': ['W', 'AH', 'T'],
    'when': ['W', 'EH', 'N'],
    'why': ['W', 'AY'],
    'how': ['HH', 'AW'],
    'you': ['Y', 'UW'],
    'your': ['Y', 'AO', 'R'],
    'year': ['Y', 'IH', 'R'],
    'ago': ['AH', 'G', 'OW'],
    'to': ['T', 'UW'],
    'do': ['D', 'UW'],
    'go': ['G', 'OW'],
    'no': ['N', 'OW'],
    'so': ['S', 'OW'],
    'of': ['AH', 'V'],
    'for': ['F', 'AO', 'R'],
    'with': ['W', 'IH', 'TH'],
    'this': ['DH', 'IH', 'S'],
    'that': ['DH', 'AE', 'T'],
    'have': ['HH', 'AE', 'V'],
    'has': ['HH', 'AE', 'Z'],
    'had': ['HH', 'AE', 'D'],
    'be': ['B', 'IY'],
    'been': ['B', 'IH', 'N'],
    'will': ['W', 'IH', 'L'],
    'would': ['W', 'UH', 'D'],
    'could': ['K', 'UH', 'D'],
    'should': ['SH', 'UH', 'D'],
    'can': ['K', 'AE', 'N'],
    'from': ['F', 'R', 'AH', 'M'],
    'they': ['DH', 'EY'],
    'their': ['DH', 'EH', 'R'],
    'there': ['DH', 'EH', 'R'],
    'here': ['HH', 'IH', 'R'],
    'hello': ['HH', 'AH', 'L', 'OW'],
    'world': ['W', 'ER', 'L', 'D'],
    'speech': ['S', 'P', 'IY', 'CH'],
    'sound': ['S', 'AW', 'N', 'D'],
    'hear': ['HH', 'IH', 'R'],
    'listen': ['L', 'IH', 'S', 'AH', 'N'],
    'voice': ['V', 'OY', 'S'],
    'say': ['S', 'EY'],
    'said': ['S', 'EH', 'D'],
    'word': ['W', 'ER', 'D'],
    'words': ['W', 'ER', 'D', 'Z'],
    'one': ['W', 'AH', 'N'],
    'two': ['T', 'UW'],
    'three': ['TH', 'R', 'IY'],
    'i': ['AY'],
    'my': ['M', 'AY'],
    'me': ['M', 'IY'],
    'we': ['W', 'IY'],
    'he': ['HH', 'IY'],
    'she': ['SH', 'IY'],
    'it': ['IH', 'T'],
    'not': ['N', 'AA', 'T'],
    "don't": ['D', 'OW', 'N', 'T'],
    'know': ['N', 'OW'],
    'think': ['TH', 'IH', 'NG', 'K'],
    'like': ['L', 'AY', 'K'],
    'just': ['JH', 'AH', 'S', 'T'],
    'time': ['T', 'AY', 'M'],
    'good': ['G', 'UH', 'D'],
    'new': ['N', 'UW'],
    'first': ['F', 'ER', 'S', 'T'],
    'last': ['L', 'AE', 'S', 'T'],
    'long': ['L', 'AO', 'NG'],
    'great': ['G', 'R', 'EY', 'T'],
    'little': ['L', 'IH', 'T', 'AH', 'L'],
    'own': ['OW', 'N'],
    'other': ['AH', 'DH', 'ER'],
    'old': ['OW', 'L', 'D'],
    'right': ['R', 'AY', 'T'],
    'big': ['B', 'IH', 'G'],
    'high': ['HH', 'AY'],
    'small': ['S', 'M', 'AO', 'L'],
    'next': ['N', 'EH', 'K', 'S', 'T'],
    'early': ['ER', 'L', 'IY'],
    'young': ['Y', 'AH', 'NG'],
    'few': ['F', 'Y', 'UW'],
    'bad': ['B', 'AE', 'D'],
    'same': ['S', 'EY', 'M'],
    'quick': ['K', 'W', 'IH', 'K'],
    'brown': ['B', 'R', 'AW', 'N'],
    'fox': ['F', 'AA', 'K', 'S'],
};

export class PhonemeMapper {
    /**
     * Convert text to a sequence of phonemes with timing
     */
    textToPhonemes(text) {
        const words = text.toLowerCase().replace(/[^\w\s']/g, '').split(/\s+/);
        const phonemes = [];

        for (let i = 0; i < words.length; i++) {
            const word = words[i];
            if (!word) continue;

            if (WORD_PRONUNCIATIONS[word]) {
                for (const phoneme of WORD_PRONUNCIATIONS[word]) {
                    phonemes.push({
                        phoneme,
                        duration: this.getPhonemeDuration(phoneme)
                    });
                }
            } else {
                phonemes.push(...this.wordToPhonemes(word));
            }

            // Brief pause between words
            if (i < words.length - 1) {
                phonemes.push({ phoneme: 'SIL', duration: 0.06 });
            }
        }

        return phonemes;
    }

    /**
     * Convert a single word to phonemes
     */
    wordToPhonemes(word) {
        const phonemes = [];
        let i = 0;

        while (i < word.length) {
            let matched = false;

            // Try trigraphs
            if (i + 2 < word.length) {
                const tri = word.substring(i, i + 3);
                if (DIGRAPH_TO_PHONEME[tri]) {
                    phonemes.push({
                        phoneme: DIGRAPH_TO_PHONEME[tri],
                        duration: this.getPhonemeDuration(DIGRAPH_TO_PHONEME[tri])
                    });
                    i += 3;
                    matched = true;
                }
            }

            // Try digraphs
            if (!matched && i + 1 < word.length) {
                const di = word.substring(i, i + 2);
                if (DIGRAPH_TO_PHONEME[di]) {
                    phonemes.push({
                        phoneme: DIGRAPH_TO_PHONEME[di],
                        duration: this.getPhonemeDuration(DIGRAPH_TO_PHONEME[di])
                    });
                    i += 2;
                    matched = true;
                }
            }

            // Single letter
            if (!matched) {
                const phoneme = LETTER_TO_PHONEME[word[i]];
                if (phoneme) {
                    phonemes.push({
                        phoneme,
                        duration: this.getPhonemeDuration(phoneme)
                    });
                }
                i++;
            }
        }

        return phonemes;
    }

    /**
     * Get duration for a phoneme
     */
    getPhonemeDuration(phoneme) {
        // Vowels and diphthongs
        if (['IY', 'IH', 'EH', 'AE', 'AA', 'AO', 'UH', 'UW', 'AH', 'ER', 'EY', 'AY', 'OY', 'AW', 'OW'].includes(phoneme)) {
            return 0.10;
        }
        // Sonorants (nasals, liquids, glides)
        if (['M', 'N', 'NG', 'L', 'R', 'W', 'Y'].includes(phoneme)) {
            return 0.07;
        }
        // Voiced obstruents
        if (['V', 'DH', 'Z', 'ZH', 'B', 'D', 'G', 'JH'].includes(phoneme)) {
            return 0.05;
        }
        // Unvoiced
        return 0.04;
    }

    /**
     * Get formant values for a phoneme
     */
    getFormants(phoneme) {
        const f = PHONEME_FORMANTS[phoneme] || PHONEME_FORMANTS['AH'];
        return {
            f1: f[0],
            f2: f[1],
            f3: f[2],
            voiced: f[0] > 0
        };
    }

    /**
     * Convert phoneme sequence to smooth formant trajectories
     * This creates continuous gliding formants like real sinewave speech
     */
    phonemesToTrajectory(phonemes) {
        const f1Points = [];
        const f2Points = [];
        const f3Points = [];

        // Calculate total duration and create target points
        let currentTime = 0;
        const targets = [];

        // Initial silence
        targets.push({
            time: 0,
            f1: 400, f2: 1500, f3: 2500,
            amp: 0
        });
        currentTime = 0.02;

        for (const { phoneme, duration } of phonemes) {
            const formants = this.getFormants(phoneme);
            const amp = formants.voiced ? 1.0 : 0.0;

            // Add target at center of phoneme
            const centerTime = currentTime + duration / 2;
            targets.push({
                time: centerTime,
                f1: formants.f1 || 400,
                f2: formants.f2 || 1500,
                f3: formants.f3 || 2500,
                amp: amp
            });

            currentTime += duration;
        }

        // Final silence
        targets.push({
            time: currentTime + 0.02,
            f1: 400, f2: 1500, f3: 2500,
            amp: 0
        });

        const totalDuration = currentTime + 0.04;

        // Now interpolate between targets to create smooth trajectories
        // Sample at ~100 Hz for smooth playback
        const sampleInterval = 0.01;
        const numSamples = Math.ceil(totalDuration / sampleInterval);

        for (let i = 0; i <= numSamples; i++) {
            const t = i * sampleInterval;

            // Find surrounding targets for interpolation
            let prevTarget = targets[0];
            let nextTarget = targets[targets.length - 1];

            for (let j = 0; j < targets.length - 1; j++) {
                if (targets[j].time <= t && targets[j + 1].time > t) {
                    prevTarget = targets[j];
                    nextTarget = targets[j + 1];
                    break;
                }
            }

            // Linear interpolation factor
            const dt = nextTarget.time - prevTarget.time;
            const alpha = dt > 0 ? (t - prevTarget.time) / dt : 0;

            // Smooth interpolation using cosine easing for more natural transitions
            const smoothAlpha = 0.5 - 0.5 * Math.cos(alpha * Math.PI);

            // Interpolate formant frequencies
            const f1 = prevTarget.f1 + smoothAlpha * (nextTarget.f1 - prevTarget.f1);
            const f2 = prevTarget.f2 + smoothAlpha * (nextTarget.f2 - prevTarget.f2);
            const f3 = prevTarget.f3 + smoothAlpha * (nextTarget.f3 - prevTarget.f3);

            // Interpolate amplitude with faster attack/decay
            const amp = prevTarget.amp + smoothAlpha * (nextTarget.amp - prevTarget.amp);

            f1Points.push({ t, freq: f1, amp: amp * FORMANT_AMPLITUDES.F1 });
            f2Points.push({ t, freq: f2, amp: amp * FORMANT_AMPLITUDES.F2 });
            f3Points.push({ t, freq: f3, amp: amp * FORMANT_AMPLITUDES.F3 });
        }

        return {
            duration: totalDuration,
            formants: {
                F1: { color: '#e63946', trajectory: f1Points },
                F2: { color: '#457b9d', trajectory: f2Points },
                F3: { color: '#2a9d8f', trajectory: f3Points }
            }
        };
    }

    /**
     * Convert text directly to formant trajectory
     */
    textToTrajectory(text) {
        const phonemes = this.textToPhonemes(text);
        return this.phonemesToTrajectory(phonemes);
    }
}
