import React, { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import {
  X,
  Camera,
  Upload,
  AlertCircle,
  CheckCircle2,
  Flashlight,
  RefreshCw
} from 'lucide-react';
import { useUIStore } from '../store/uiStore.js';
import { socketService } from '../services/socket.js';

export const QRScannerModal: React.FC = () => {
  const { isQrScannerOpen, setQrScannerOpen } = useUIStore();

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scannedCode, setScannedCode] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');

  useEffect(() => {
    if (!isQrScannerOpen) {
      stopCamera();
      setScannedCode(null);
      setCameraError(null);
      return;
    }

    startCamera(facingMode);

    return () => {
      stopCamera();
    };
  }, [isQrScannerOpen, facingMode]);

  const startCamera = async (mode: 'environment' | 'user') => {
    setCameraError(null);
    try {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }

      const newStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: mode,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });

      setStream(newStream);
      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
        videoRef.current.setAttribute('playsinline', 'true');
        await videoRef.current.play();
      }

      // Check torch capability
      const videoTrack = newStream.getVideoTracks()[0];
      const capabilities = videoTrack?.getCapabilities ? (videoTrack.getCapabilities() as any) : {};
      setHasTorch(Boolean(capabilities?.torch));
    } catch (err: any) {
      console.warn('Camera access error:', err);
      setCameraError(
        err.name === 'NotAllowedError'
          ? 'Camera permission was denied. Please allow camera access in browser settings.'
          : 'Could not start camera. You can upload an image containing a QR code below.'
      );
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
  };

  // Scanning requestAnimationFrame loop
  useEffect(() => {
    let animId: number;
    let isScanning = true;

    const scanFrame = () => {
      if (!isScanning || !isQrScannerOpen || scannedCode) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
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

    roomCode = roomCode.toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 8);

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
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        if (code && code.data) {
          handleDetectedCode(code.data);
        } else {
          setCameraError('No valid QR code found in this image.');
        }
      }
    };
    img.src = URL.createObjectURL(file);
  };

  const toggleTorch = async () => {
    if (!stream) return;
    const track = stream.getVideoTracks()[0];
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
          className="absolute top-5 right-5 z-10 p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
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
            <p className="text-xs text-zinc-400">Point your camera at the host's QR code</p>
          </div>
        </div>

        {/* Viewfinder & Video Box */}
        <div className="relative w-full aspect-square max-h-[300px] rounded-2xl overflow-hidden bg-black flex items-center justify-center border border-white/20 shadow-inner">
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
            <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center space-y-2 animate-fade-in">
              <CheckCircle2 className="w-12 h-12 text-white animate-bounce" />
              <p className="text-sm font-extrabold text-white">QR Code Detected!</p>
              <p className="text-xs text-zinc-300 font-mono tracking-wider">Joining Room {scannedCode}...</p>
            </div>
          )}

          {/* Camera Error Message */}
          {cameraError && (
            <div className="p-4 text-center space-y-2">
              <AlertCircle className="w-8 h-8 text-zinc-400 mx-auto" />
              <p className="text-xs text-zinc-300">{cameraError}</p>
            </div>
          )}

          {/* Camera Controls inside video */}
          <div className="absolute bottom-3 right-3 flex items-center space-x-2">
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
              onClick={() => setFacingMode(facingMode === 'environment' ? 'user' : 'environment')}
              className="p-2 rounded-xl bg-black/80 backdrop-blur-md text-white border border-white/20 hover:bg-zinc-800 transition-colors"
              title="Switch Camera"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Alternative: Image File Upload & Manual Code */}
        <div className="flex items-center justify-between pt-2 border-t border-white/10 gap-3">
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
            className="flex-1 flex items-center justify-center space-x-2 py-2.5 px-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-200 text-xs font-semibold border border-white/15 transition-colors"
          >
            <Upload className="w-4 h-4 text-white" />
            <span>Scan from Photo</span>
          </button>
        </div>
      </div>
    </div>
  );
};
