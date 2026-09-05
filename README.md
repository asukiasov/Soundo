# Soundo

A kids' live voice-changer — a "magic microphone" that distorts your voice in real time,
right in the browser. No installs, no server, works on phones.

**Live:** https://asukiasov.github.io/Soundo/

## How it works

1. Open the page and pick a voice — **🤖 Robot** or **👹 Monster**.
2. Drag the **Distortion** slider to taste.
3. **Listen** monitors your changed voice live (use headphones to avoid feedback), or
   **Record** to capture it.
4. While recording, tap a voice button at the bottom to switch the effect mid-take.
5. Stop → play it back → **Save** downloads the audio file.

All audio processing uses the Web Audio API. Nothing leaves the device.

## Develop

Pure static site — just serve the folder:

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

`getUserMedia` needs a secure context: `localhost` is fine; on a LAN IP use HTTPS.

### Files

| File | Purpose |
|------|---------|
| `index.html` / `styles.css` | markup + touch-first styling |
| `js/effects.js` | effect definitions (ring modulator, delay-line pitch shifter) |
| `js/audio-engine.js` | mic capture, effect chain, live monitor, `MediaRecorder` |
| `js/app.js` | screen flow and event wiring |

## Deploy

Push to `main`. `.github/workflows/deploy.yml` publishes to GitHub Pages.
One-time setup: repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.

## Manual test checklist

Test on **iOS Safari** and **Android Chrome**:

- [ ] Tapping a voice prompts for mic permission; granting it reveals the controls
- [ ] Denying permission shows a clear error
- [ ] Listen mode plays the altered voice; Stop silences it
- [ ] Distortion slider audibly changes the effect
- [ ] Record → timer runs → switching voice mid-recording works
- [ ] Stop → playback plays the recording
- [ ] Save downloads a playable file
- [ ] "New" returns to the home screen
