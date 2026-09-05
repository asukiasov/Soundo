/* Voice effects for Soundo.
 * Each effect is a factory: factory(ctx) -> {
 *   input:  AudioNode  (connect mic here)
 *   output: AudioNode  (connect this onward)
 *   setAmount(a)        a in 0..1, from the distortion slider
 *   start()             start internal oscillators (call once, after connect)
 *   dispose()           stop and disconnect everything
 * }
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

  /* ---- Robot: ring modulator + crunch ------------------------------------ */
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
    shaper.curve = makeDistortionCurve(6);

    input.connect(dry).connect(output);
    input.connect(ring);
    carrier.connect(ring.gain);
    ring.connect(shaper).connect(wet).connect(output);

    dry.gain.value = 0.5;
    wet.gain.value = 0.8;

    return {
      input, output,
      setAmount(a) {
        carrier.frequency.setTargetAtTime(60 + a * 300, ctx.currentTime, 0.02);
        dry.gain.setTargetAtTime(0.6 - 0.5 * a, ctx.currentTime, 0.02);
        wet.gain.setTargetAtTime(0.4 + 0.6 * a, ctx.currentTime, 0.02);
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

  /* ---- Monster: pitch down + lowpass + drive ---------------------------- */
  function monster(ctx) {
    const input = ctx.createGain();
    const output = ctx.createGain();
    const windowSize = 0.08;

    const shifter = createPitchShifter(ctx, windowSize);
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 1400;
    const drive = ctx.createWaveShaper();
    drive.curve = makeDistortionCurve(4);

    input.connect(shifter.input);
    shifter.output.connect(lowpass).connect(drive).connect(output);

    return {
      input, output,
      setAmount(a) {
        // -4 to -13 semitones
        const semis = -(4 + a * 9);
        shifter.setRatio(Math.pow(2, semis / 12));
        lowpass.frequency.setTargetAtTime(1800 - a * 900, ctx.currentTime, 0.03);
      },
      start() { shifter.start(); },
      dispose() {
        shifter.dispose();
        [input, output, lowpass, drive].forEach(n => {
          try { n.disconnect(); } catch (e) {}
        });
      },
    };
  }

  /* ---- delay-line pitch shifter (two crossfading taps) ----------------- */
  function createPitchShifter(ctx, windowSize) {
    const input = ctx.createGain();
    const output = ctx.createGain();

    const taps = [0, 1].map(() => {
      const delay = ctx.createDelay(1);
      const gain = ctx.createGain();
      gain.gain.value = 0;
      input.connect(delay).connect(gain).connect(output);

      const ramp = ctx.createOscillator();
      ramp.type = 'sawtooth';
      const rampDepth = ctx.createGain();
      rampDepth.gain.value = windowSize / 2;
      const rampOffset = ctx.createConstantSource();
      rampOffset.offset.value = windowSize / 2;
      ramp.connect(rampDepth).connect(delay.delayTime);
      rampOffset.connect(delay.delayTime);

      const fade = ctx.createOscillator();
      fade.type = 'triangle';
      const fadeDepth = ctx.createGain();
      fadeDepth.gain.value = 0.5;
      const fadeOffset = ctx.createConstantSource();
      fadeOffset.offset.value = 0.5;
      fade.connect(fadeDepth).connect(gain.gain);
      fadeOffset.connect(gain.gain);

      return { delay, gain, ramp, rampDepth, rampOffset, fade, fadeDepth, fadeOffset };
    });

    function setRatio(r) {
      // freq of the delay ramp that produces pitch ratio r
      let freq = (1 - r) / windowSize;
      if (!isFinite(freq)) freq = 0;
      const f = Math.abs(freq);
      taps.forEach(t => {
        t.ramp.frequency.setTargetAtTime(freq, ctx.currentTime, 0.03);
        t.fade.frequency.setTargetAtTime(f, ctx.currentTime, 0.03);
      });
    }

    function start() {
      const now = ctx.currentTime;
      const half = 0; // taps started together; triangle offset handled below
      taps.forEach((t, i) => {
        // stagger tap 1 by half a nominal window for crossfade coverage
        const t0 = now + (i === 1 ? windowSize / 2 : 0);
        t.ramp.start(t0);
        t.rampOffset.start(t0);
        t.fade.start(t0);
        t.fadeOffset.start(t0);
      });
    }

    function dispose() {
      taps.forEach(t => {
        ['ramp', 'rampOffset', 'fade', 'fadeOffset'].forEach(k => {
          try { t[k].stop(); } catch (e) {}
        });
        Object.values(t).forEach(n => { try { n.disconnect(); } catch (e) {} });
      });
      try { input.disconnect(); } catch (e) {}
      try { output.disconnect(); } catch (e) {}
    }

    setRatio(0.6);
    return { input, output, setRatio, start, dispose };
  }

  global.SoundoEffects = {
    list: [
      { id: 'robot', name: 'Robot', emoji: '🤖', factory: robot },
      { id: 'monster', name: 'Monster', emoji: '👹', factory: monster },
    ],
    get(id) { return this.list.find(e => e.id === id); },
  };
})(window);
