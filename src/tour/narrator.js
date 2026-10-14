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

export function createNarrator({
  synth = globalThis.speechSynthesis,
  log = console,
} = {}) {
  let current = null;

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
    if (!text || !synth || typeof SpeechSynthesisUtterance === 'undefined')
      return Promise.resolve();
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

  return { speak, stop };
}
