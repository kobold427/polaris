'use strict';
(() => {
  let ctx = null;
  const context = () => {
    if (!ctx || ctx.state === 'closed') ctx = new AudioContext();
    return ctx;
  };

  async function play({ tone, volume, data }) {
    const c = context();
    if (c.state === 'suspended') await c.resume();
    if (data && data.byteLength) {
      try {
        const bytes = data instanceof ArrayBuffer ? data.slice(0) : data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
        const buf = await c.decodeAudioData(bytes);
        window.Tones.playBuffer(c, buf, { volume });
        return;
      } catch (e) {
        console.warn('audio: cannot decode the file, playing the bell instead:', e && e.message);
      }
    }
    window.Tones.schedule(c, window.Tones.IDS.includes(tone) ? tone : 'bell', { volume });
  }

  window.api.audio.onPlay((msg) => { play(msg || {}).catch((e) => console.warn('audio:', e && e.message)); });
})();
