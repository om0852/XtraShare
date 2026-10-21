// Streaming-download Service Worker (StreamSaver.js-style pattern).
//
// Why this exists: assembling a received file into one big in-memory Blob
// (even via Blob-of-Blob composition) still requires the browser to be able
// to hold/transfer the WHOLE file's bytes to produce a download — and on
// memory-constrained mobile tabs, a multi-GB file blows the renderer's
// budget right at the finish line ("Aw, Snap!"), after every chunk was
// already received successfully.
//
// Fix: the main thread streams bytes to THIS worker over a MessageChannel,
// one small piece at a time, and this worker exposes those bytes as the
// body of a fetch Response. When the page navigates a hidden iframe to the
// special URL below, Chrome's native download pipeline consumes that
// Response as a real streamed download — writing straight to disk as bytes
// arrive, so the renderer never needs more than one chunk resident at once.
//
// Scoped to /__xtrashare_download__/ only, registered separately from the
// app's general offline-cache service worker (sw.js) so it can't interfere
// with page caching / HMR.

const pending = new Map(); // downloadId -> { stream, filename, size, mimeType }

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.type !== 'register-download') return;

  const { id, filename, size, mimeType } = data;
  const port = event.ports[0];
  if (!port) return;

  const stream = new ReadableStream({
    start(controller) {
      port.onmessage = (e) => {
        const msg = e.data;
        if (!msg) return;
        if (msg.type === 'chunk') {
          controller.enqueue(new Uint8Array(msg.buffer));
        } else if (msg.type === 'end') {
          try { controller.close(); } catch {}
          pending.delete(id);
        } else if (msg.type === 'abort') {
          try { controller.error(new Error(msg.reason || 'Transfer aborted')); } catch {}
          pending.delete(id);
        }
      };
      port.postMessage({ type: 'ready' });
    },
    cancel() {
      pending.delete(id);
    }
  });

  pending.set(id, { stream, filename, size, mimeType });
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const match = url.pathname.match(/^\/__xtrashare_download__\/([^/]+)$/);
  if (!match) return; // not our URL — let it pass through untouched

  const id = match[1];
  const entry = pending.get(id);

  if (!entry) {
    event.respondWith(new Response('Download session not found or expired', { status: 404 }));
    return;
  }

  const headers = {
    'Content-Type': entry.mimeType || 'application/octet-stream',
    // filename*= handles non-ASCII names; plain filename= is the ASCII fallback
    'Content-Disposition': `attachment; filename="${encodeURIComponent(entry.filename)}"; filename*=UTF-8''${encodeURIComponent(entry.filename)}`,
    'Cache-Control': 'no-store'
  };
  if (entry.size) headers['Content-Length'] = String(entry.size);

  event.respondWith(new Response(entry.stream, { headers }));
});
