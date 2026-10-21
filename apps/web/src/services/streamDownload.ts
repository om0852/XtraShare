// Main-thread side of the streaming download (see public/sw-download.js).
//
// Lets large received files be saved to disk as a true streamed browser
// download — bytes are pushed one small piece at a time over a
// MessageChannel to a dedicated Service Worker, which exposes them as a
// fetch Response body. This avoids ever materializing the whole file as one
// in-memory Blob, which is what crashes memory-constrained (mobile) tabs on
// multi-GB transfers right at 100%, during final assembly.
//
// Requires a secure context (HTTPS or localhost) for Service Workers to be
// available at all — falls back to the caller's alternate path otherwise.

const DOWNLOAD_SW_URL = '/sw-download.js';
const DOWNLOAD_SW_SCOPE = '/__xtrashare_download__/';

let registrationPromise: Promise<ServiceWorkerRegistration> | null = null;

function registerDownloadWorker(): Promise<ServiceWorkerRegistration> {
  if (!registrationPromise) {
    registrationPromise = navigator.serviceWorker
      .register(DOWNLOAD_SW_URL, { scope: DOWNLOAD_SW_SCOPE })
      .then(async (reg) => {
        if (reg.installing || reg.waiting) {
          await new Promise<void>((resolve) => {
            const worker = reg.installing || reg.waiting;
            if (!worker) return resolve();
            worker.addEventListener('statechange', function onChange() {
              if (worker.state === 'activated') {
                worker.removeEventListener('statechange', onChange);
                resolve();
              }
            });
          });
        }
        return reg;
      });
  }
  return registrationPromise;
}

export function isStreamDownloadSupported(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  // Mobile browsers (Android Chrome, iOS Safari) strictly block downloads originating from hidden iframes
  const isMobile = /android|iphone|ipad|ipod/i.test(navigator.userAgent);
  if (isMobile) return false;

  return (
    window.isSecureContext === true &&
    'serviceWorker' in navigator &&
    typeof ReadableStream !== 'undefined' &&
    typeof MessageChannel !== 'undefined'
  );
}

export class StreamDownloadWriter {
  private port: MessagePort | null = null;
  private readonly id: string;

  constructor(
    private readonly filename: string,
    private readonly size: number,
    private readonly mimeType: string
  ) {
    this.id = `dl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  /** Registers the stream with the SW and kicks off the actual browser download. */
  public async start(readyTimeoutMs = 8000): Promise<void> {
    const reg = await registerDownloadWorker();
    const controller = reg.active;
    if (!controller) {
      throw new Error('Download service worker is not active');
    }

    const channel = new MessageChannel();
    this.port = channel.port1;

    const ready = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Download worker did not become ready in time')), readyTimeoutMs);
      this.port!.onmessage = (e) => {
        if (e.data?.type === 'ready') {
          clearTimeout(timer);
          resolve();
        }
      };
    });

    controller.postMessage(
      {
        type: 'register-download',
        id: this.id,
        filename: this.filename,
        size: this.size,
        mimeType: this.mimeType
      },
      [channel.port2]
    );

    await ready;

    // Navigating a hidden iframe to the SW-intercepted URL is what makes
    // Chrome treat the response as a real, disk-streamed download instead
    // of something the page has to hold in memory.
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = `${DOWNLOAD_SW_SCOPE}${this.id}`;
    document.body.appendChild(iframe);
    setTimeout(() => iframe.remove(), 30000);
  }

  /** Writes one chunk. `buffer` is transferred (zero-copy), so don't reuse it after calling. */
  public write(buffer: ArrayBuffer): void {
    this.port?.postMessage({ type: 'chunk', buffer }, [buffer]);
  }

  public end(): void {
    this.port?.postMessage({ type: 'end' });
  }

  public abort(reason?: string): void {
    this.port?.postMessage({ type: 'abort', reason });
  }
}
