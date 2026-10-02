import { exec, spawn } from 'node:child_process';
import os from 'node:os';

const platform = os.platform();

/**
 * Reads text from system clipboard across Windows, macOS, and Linux.
 */
export async function readSystemClipboard(): Promise<string> {
  return new Promise((resolve) => {
    try {
      if (platform === 'win32') {
        exec('powershell.exe -NoProfile -Command "Get-Clipboard"', { timeout: 3000 }, (err, stdout) => {
          if (err || !stdout) {
            resolve('');
          } else {
            resolve(stdout.replace(/\r\n$/, '').replace(/\n$/, ''));
          }
        });
      } else if (platform === 'darwin') {
        exec('pbpaste', { timeout: 2000 }, (err, stdout) => {
          if (err || !stdout) resolve('');
          else resolve(stdout);
        });
      } else {
        // Linux (try wl-paste then xclip then xsel)
        exec('wl-paste 2>/dev/null || xclip -selection clipboard -o 2>/dev/null || xsel --clipboard --output 2>/dev/null', { timeout: 2000 }, (err, stdout) => {
          if (err || !stdout) resolve('');
          else resolve(stdout);
        });
      }
    } catch {
      resolve('');
    }
  });
}

/**
 * Writes text into system clipboard across Windows, macOS, and Linux.
 */
export async function writeSystemClipboard(text: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      if (platform === 'win32') {
        // Pipe text to powershell Set-Clipboard
        const ps = spawn('powershell.exe', ['-NoProfile', '-Command', '$input | Set-Clipboard']);
        ps.stdin.write(text);
        ps.stdin.end();
        ps.on('close', (code) => resolve(code === 0));
        ps.on('error', () => resolve(false));
      } else if (platform === 'darwin') {
        const proc = spawn('pbcopy');
        proc.stdin.write(text);
        proc.stdin.end();
        proc.on('close', (code) => resolve(code === 0));
        proc.on('error', () => resolve(false));
      } else {
        // Linux
        const proc = spawn('sh', ['-c', 'wl-copy 2>/dev/null || xclip -selection clipboard 2>/dev/null || xsel --clipboard --input 2>/dev/null']);
        proc.stdin.write(text);
        proc.stdin.end();
        proc.on('close', (code) => resolve(code === 0));
        proc.on('error', () => resolve(false));
      }
    } catch {
      resolve(false);
    }
  });
}
