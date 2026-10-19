/** One decoder per active camera; both surfaces consume this video element. */
export function attachCctvVideo(
  video,
  url,
  feedType,
  {
    // hls.js loads on demand, only when a live stream is opened. Browsers
    // with native HLS (Safari) play it directly; on failure the caller
    // falls back to the still frame.
    loadHls = () => import('hls.js'),
    onFailure = () => {},
    fetchImpl = globalThis.fetch,
  } = {},
) {
  // Preserve replay for existing finite video feeds; live HLS must not loop.
  video.loop = feedType !== 'hls';
  let disposed = false;
  let hls = null;
  const leaseId = feedType === 'hls' ? globalThis.crypto.randomUUID() : null;
  const mediaUrl =
    feedType === 'hls'
      ? `${url}${url.includes('?') ? '&' : '?'}lease=${leaseId}`
      : url;
  let timer = null;
  let startup = null;
  let governor = null;
  let retries = 0;
  const release = () => {
    if (feedType === 'hls') {
      void fetchImpl?.(mediaUrl, { method: 'DELETE', keepalive: true }).catch(
        () => {},
      );
    }
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    clearTimeout(timer);
    clearTimeout(startup);
    clearInterval(governor);
    hls?.destroy();
    hls = null;
    video.removeEventListener('canplay', play);
    video.removeEventListener('error', onVideoError);
    video.pause();
    video.removeAttribute('src');
    video.load();
    release();
  };
  const fail = (reason = 'unknown') => {
    if (disposed) return;
    // One line for diagnosing a stream that falls back to its still.
    console.warn(`[cctv] video fell back to still (${feedType}): ${reason}`);
    dispose();
    onFailure(reason);
  };
  const play = () => {
    if (disposed) return;
    clearTimeout(startup);
    video.play().catch(() => {});
  };
  video.addEventListener('canplay', play);
  const onVideoError = () =>
    fail(
      `media error ${video.error?.code ?? '?'} ${video.error?.message || ''}`.trim(),
    );
  video.addEventListener('error', onVideoError);
  startup = setTimeout(() => fail('no playable frames within 30 s'), 30000);
  const ready = (async () => {
    if (feedType !== 'hls') {
      video.src = mediaUrl;
      return;
    }
    try {
      const { default: Hls } = await loadHls();
      if (disposed) return;
      if (!Hls.isSupported()) {
        if (video.canPlayType('application/vnd.apple.mpegurl'))
          video.src = mediaUrl;
        else fail('no HLS support in this browser');
        return;
      }
      hls = new Hls({
        enableWorker: true,
        maxBufferLength: 24,
        maxMaxBufferLength: 30,
        backBufferLength: 0,
        maxBufferSize: 16 * 1024 * 1024,
        liveSyncDurationCount: 3,
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (disposed || !data?.fatal) return;
        const why = `hls ${data.type}/${data.details}${data.reason ? ` (${data.reason})` : ''}${data.response?.code ? ` HTTP ${data.response.code}` : ''}`;
        console.warn(`[cctv] ${why}`);
        if (++retries > 2) {
          fail(why);
          return;
        }
        clearTimeout(timer);
        timer = setTimeout(() => {
          if (disposed) return;
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
          else hls.loadSource(mediaUrl);
        }, 2000);
      });
      governor = setInterval(() => {
        if (disposed || !video.buffered?.length) return;
        const ahead =
          video.buffered.end(video.buffered.length - 1) - video.currentTime;
        // Some agency encoders publish less media time than wall time. Bound
        // correction rather than repeatedly draining the live buffer at 1x.
        video.playbackRate =
          ahead < 6 ? 0.8 : ahead < 12 ? 0.9 : ahead > 24 ? 1.05 : 1;
      }, 1000);
      hls.attachMedia(video);
      hls.loadSource(mediaUrl);
    } catch (error) {
      fail(`player failed to load: ${error?.message || error}`);
    }
  })();
  return { dispose, ready };
}
