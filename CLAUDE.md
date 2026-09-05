# CLAUDE.md

## What this is

**Soundo** — a browser-based live voice-changer for kids ("magic microphone"). Static site,
no build step, no backend. Deployed to GitHub Pages, used mainly on mobile.

Repo: https://github.com/asukiasov/Soundo

## Architecture

Plain HTML/CSS/JS, no framework, no bundler. Load order in `index.html`:
`effects.js` → `audio-engine.js` → `app.js` (globals on `window`, IIFE modules).

- **`js/effects.js`** — `window.SoundoEffects`. Each effect is a factory `(ctx) => { input,
  output, setAmount(0..1), start(), dispose() }`. Current effects: `robot` (ring modulator +
  waveshaper), `monster` (two-tap crossfading delay-line pitch shifter + lowpass + drive).
- **`js/audio-engine.js`** — `window.AudioEngine`. Owns the `AudioContext`, mic
  `getUserMedia`, the fixed graph `micSource → inputGain → [effect] → outGain →
  {monitorGain → destination, recDest → MediaRecorder}`. `setEffect` hot-swaps the effect
  node with a short teardown delay.
- **`js/app.js`** — screen flow (home / recording / playback), button rows, timer, save.

## Conventions

- No dependencies. Keep it that way — everything is Web Audio / DOM built-ins.
- `AudioContext` is created and resumed only inside a user-gesture handler (mobile autoplay
  policy). `engine.init()` is idempotent.
- Effects must ramp parameters (`setTargetAtTime`) — no zipper noise.
- Touch-first CSS: large targets, no hover-only UI, respect `env(safe-area-inset-*)`.
- `MediaRecorder` mime type is feature-detected (`webm/opus` → `webm` → `mp4` → `ogg`);
  file extension follows the actual blob type.

## Adding an effect

Append an entry to `SoundoEffects.list` with `{ id, name, emoji, factory }`. The UI builds
buttons from that list automatically — no other changes needed.

## Deploy

Push to `main` → `.github/workflows/deploy.yml` → GitHub Pages. Pages source must be set to
"GitHub Actions" in repo settings. `.nojekyll` is present.

## Testing

No automated tests — it needs a real mic and browser. Use the manual checklist in
`README.md` on iOS Safari + Android Chrome after any audio change.

## Docs

Design spec: `docs/superpowers/specs/2026-09-05-soundo-design.md`.
