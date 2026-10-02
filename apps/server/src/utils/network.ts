import os from 'os';

export interface NetworkAddressInfo {
  lanIp: string;
  allIps: string[];
}

/**
 * Discovers the active LAN IPv4 address for the host machine.
 */
export function getLocalNetworkAddresses(): NetworkAddressInfo {
  const interfaces = os.networkInterfaces();
  const allIps: string[] = [];
  let primaryLanIp = '127.0.0.1';

  for (const name of Object.keys(interfaces)) {
    const ifaceList = interfaces[name];
    if (!ifaceList) continue;

    for (const iface of ifaceList) {
      // Filter out internal (127.0.0.1) and IPv6 addresses
      if (!iface.internal && iface.family === 'IPv4') {
        allIps.push(iface.address);
        // Prefer common private network ranges: 192.168.x.x, 10.x.x.x, 172.16-31.x.x
        if (
          !primaryLanIp ||
          primaryLanIp === '127.0.0.1' ||
          iface.address.startsWith('192.168.') ||
          iface.address.startsWith('10.')
        ) {
          primaryLanIp = iface.address;
        }
      }
    }
  }

  return {
    lanIp: primaryLanIp,
    allIps
  };
}
