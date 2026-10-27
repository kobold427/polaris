'use strict';
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Tones = factory();
}(typeof self !== 'undefined' ? self : this, () => {
  const TONES = [
    { id: 'bell', name: 'Bell', seconds: 2.2 },
    { id: 'chime', name: 'Chime', seconds: 1.9 },
    { id: 'digital', name: 'Digital', seconds: 0.8 },
    { id: 'soft', name: 'Soft', seconds: 1.9 },
  ];
  const IDS = TONES.map((t) => t.id);
  const MAX_CUSTOM_SEC = 30;

  const gainOf = (volume) => {
    const v = Math.min(100, Math.max(0, Number(volume)));
    return Number.isFinite(v) ? (v / 100) ** 2 : 0.49;
  };

  function voice(ctx, out, t, freq, dur, { type = 'sine', peak = 0.5, attack = 0.008 } = {}) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(out);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }

  const PLAY = {
    bell(ctx, out, t) {
      [[1, 0.5, 2.0], [2.76, 0.22, 1.3], [5.4, 0.1, 0.8], [8.93, 0.05, 0.5]].forEach(([k, peak, dur]) => voice(ctx, out, t, 880 * k, dur, { peak }));
    },
    chime(ctx, out, t) {
      [1046.5, 1318.5, 1568].forEach((f, i) => {
        voice(ctx, out, t + i * 0.24, f, 1.1, { peak: 0.42 });
        voice(ctx, out, t + i * 0.24, f * 2, 0.5, { peak: 0.08 });
      });
    },
    digital(ctx, out, t) {
      [0, 0.2, 0.4].forEach((d) => voice(ctx, out, t + d, 1000, 0.13, { type: 'square', peak: 0.16, attack: 0.004 }));
    },
    soft(ctx, out, t) {
      voice(ctx, out, t, 659.25, 1.3, { type: 'triangle', peak: 0.45, attack: 0.02 });
      voice(ctx, out, t + 0.38, 523.25, 1.5, { type: 'triangle', peak: 0.45, attack: 0.02 });
    },
  };

  function schedule(ctx, id, { volume = 70, at } = {}) {
    const tone = TONES.find((x) => x.id === id) || TONES[0];
    const master = ctx.createGain();
    master.gain.value = gainOf(volume);
    master.connect(ctx.destination);
    PLAY[tone.id](ctx, master, at == null ? ctx.currentTime + 0.02 : at);
    return tone.seconds;
  }

  function playBuffer(ctx, buffer, { volume = 70, at } = {}) {
    const t = at == null ? ctx.currentTime + 0.02 : at;
    const dur = Math.min(buffer.duration, MAX_CUSTOM_SEC);
    const src = ctx.createBufferSource();
    const g = ctx.createGain();
    src.buffer = buffer;
    g.gain.setValueAtTime(gainOf(volume), t);
    if (buffer.duration > MAX_CUSTOM_SEC) {
      g.gain.setValueAtTime(gainOf(volume), t + dur - 0.3);
      g.gain.linearRampToValueAtTime(0, t + dur);
    }
    src.connect(g);
    g.connect(ctx.destination);
    src.start(t);
    src.stop(t + dur + 0.05);
    return dur;
  }

  return { TONES, IDS, MAX_CUSTOM_SEC, gainOf, schedule, playBuffer };
}));
