/**
 * videoMetadata.ts
 * ---------------------------------------------------------------------------
 * Reads duration + intrinsic resolution BEFORE the player is rendered, so the
 * preview never appears with stale/missing metadata (Phase 0, item 3).
 *
 * Implementation notes / battle scars:
 *  - A detached <video> can report loadedmetadata with videoWidth === 0 in
 *    Chromium, because the element never got a layout/media pipeline. The probe
 *    is therefore attached off-screen for the duration of the read and removed
 *    in cleanup.
 *  - Every object URL created here is revoked in `finally` (Phase 0, item 1).
 *  - The read is bounded by a timeout so the UI can never hang (Phase 0, item 2).
 */

export interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
}

export class VideoMetadataError extends Error {
  /** True when the browser refused to decode the container/codec. */
  readonly unreadable: boolean;

  constructor(message: string, unreadable = true) {
    super(message);
    this.name = 'VideoMetadataError';
    this.unreadable = unreadable;
  }
}

export const METADATA_TIMEOUT_MS = 15000;
const DIMENSION_GRACE_MS = 4000;

export function readVideoMetadata(file: Blob, timeoutMs = METADATA_TIMEOUT_MS): Promise<VideoMetadata> {
  return new Promise<VideoMetadata>((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new VideoMetadataError('Metadata probing requires a browser environment.', false));
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement('video');
    const host = document.createElement('div');
    let settled = false;
    let dimensionTimer = 0;

    host.setAttribute('aria-hidden', 'true');
    host.style.cssText =
      'position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;';
    host.appendChild(video);
    document.body.appendChild(host);

    const cleanup = () => {
      window.clearTimeout(timer);
      window.clearTimeout(dimensionTimer);
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('loadeddata', onFrameReady);
      video.removeEventListener('resize', onFrameReady);
      video.removeEventListener('error', onError);
      video.removeAttribute('src');
      video.load(); // release the decoder
      host.remove();
      // Phase 0 / item 1: the probe URL never outlives this function.
      URL.revokeObjectURL(objectUrl);
    };

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn();
    };

    const succeedIfReady = () => {
      const width = video.videoWidth;
      const height = video.videoHeight;
      if (width <= 0 || height <= 0) return false;
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      finish(() => resolve({ duration, width, height }));
      return true;
    };

    function onFrameReady() {
      succeedIfReady();
    }

    function onLoadedMetadata() {
      if (succeedIfReady()) return;
      // Dimensions are not populated yet: give the decoder a short grace window
      // instead of failing a perfectly good file.
      window.clearTimeout(dimensionTimer);
      dimensionTimer = window.setTimeout(() => {
        const duration = Number.isFinite(video.duration) ? video.duration : 0;
        if (duration <= 0) {
          finish(() => reject(new VideoMetadataError('The video reported no duration or resolution.')));
          return;
        }
        finish(() => resolve({ duration, width: video.videoWidth, height: video.videoHeight }));
      }, DIMENSION_GRACE_MS);
    }

    function onError() {
      finish(() =>
        reject(
          new VideoMetadataError(
            'The browser could not decode this video. It may be corrupted or use a codec that is not supported here.',
          ),
        ),
      );
    }

    const timer = window.setTimeout(() => {
      finish(() => reject(new VideoMetadataError('Reading the video metadata timed out.', false)));
    }, timeoutMs);

    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('loadeddata', onFrameReady);
    video.addEventListener('resize', onFrameReady);
    video.addEventListener('error', onError);
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.src = objectUrl;

    // Extremely fast files can resolve before listeners attach in some engines.
    if (video.readyState >= 1) onLoadedMetadata();
  });
}
