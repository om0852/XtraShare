import { DevicePlatform, DeviceRegistration, DeviceType } from '@xtrashare/protocol';

export function detectCurrentDevice(): DeviceRegistration {
  const userAgent = navigator.userAgent || '';
  let platform: DevicePlatform = 'Unknown';
  let type: DeviceType = 'unknown';
  let browser = 'Browser';

  // Detect Platform
  if (/iPad|iPhone|iPod/.test(userAgent)) {
    platform = 'iOS';
    type = /iPad/.test(userAgent) ? 'tablet' : 'mobile';
  } else if (/Android/.test(userAgent)) {
    platform = 'Android';
    type = /Mobile/.test(userAgent) ? 'mobile' : 'tablet';
  } else if (/Macintosh|Mac OS X/.test(userAgent)) {
    platform = 'macOS';
    type = 'desktop';
  } else if (/Windows NT/.test(userAgent)) {
    platform = 'Windows';
    type = 'desktop';
  } else if (/Linux/.test(userAgent)) {
    platform = 'Linux';
    type = 'desktop';
  }

  // Detect Browser
  if (/Edg/.test(userAgent)) {
    browser = 'Edge';
  } else if (/Chrome/.test(userAgent) && !/Edg/.test(userAgent)) {
    browser = 'Chrome';
  } else if (/Safari/.test(userAgent) && !/Chrome/.test(userAgent)) {
    browser = 'Safari';
  } else if (/Firefox/.test(userAgent)) {
    browser = 'Firefox';
  }

  // Default device name stored in localStorage or generated
  const storedName = localStorage.getItem('xtrashare_device_name');
  const defaultName = storedName || `${browser} on ${platform}`;

  // Avatar color palette
  const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#06b6d4', '#10b981', '#f59e0b'];
  const storedColor = localStorage.getItem('xtrashare_avatar_color') || colors[Math.floor(Math.random() * colors.length)];

  return {
    name: defaultName,
    type,
    platform,
    browser,
    avatarColor: storedColor
  };
}
