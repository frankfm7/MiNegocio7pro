import { useStore } from '../store';

type SoundType = 'success' | 'error' | 'click';

export const SoundEffects = {
  play(type: SoundType) {
    if (!useStore.getState().soundEnabled) return;
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      const cfg = { success: [800, 0.3, 0.2], error: [200, 0.3, 0.3], click: [600, 0.1, 0.1] }[type];
      osc.frequency.value = cfg[0];
      gain.gain.setValueAtTime(cfg[1], ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + cfg[2]);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + cfg[2]);
    } catch { /* sin audio */ }
  },
};
