/**
 * Sanitizes an untrusted filename received from a peer.
 * Strips path traversal sequences, illegal OS characters, control characters,
 * and limits length to 255 bytes.
 */
export function sanitizeFilename(rawName: string): string {
  if (!rawName || typeof rawName !== 'string') {
    return 'downloaded_file';
  }

  // Strip path traversal sequences like ../ or ..\
  let safe = rawName.replace(/^.*[\\/]/, '');

  // Strip illegal Windows & POSIX characters: < > : " / \ | ? * and control chars
  // eslint-disable-next-line no-control-regex
  safe = safe.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');

  // Strip leading dots to prevent hidden files (.bashrc, .env)
  safe = safe.replace(/^\.+/, '');

  // Trim whitespace
  safe = safe.trim();

  // Enforce length limit
  if (safe.length > 200) {
    const extMatch = safe.match(/\.([a-zA-Z0-9]+)$/);
    const ext = extMatch ? `.${extMatch[1]}` : '';
    safe = safe.substring(0, 190) + ext;
  }

  return safe || 'downloaded_file';
}

/**
 * Formats bytes into human-readable string (KB, MB, GB).
 */
export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}
