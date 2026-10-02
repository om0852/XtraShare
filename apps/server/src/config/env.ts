import dotenv from 'dotenv';
dotenv.config();

export const ENV = {
  PORT: parseInt(process.env.PORT || '3000', 10),
  HOST: process.env.HOST || '0.0.0.0',
  ENABLE_HTTPS: process.env.ENABLE_HTTPS !== 'false', // Default true for secure contexts (WebRTC & Clipboard)
  NODE_ENV: process.env.NODE_ENV || 'development',
  MAX_ROOM_DEVICES: parseInt(process.env.MAX_ROOM_DEVICES || '32', 10),
  DEFAULT_ROOM: process.env.DEFAULT_ROOM || 'XTRASH',
};
