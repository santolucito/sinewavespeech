# Sinewave Speech Demo

An interactive web demonstration of the **sinewave speech** phenomenon — a striking example of top-down processing in human speech perception.

**[Try the demo](https://santolucito.github.io/sinewavespeech)** (if hosted on GitHub Pages)

## What is Sinewave Speech?

Sinewave speech is a form of artificially degraded speech in which the complex acoustic signal is reduced to just **three pure sine waves** that track the center frequencies of the first three formants (F1, F2, F3).

Despite losing nearly all spectral detail, listeners can perceive these simple tones as intelligible speech — but typically only *after* hearing the original. This demonstrates **top-down processing**: once your brain knows what to expect, it can extract meaning from incredibly impoverished signals.

### The "Aha!" Moment

1. First, you hear strange electronic whistling sounds
2. Then you hear the original spoken phrase
3. When you replay the sinewave version, you suddenly *hear* the words

This perceptual shift is immediate and striking — you can't "unhear" the speech once you know what it says.

## The Science

This phenomenon was first described by [Remez, Rubin, Pisoni, & Carrell (1981)](https://doi.org/10.1126/science.7233191) and has become a classic demonstration in psycholinguistics and cognitive science.

**Formants** are resonant frequencies of the vocal tract that vary as we speak:
- **F1** (~250-900 Hz): Correlates with tongue height (high vowels have low F1)
- **F2** (~800-2500 Hz): Correlates with tongue frontness (front vowels have high F2)
- **F3** (~2000-3500 Hz): Helps distinguish liquids like /r/ (very low F3)

By tracking just these three frequencies with sine waves, we capture the essential "skeleton" of speech while removing pitch, timbre, and noise.

## Features

- **Type any text** and hear it as sinewave speech
- **Speech synthesis** for the original audio (no pre-recorded files needed)
- **Phoneme-to-formant mapping** based on acoustic phonetics research
- **Smooth formant trajectories** with cosine interpolation
- **Individual formant controls** — toggle F1, F2, F3 to hear their contributions
- **Real-time visualization** of formant contours
- **Responsive design** for desktop and mobile

## Usage

1. Type a phrase (or click an example)
2. Click **Generate** to create the sinewave version
3. Click **Play Sinewave** — you'll likely hear electronic whistles
4. Click **Hear Original** — listen to the spoken phrase
5. Click **Play Sinewave Again** — now you should perceive it as speech!

Try toggling individual formants to hear how each contributes to intelligibility. F2 typically carries the most information for consonant identification.

## Running Locally

```bash
# Clone the repository
git clone https://github.com/santolucito/sinewavespeech.git
cd sinewavespeech

# Start a local server (required for ES modules)
python3 -m http.server 8000

# Open in browser
open http://localhost:8000
```

## Technical Details

### Architecture

```
AudioContext
├── OscillatorNode (F1) → GainNode ─┐
├── OscillatorNode (F2) → GainNode ─┼→ GainNode (master) → destination
├── OscillatorNode (F3) → GainNode ─┘
└── SpeechSynthesis API (original)
```

### Formant Synthesis

The `PhonemeMapper` converts text to formant trajectories:

1. **Text → Phonemes**: Uses a dictionary of common words plus letter-to-phoneme rules
2. **Phonemes → Targets**: Each phoneme has target F1/F2/F3 values from acoustic phonetics literature (Peterson & Barney, 1952)
3. **Targets → Trajectory**: Smooth interpolation between targets using cosine easing

### Key Files

| File | Purpose |
|------|---------|
| `js/audio-engine.js` | WebAudio oscillator management |
| `js/phoneme-mapper.js` | Text-to-phoneme and phoneme-to-formant conversion |
| `js/formant-player.js` | Playback coordination |
| `js/ui-controller.js` | DOM and state management |

## Limitations

- The phoneme-to-formant mapping is approximate (not based on actual speech analysis)
- English only, with simplified pronunciation rules
- Speech synthesis voice varies by browser/OS
- Not all words have dictionary pronunciations; unknown words use letter rules

For research-quality sinewave speech, you would extract formants from real recordings using LPC analysis.

## References

- Remez, R. E., Rubin, P. E., Pisoni, D. B., & Carrell, T. D. (1981). Speech perception without traditional speech cues. *Science*, 212(4497), 947-949.
- Peterson, G. E., & Barney, H. L. (1952). Control methods used in a study of the vowels. *The Journal of the Acoustical Society of America*, 24(2), 175-184.
- [Wikipedia: Sinewave Speech](https://en.wikipedia.org/wiki/Sine_wave_speech)

## License

MIT
