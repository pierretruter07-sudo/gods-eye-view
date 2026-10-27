/**
 * Speaks Director lines. Browser voice for now; a premium voice provider can
 * be added behind the same speak()/stop() interface.
 */

const MAX_SPEECH_MS = 30_000;

function pickVoice(synth) {
  const voices = synth.getVoices?.() || [];
  const english = voices.filter((v) => /^en(-|_|$)/i.test(v.lang));
  return (
    english.find((v) =>
      /natural|neural|google uk english male|daniel/i.test(v.name),
    ) ||
    english.find((v) => /^en-(GB|AU)/i.test(v.lang)) ||
    english[0] ||
    null
  );
}

/** Roughly how long a line takes to say (for silent timing). */
export function spokenMs(text) {
  const words = String(text || '')
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.min(MAX_SPEECH_MS, Math.round((words / 2.6) * 1000));
}

/**
 * The speech voice belongs to the operating system, not the page: an
 * utterance already handed over can keep talking after the tab is hidden,
 * the window closed or the browser quit to the background (Pierre, 28 Oct:
 * "the audio will just keep playing ... until I close my laptop"). So the
 * Director never speaks while its page is hidden, and every way of leaving
 * the page cancels speech at once.
 */
export function createNarrator({
  synth = globalThis.speechSynthesis,
  log = console,
  doc = globalThis.document,
  win = globalThis.window,
} = {}) {
  let current = null;
  const hidden = () => Boolean(doc && doc.visibilityState === 'hidden');
  const silence = () => {
    try {
      synth?.cancel();
    } catch {
      /* no speech support */
    }
  };
  const onVisibility = () => {
    if (hidden()) stop();
  };
  doc?.addEventListener?.('visibilitychange', onVisibility);
  win?.addEventListener?.('pagehide', silence);
  win?.addEventListener?.('beforeunload', silence);
  win?.addEventListener?.('freeze', silence);

  function stop() {
    if (current) {
      current.done();
      current = null;
    }
    try {
      synth?.cancel();
    } catch {
      /* no speech support */
    }
  }

  /** Speak a line. Resolves when it ends, fails, is stopped or times out. */
  function speak(text, { signal } = {}) {
    stop();
    if (!text) return Promise.resolve();
    // Hidden page: keep the line's timing, say nothing.
    if (hidden() || !synth || typeof SpeechSynthesisUtterance === 'undefined')
      return silentWait(text, signal);
    log.info?.(`[tour] speaking: ${text}`);
    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      const voice = pickVoice(synth);
      if (voice) utterance.voice = voice;
      utterance.rate = 0.95;
      const timer = setTimeout(() => entry.done(), MAX_SPEECH_MS);
      const onAbort = () => stop();
      const entry = {
        done() {
          clearTimeout(timer);
          signal?.removeEventListener('abort', onAbort);
          if (current === entry) current = null;
          resolve();
        },
      };
      current = entry;
      utterance.onend = () => entry.done();
      utterance.onerror = () => entry.done();
      signal?.addEventListener('abort', onAbort, { once: true });
      // Chrome can stay paused after a cancel(); resume before speaking.
      synth.resume?.();
      synth.speak(utterance);
    });
  }

  function silentWait(text, signal) {
    return new Promise((resolve) => {
      const timer = setTimeout(done, hidden() ? spokenMs(text) : 0);
      const entry = { done };
      function done() {
        clearTimeout(timer);
        signal?.removeEventListener('abort', done);
        if (current === entry) current = null;
        resolve();
      }
      current = entry;
      signal?.addEventListener('abort', done, { once: true });
    });
  }

  function destroy() {
    stop();
    doc?.removeEventListener?.('visibilitychange', onVisibility);
    win?.removeEventListener?.('pagehide', silence);
    win?.removeEventListener?.('beforeunload', silence);
    win?.removeEventListener?.('freeze', silence);
  }

  return { speak, stop, destroy };
}
