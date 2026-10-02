import fs from 'fs';
import path from 'path';
import selfsigned from 'selfsigned';
import { getLocalNetworkAddresses } from './network.js';

export interface SslCredentials {
  key: string;
  cert: string;
}

/**
 * Loads or automatically generates SSL certificate & private key for HTTPS.
 */
export function getOrCreateSslCredentials(certDir = path.resolve(process.cwd(), 'certificates')): SslCredentials {
  if (!fs.existsSync(certDir)) {
    fs.mkdirSync(certDir, { recursive: true });
  }

  const keyPath = path.join(certDir, 'server.key');
  const certPath = path.join(certDir, 'server.crt');

  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    return {
      key: fs.readFileSync(keyPath, 'utf8'),
      cert: fs.readFileSync(certPath, 'utf8')
    };
  }

  const { lanIp, allIps } = getLocalNetworkAddresses();
  const altNames = [
    { type: 2, value: 'localhost' },
    { type: 7, ip: '127.0.0.1' },
    { type: 7, ip: lanIp },
    ...allIps.map(ip => ({ type: 7, ip }))
  ];

  console.log('Generating local SSL certificate for LAN HTTPS secure context...');

  const attrs = [{ name: 'commonName', value: 'XtraShare LAN' }];
  const pems = selfsigned.generate(attrs, {
    days: 365,
    keySize: 2048,
    algorithm: 'sha256',
    extensions: [{ name: 'subjectAltName', altNames }]
  });

  fs.writeFileSync(keyPath, pems.private, 'utf8');
  fs.writeFileSync(certPath, pems.cert, 'utf8');

  return {
    key: pems.private,
    cert: pems.cert
  };
}
