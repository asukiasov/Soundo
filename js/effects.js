/* Voice effects for Soundo.
 * Each effect is a factory: factory(ctx) -> {
 *   input:  AudioNode  (connect mic here)
 *   output: AudioNode  (connect this onward)
 *   setAmount(a)        a in 0..1, from the distortion slider
 *   start()             start internal oscillators (call once, after connect)
 *   dispose()           stop and disconnect everything
 * }
 *
 * Monster uses the 'pitch-shifter' AudioWorklet (js/pitch-processor.js). The
 * engine loads that module during init; if it is unavailable the effect
 * degrades to lowpass + drive without the pitch drop.
 */
(function (global) {
  'use strict';

  function makeDistortionCurve(k) {
    const n = 1024;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
    }
    return curve;
  }

  /* ---- Robot: ring modulator + gentle crunch --------------------------- */
  function robot(ctx) {
    const input = ctx.createGain();
    const output = ctx.createGain();

    const dry = ctx.createGain();
    const wet = ctx.createGain();
    const ring = ctx.createGain();
    ring.gain.value = 0; // driven by carrier
    const carrier = ctx.createOscillator();
    carrier.type = 'sine';
    carrier.frequency.value = 120;

    const shaper = ctx.createWaveShaper();
    shaper.curve = makeDistortionCurve(2.5);

    input.connect(dry).connect(output);
    input.connect(ring);
    carrier.connect(ring.gain);
    ring.connect(shaper).connect(wet).connect(output);

    dry.gain.value = 0.5;
    wet.gain.value = 0.7;

    return {
      input, output,
      setAmount(a) {
        const t = ctx.currentTime;
        carrier.frequency.setTargetAtTime(60 + a * 260, t, 0.02);
        dry.gain.setTargetAtTime(0.6 - 0.45 * a, t, 0.02);
        wet.gain.setTargetAtTime(0.35 + 0.5 * a, t, 0.02);
      },
      start() { carrier.start(); },
      dispose() {
        try { carrier.stop(); } catch (e) {}
        [input, output, dry, wet, ring, carrier, shaper].forEach(n => {
          try { n.disconnect(); } catch (e) {}
        });
      },
    };
  }

  /* ---- Monster: pitch down (worklet) + lowpass + drive ---------------- */
  function monster(ctx) {
    const input = ctx.createGain();
    const output = ctx.createGain();

    let shifter = null;
    try {
      shifter = new AudioWorkletNode(ctx, 'pitch-shifter', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        channelCount: 1,
        channelCountMode: 'explicit',
        outputChannelCount: [1],
      });
    } catch (e) {
      shifter = null; // module not loaded / unsupported
    }

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 1700;
    const drive = ctx.createWaveShaper();
    drive.curve = makeDistortionCurve(2.5);

    if (shifter) input.connect(shifter).connect(lowpass);
    else input.connect(lowpass);
    lowpass.connect(drive).connect(output);

    return {
      input, output,
      setAmount(a) {
        const t = ctx.currentTime;
        const semis = -(3 + a * 8); // -3 .. -11
        if (shifter) {
          shifter.parameters.get('ratio').setTargetAtTime(Math.pow(2, semis / 12), t, 0.05);
        }
        lowpass.frequency.setTargetAtTime(1900 - a * 1000, t, 0.03);
      },
      start() {},
      dispose() {
        [input, output, lowpass, drive].forEach(n => {
          try { n.disconnect(); } catch (e) {}
        });
        if (shifter) { try { shifter.disconnect(); } catch (e) {} }
      },
    };
  }

  global.SoundoEffects = {
    list: [
      { id: 'robot', name: 'Robot', emoji: '🤖', factory: robot },
      { id: 'monster', name: 'Monster', emoji: '👹', factory: monster },
    ],
    get(id) { return this.list.find(e => e.id === id); },
  };
})(window);
