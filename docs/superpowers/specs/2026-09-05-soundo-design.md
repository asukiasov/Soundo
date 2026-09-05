# Soundo — Design

Date: 2026-09-05

## Purpose
A kids' live voice-changer web app ("children's microphone"). Static single-page app,
deployed to GitHub Pages, used on mobile devices.

## Screens
1. **Home** — title + two large effect buttons (🤖 Robot, 👹 Monster). Tapping one selects
   it and reveals a distortion slider (0–100%), a **Listen** button (live monitor) and a
   **Record** button.
2. **Recording** — elapsed timer, Stop button, and a bottom row of the same effect buttons
   so the child can switch timbre while recording. On Stop → playback controls + **Save**
   (downloads a WebM/Opus file).

## Audio (Web Audio API only, no libraries)
Graph: `getUserMedia → inputGain → effectChain → analyser → { destination (Listen), MediaStreamDestination → MediaRecorder }`

- **Robot**: ring modulator (oscillator × signal) + WaveShaper bitcrush.
- **Monster**: downward pitch shift (dual delay-line pitch shifter) + lowpass + drive.
- Distortion slider maps to each effect's key parameter; params are ramped to avoid clicks.
- Switching effect rebuilds the chain with smooth gain crossfade.

## Files
- `index.html`, `styles.css`
- `js/effects.js` — effect definitions (build nodes, apply amount)
- `js/audio-engine.js` — graph, mic, live monitor, MediaRecorder, save
- `js/app.js` — UI state machine, event wiring
- `CLAUDE.md`, `README.md`, `.gitignore`
- `.github/workflows/deploy.yml` — deploy to GitHub Pages on push to main

## Mobile
- AudioContext created/resumed on first user gesture.
- Large touch targets, no hover-only affordances.
- Listen mode shows a "use headphones" hint to avoid feedback.

## Testing
Manual smoke checklist in README (iOS Safari + Android Chrome): mic permission, each effect,
slider response, record → save.

## Out of scope (YAGNI)
Accounts, cloud storage, sharing integrations, more than two effects, waveform visualizer.
