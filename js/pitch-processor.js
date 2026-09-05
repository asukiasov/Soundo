/* AudioWorklet: cheap constant-power two-grain delay-line pitch shifter.
 * One multiply-add ring buffer + two windowed read taps per sample.
 * Windows are wA = sin(pi*phase), wB = |cos(pi*phase)| so wA^2 + wB^2 = 1
 * and each window is zero exactly at its grain's sawtooth reset -> no clicks.
 */
class PitchShifter extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: 'ratio', defaultValue: 0.6, minValue: 0.25, maxValue: 4, automationRate: 'k-rate' }];
  }

  constructor() {
    super();
    this.size = 8192;
    this.buf = new Float32Array(this.size);
    this.write = 0;
    this.grain = 2048; // ~43 ms @ 48 kHz
    this.phase = 0;
  }

  read(idx) {
    let i = idx % this.size;
    if (i < 0) i += this.size;
    const i0 = Math.floor(i);
    const frac = i - i0;
    const i1 = (i0 + 1) % this.size;
    return this.buf[i0] * (1 - frac) + this.buf[i1] * frac;
  }

  process(inputs, outputs, params) {
    const input = inputs[0];
    const output = outputs[0];
    if (!output || !output.length) return true;
    const out = output[0];
    const n = out.length;

    if (!input || !input.length || !input[0]) {
      out.fill(0);
      for (let c = 1; c < output.length; c++) output[c].set(out);
      return true;
    }

    const inp = input[0];
    const ratio = params.ratio[0];
    const inc = (1 - ratio) / this.grain;
    const PI = Math.PI;

    for (let i = 0; i < n; i++) {
      this.buf[this.write] = inp[i];

      let p = this.phase;
      const pB = p < 0.5 ? p + 0.5 : p - 0.5;

      const sA = this.read(this.write - p * this.grain);
      const sB = this.read(this.write - pB * this.grain);

      out[i] = sA * Math.sin(PI * p) + sB * Math.abs(Math.cos(PI * p));

      this.write = (this.write + 1) % this.size;
      p += inc;
      if (p >= 1) p -= 1;
      else if (p < 0) p += 1;
      this.phase = p;
    }

    for (let c = 1; c < output.length; c++) output[c].set(out);
    return true;
  }
}

registerProcessor('pitch-shifter', PitchShifter);
