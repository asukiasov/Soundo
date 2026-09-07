/* Soundo audio engine: mic -> effect chain -> (live monitor + recorder). */
(function (global) {
  'use strict';

  function pickMime() {
    if (typeof MediaRecorder === 'undefined') return null;
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/ogg;codecs=opus',
    ];
    for (const t of types) {
      if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) return t;
    }
    return ''; // let the browser choose
  }

  function AudioEngine() {
    this.ctx = null;
    this.micStream = null;
    this.micSource = null;
    this.inputGain = null;
    this.outGain = null;
    this.monitorGain = null;
    this.recDest = null;
    this.effect = null;
    this.effectId = null;
    this.amount = 0.5;
    this.recorder = null;
    this.chunks = [];
    this.lastBlob = null;
    this.mime = '';
  }

  AudioEngine.prototype.init = async function () {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      return;
    }
    const Ctx = global.AudioContext || global.webkitAudioContext;
    this.ctx = new Ctx({ latencyHint: 'interactive' });
    if (this.ctx.state === 'suspended') await this.ctx.resume();

    // Load the pitch-shifter worklet (used by Monster). Non-fatal on failure.
    this.workletLoaded = false;
    try {
      if (this.ctx.audioWorklet) {
        await this.ctx.audioWorklet.addModule('js/pitch-processor.js?v=5');
        this.workletLoaded = true;
      }
    } catch (e) {
      console.warn('pitch-shifter worklet failed to load:', e);
    }

    // On phones, noiseSuppression + autoGainControl select a lower-latency,
    // DSP-tuned capture path and keep levels up / hiss out of the distortion.
    // echoCancellation stays OFF everywhere: in Listen mode the processed voice
    // is played to the speaker, and AEC would duck the mic signal as "echo".
    // Desktop keeps the fully raw signal for fidelity.
    this.isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    const proc = this.isMobile;
    this.micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: proc,
        autoGainControl: proc,
      },
      video: false,
    });

    const ctx = this.ctx;
    this.micSource = ctx.createMediaStreamSource(this.micStream);
    this.inputGain = ctx.createGain();
    this.outGain = ctx.createGain();
    this.monitorGain = ctx.createGain();   // on/off switch for Listen
    this.monitorGain.gain.value = 0;
    this.boostGain = ctx.createGain();     // user Volume control (Listen only)
    this.boostGain.gain.value = 1.5;
    this.limiter = ctx.createDynamicsCompressor(); // guard against clipping/feedback
    this.limiter.threshold.value = -6;
    this.limiter.knee.value = 6;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.15;
    this.recDest = ctx.createMediaStreamDestination();

    this.micSource.connect(this.inputGain);
    // Listen path gets the user Volume boost + limiter; recording stays flat.
    this.outGain.connect(this.monitorGain);
    this.monitorGain.connect(this.boostGain).connect(this.limiter).connect(ctx.destination);
    this.outGain.connect(this.recDest);

    this.mime = pickMime();
    if (this.mime !== null) {
      const opts = this.mime ? { mimeType: this.mime } : undefined;
      this.recorder = new MediaRecorder(this.recDest.stream, opts);
      this.recorder.ondataavailable = (e) => { if (e.data && e.data.size) this.chunks.push(e.data); };
      this.recorder.onstop = () => {
        this.lastBlob = new Blob(this.chunks, { type: this.recorder.mimeType || 'audio/webm' });
        this.chunks = [];
        if (this._onRecStop) this._onRecStop(this.lastBlob);
      };
    }

    if (this.boostPct) this.setMonitorVolume(this.boostPct);
  };

  AudioEngine.prototype.getDiagnostics = function () {
    if (!this.ctx) return { ready: false };
    const track = this.micStream && this.micStream.getAudioTracks()[0];
    const s = (track && track.getSettings && track.getSettings()) || {};
    return {
      ready: true,
      ua: navigator.userAgent,
      workletLoaded: !!this.workletLoaded,
      ctxSampleRate: this.ctx.sampleRate,
      baseLatencyMs: this.ctx.baseLatency != null ? Math.round(this.ctx.baseLatency * 1000) : null,
      outputLatencyMs: this.ctx.outputLatency != null ? Math.round(this.ctx.outputLatency * 1000) : null,
      micSampleRate: s.sampleRate || null,
      micChannelCount: s.channelCount || null,
      echoCancellation: s.echoCancellation,
      noiseSuppression: s.noiseSuppression,
      autoGainControl: s.autoGainControl,
      latency: s.latency != null ? s.latency : null,
      effect: this.effectId,
      recording: this.recorder && this.recorder.state === 'recording',
      mime: this.mime,
    };
  };

  AudioEngine.prototype.setEffect = function (id) {
    if (!this.ctx || id === this.effectId) return;
    const def = global.SoundoEffects.get(id);
    if (!def) return;

    const next = def.factory(this.ctx);
    this.inputGain.connect(next.input);
    next.output.connect(this.outGain);
    next.setAmount(this.amount);
    next.start();

    const prev = this.effect;
    if (prev) {
      try { this.inputGain.disconnect(prev.input); } catch (e) {}
      // let the tail flush, then tear down
      setTimeout(() => prev.dispose(), 200);
    }
    this.effect = next;
    this.effectId = id;
  };

  AudioEngine.prototype.setAmount = function (pct) {
    this.amount = Math.max(0, Math.min(1, pct / 100));
    if (this.effect) this.effect.setAmount(this.amount);
  };

  AudioEngine.prototype.setMonitor = function (on) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.monitorGain.gain.setTargetAtTime(on ? 1 : 0, t, 0.02);
  };

  // pct 50..400 -> gain 0.5..4.0
  AudioEngine.prototype.setMonitorVolume = function (pct) {
    this.boostPct = pct;
    if (!this.ctx) return;
    const g = Math.max(0.1, Math.min(4, pct / 100));
    this.boostGain.gain.setTargetAtTime(g, this.ctx.currentTime, 0.03);
  };

  AudioEngine.prototype.startRecording = function () {
    if (!this.recorder || this.recorder.state === 'recording') return false;
    this.chunks = [];
    this.lastBlob = null;
    this.recorder.start();
    return true;
  };

  AudioEngine.prototype.stopRecording = function (cb) {
    this._onRecStop = cb;
    if (this.recorder && this.recorder.state === 'recording') this.recorder.stop();
  };

  AudioEngine.prototype.fileExtension = function () {
    const m = (this.lastBlob && this.lastBlob.type) || this.mime || '';
    if (m.indexOf('mp4') >= 0) return 'm4a';
    if (m.indexOf('ogg') >= 0) return 'ogg';
    return 'webm';
  };

  AudioEngine.prototype.canRecord = function () {
    return !!this.recorder;
  };

  global.AudioEngine = AudioEngine;
})(window);
