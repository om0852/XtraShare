import React, { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import {
  X,
  Camera,
  Upload,
  AlertCircle,
  CheckCircle2,
  Flashlight,
  RefreshCw,
  ArrowRight,
  Lock
} from 'lucide-react';
import { useUIStore } from '../store/uiStore.js';
import { socketService } from '../services/socket.js';

/**
 * Multi-tier progressive camera constraint resolver.
 * Handles desktop webcams, laptops with front-only cameras, and mobile rear cameras.
 */
async function acquireCameraStream(preferredMode: 'environment' | 'user'): Promise<MediaStream> {
  const fallbackMode = preferredMode === 'environment' ? 'user' : 'environment';

  // Strategy 1: Ideal facingMode + ideal 720p resolution
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: preferredMode },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    });
  } catch (err1: any) {
    if (err1.name === 'NotAllowedError' || err1.name === 'PermissionDeniedError') {
      throw err1;
    }
    console.warn(`Camera strategy 1 (ideal ${preferredMode} 720p) failed, trying strategy 2...`, err1);
  }

  // Strategy 2: Ideal facingMode only (no resolution constraints)
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: preferredMode }
      },
      audio: false
    });
  } catch (err2: any) {
    if (err2.name === 'NotAllowedError' || err2.name === 'PermissionDeniedError') {
      throw err2;
    }
    console.warn(`Camera strategy 2 (ideal ${preferredMode}) failed, trying strategy 3...`, err2);
  }

  // Strategy 3: Try alternate camera mode (e.g. front/user webcam on PC/laptop)
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: fallbackMode }
      },
      audio: false
    });
  } catch (err3: any) {
    if (err3.name === 'NotAllowedError' || err3.name === 'PermissionDeniedError') {
      throw err3;
    }
    console.warn(`Camera strategy 3 (ideal ${fallbackMode}) failed, trying strategy 4...`, err3);
  }

  // Strategy 4: Fallback to any available video input without any constraints
  return await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: false
  });
}

export const QRScannerModal: React.FC = () => {
  const { isQrScannerOpen, setQrScannerOpen } = useUIStore();

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [, setStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scannedCode, setScannedCode] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [isStarting, setIsStarting] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [isJoining, setIsJoining] = useState(false);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (e) {
          console.warn('Error stopping camera track:', e);
        }
      });
      streamRef.current = null;
    }
    setStream(null);
    setTorchOn(false);
    setHasTorch(false);
  };

  const startCamera = async (mode: 'environment' | 'user') => {
    setCameraError(null);
    setIsStarting(true);
    stopCamera();

    // 1. Check secure context
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      setIsStarting(false);
      setCameraError(
        'Camera access requires HTTPS. Mobile browsers block camera on plain HTTP. ' +
        'Tap "Switch to HTTPS" below (or open https://' + window.location.host + ') and accept the dev certificate warning to activate camera.'
      );
      return;
    }

    // 2. Check navigator.mediaDevices support
    if (!navigator?.mediaDevices?.getUserMedia) {
      setIsStarting(false);
      setCameraError(
        'Camera API is not supported in this browser. Please upload a QR image below or enter the room code manually.'
      );
      return;
    }

    // 3. Check if any video input device exists (if enumerateDevices is supported)
    try {
      if (navigator.mediaDevices.enumerateDevices) {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = devices.filter((d) => d.kind === 'videoinput');
        if (devices.length > 0 && videoInputs.length === 0) {
          setIsStarting(false);
          setCameraError(
            'No camera found on this device. Please connect a webcam, upload a QR image below, or enter the room code manually.'
          );
          return;
        }
      }
    } catch {
      // enumerateDevices might be restricted before permission; continue to getUserMedia
    }

    try {
      const newStream = await acquireCameraStream(mode);
      streamRef.current = newStream;
      setStream(newStream);

      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
        videoRef.current.muted = true;
        videoRef.current.setAttribute('playsinline', 'true');
        try {
          await videoRef.current.play();
        } catch (playErr: any) {
          if (playErr.name !== 'AbortError') {
            console.warn('Video play warning:', playErr);
          }
        }
      }

      // Check torch capability
      const videoTrack = newStream.getVideoTracks()[0];
      const capabilities = videoTrack?.getCapabilities ? (videoTrack.getCapabilities() as any) : {};
      setHasTorch(Boolean(capabilities?.torch));
    } catch (err: any) {
      console.warn('Camera access error:', err);
      let message = 'Could not start camera. You can upload an image containing a QR code or enter the code below.';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        message = 'Camera permission was denied. Please allow camera access in your browser settings (look for the lock/camera icon in the address bar) and retry.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        message = 'No camera device found on this system. Connect a webcam, upload a QR code image, or enter the code manually.';
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        message = 'Camera is already in use by another application (e.g. Zoom, Teams, or another tab). Please close it and retry.';
      } else if (err.name === 'OverconstrainedError') {
        message = 'Camera hardware does not support the requested video settings. Try switching cameras or enter code manually.';
      } else if (err.name === 'SecurityError') {
        message = 'Camera access was blocked by browser security policy. Please ensure you are connected via HTTPS or localhost.';
      }
      setCameraError(message);
    } finally {
      setIsStarting(false);
    }
  };

  useEffect(() => {
    if (!isQrScannerOpen) {
      stopCamera();
      setScannedCode(null);
      setCameraError(null);
      setManualCode('');
      return;
    }

    startCamera(facingMode);

    return () => {
      stopCamera();
    };
  }, [isQrScannerOpen, facingMode]);

  // Scanning requestAnimationFrame loop
  useEffect(() => {
    let animId: number;
    let isScanning = true;

    const scanFrame = () => {
      if (!isScanning || !isQrScannerOpen || scannedCode) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (video && canvas && video.videoWidth > 0 && video.videoHeight > 0 && video.readyState >= 2) {
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: 'dontInvert'
          });

          if (code && code.data) {
            handleDetectedCode(code.data);
            return;
          }
        }
      }

      animId = requestAnimationFrame(scanFrame);
    };

    if (isQrScannerOpen && !scannedCode) {
      animId = requestAnimationFrame(scanFrame);
    }

    return () => {
      isScanning = false;
      cancelAnimationFrame(animId);
    };
  }, [isQrScannerOpen, scannedCode]);

  const handleDetectedCode = async (rawValue: string) => {
    // Extract room code: check for ?room=XXXXXX query parameter or raw code
    let roomCode = '';
    try {
      if (rawValue.includes('room=')) {
        const url = new URL(rawValue);
        roomCode = url.searchParams.get('room') || '';
      } else if (rawValue.includes('/')) {
        const parts = rawValue.split('/');
        roomCode = parts[parts.length - 1] || '';
      } else {
        roomCode = rawValue.trim();
      }
    } catch {
      roomCode = rawValue.trim();
    }

    roomCode = roomCode.toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 12);

    if (roomCode.length >= 4) {
      setScannedCode(roomCode);
      stopCamera();

      try {
        console.log(`[QRScanner] Scanned room code "${roomCode}". Joining room...`);
        await socketService.joinRoom(roomCode);
        setTimeout(() => {
          setQrScannerOpen(false);
          setScannedCode(null);
        }, 1200);
      } catch (err: any) {
        console.error('Failed to join scanned room:', err);
        setCameraError(err.message || 'Failed to join room');
        setScannedCode(null);
      }
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const canvas = document.createElement('canvas');
      // Scale down very large images to max 1280px for fast, accurate decoding
      const maxDim = 1280;
      let width = img.width;
      let height = img.height;
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        const imageData = ctx.getImageData(0, 0, width, height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'attemptBoth'
        });
        if (code && code.data) {
          handleDetectedCode(code.data);
        } else {
          setCameraError('No valid QR code found in this image. Ensure the QR is clear or enter the room code manually below.');
        }
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      setCameraError('Failed to load image file. Please try another image.');
    };

    img.src = objectUrl;
    e.target.value = '';
  };

  const handleManualJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = manualCode.trim().toUpperCase();
    if (!trimmed) return;

    setIsJoining(true);
    try {
      await socketService.joinRoom(trimmed);
      setQrScannerOpen(false);
      setManualCode('');
    } catch (err: any) {
      setCameraError(err.message || 'Failed to join room');
    } finally {
      setIsJoining(false);
    }
  };

  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (track) {
      try {
        await (track as any).applyConstraints({
          advanced: [{ torch: !torchOn }]
        });
        setTorchOn(!torchOn);
      } catch (e) {
        console.warn('Torch toggle failed:', e);
      }
    }
  };

  if (!isQrScannerOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-md p-6 sm:p-7 rounded-3xl mono-panel border border-white/20 shadow-2xl relative space-y-4">
        {/* Close Button */}
        <button
          onClick={() => setQrScannerOpen(false)}
          className="absolute top-5 right-5 z-20 p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          title="Close Scanner"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center space-x-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.2)]">
            <Camera className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-extrabold text-white">Scan QR to Join Room</h3>
            <p className="text-xs text-zinc-400">Point camera at host's QR code or upload photo</p>
          </div>
        </div>

        {/* Viewfinder & Video Box */}
        <div className="relative w-full aspect-square max-h-[290px] rounded-2xl overflow-hidden bg-black flex items-center justify-center border border-white/20 shadow-inner">
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            playsInline
            muted
          />
          <canvas ref={canvasRef} className="hidden" />

          {/* Animated Scanning Beam & Target Frame */}
          {!cameraError && !scannedCode && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-48 h-48 border border-white/70 rounded-2xl relative shadow-[0_0_25px_rgba(255,255,255,0.15)]">
                {/* Corner markers */}
                <div className="absolute -top-1 -left-1 w-5 h-5 border-t-2 border-l-2 border-white rounded-tl" />
                <div className="absolute -top-1 -right-1 w-5 h-5 border-t-2 border-r-2 border-white rounded-tr" />
                <div className="absolute -bottom-1 -left-1 w-5 h-5 border-b-2 border-l-2 border-white rounded-bl" />
                <div className="absolute -bottom-1 -right-1 w-5 h-5 border-b-2 border-r-2 border-white rounded-br" />

                {/* Laser scan line */}
                <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-white to-transparent animate-laser-scan shadow-[0_0_12px_rgba(255,255,255,0.8)]" />
              </div>
            </div>
          )}

          {/* Scanned Success Overlay */}
          {scannedCode && (
            <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center space-y-2 animate-fade-in z-20">
              <CheckCircle2 className="w-12 h-12 text-white animate-bounce" />
              <p className="text-sm font-extrabold text-white">QR Code Detected!</p>
              <p className="text-xs text-zinc-300 font-mono tracking-wider">Joining Room {scannedCode}...</p>
            </div>
          )}

          {/* Camera Error Message with Recovery Controls */}
          {cameraError && (
            <div className="absolute inset-0 bg-black/95 p-5 flex flex-col items-center justify-center text-center space-y-3 z-20">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div className="space-y-1 max-w-xs">
                <p className="text-xs font-semibold text-white">Camera Notice</p>
                <p className="text-xs text-zinc-300 leading-relaxed">{cameraError}</p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                {typeof window !== 'undefined' && !window.isSecureContext ? (
                  <button
                    type="button"
                    onClick={() => {
                      window.location.href = window.location.href.replace(/^http:/, 'https:');
                    }}
                    className="px-3.5 py-1.5 rounded-xl bg-white text-black hover:bg-zinc-200 text-xs font-bold transition-all shadow-md flex items-center space-x-1.5 active:scale-95"
                  >
                    <Lock className="w-3.5 h-3.5 text-black" />
                    <span>Switch to HTTPS (Enable Camera)</span>
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => startCamera(facingMode)}
                      disabled={isStarting}
                      className="px-3 py-1.5 rounded-xl bg-white text-black hover:bg-zinc-200 text-xs font-bold transition-colors flex items-center space-x-1.5"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isStarting ? 'animate-spin' : ''}`} />
                      <span>{isStarting ? 'Starting...' : 'Retry Camera'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const nextMode = facingMode === 'environment' ? 'user' : 'environment';
                        setFacingMode(nextMode);
                        startCamera(nextMode);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-white/10 text-xs font-medium transition-colors"
                    >
                      {facingMode === 'environment' ? 'Try Front/Webcam' : 'Try Rear Camera'}
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Camera Controls inside video */}
          {!cameraError && (
            <div className="absolute bottom-3 right-3 flex items-center space-x-2 z-10">
              {hasTorch && (
                <button
                  type="button"
                  onClick={toggleTorch}
                  className={`p-2 rounded-xl backdrop-blur-md transition-colors ${
                    torchOn ? 'bg-white text-black' : 'bg-black/80 text-white border border-white/20'
                  }`}
                  title="Toggle Torch"
                >
                  <Flashlight className="w-4 h-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  const nextMode = facingMode === 'environment' ? 'user' : 'environment';
                  setFacingMode(nextMode);
                }}
                className="p-2 rounded-xl bg-black/80 backdrop-blur-md text-white border border-white/20 hover:bg-zinc-800 transition-colors"
                title="Switch Camera"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Alternative Actions: Scan from Photo & Manual Room Code */}
        <div className="space-y-3 pt-2 border-t border-white/10">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full flex items-center justify-center space-x-2 py-2.5 px-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-200 text-xs font-semibold border border-white/15 transition-colors"
          >
            <Upload className="w-4 h-4 text-white" />
            <span>Scan QR from Photo / Screenshot</span>
          </button>

          {/* Manual Room Code Entry */}
          <form onSubmit={handleManualJoin} className="space-y-1.5">
            <div className="text-[11px] font-medium text-zinc-400">
              <span>Or enter Room Code manually:</span>
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value.toUpperCase())}
                placeholder="e.g. XTRASH or 6-CHAR CODE"
                maxLength={12}
                className="flex-1 px-3 py-2 rounded-xl bg-zinc-900 border border-white/15 text-white placeholder-zinc-500 text-xs font-mono tracking-wider focus:outline-none focus:border-white/40"
              />
              <button
                type="submit"
                disabled={!manualCode.trim() || isJoining}
                className="px-4 py-2 rounded-xl bg-white hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed text-black text-xs font-bold transition-colors flex items-center space-x-1"
              >
                <span>{isJoining ? 'Joining...' : 'Join'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
