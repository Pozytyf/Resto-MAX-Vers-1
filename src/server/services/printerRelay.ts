import net from 'node:net';

export function isDisallowedInternalHost(rawHost: string): boolean {
  const host = rawHost.trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) return false;
  if (
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host === '::' ||
    host.endsWith('.local') === false && host === 'metadata.google.internal' ||
    host.startsWith('127.') ||
    host.startsWith('169.254.') ||
    host.startsWith('fe80:') ||
    host.startsWith('fd00:') ||
    host.startsWith('::ffff:127.') ||
    host.startsWith('::ffff:169.254.')
  ) {
    return true;
  }
  return false;
}

export async function sendRawBytesOverTcp(
  host: string,
  port: number,
  bytes: Uint8Array,
  timeoutMs = 4000,
): Promise<{ ok: boolean; bytesSent: number; error?: string }> {
  const cleanHost = host.trim();
  const cleanPort = Math.round(Number(port || 9100));
  if (!cleanHost) {
    return {
      ok: false,
      bytesSent: 0,
      error: 'Adresse IP ou hôte de l’imprimante thermique requis.',
    };
  }
  if (!Number.isFinite(cleanPort) || cleanPort < 1 || cleanPort > 65535) {
    return {
      ok: false,
      bytesSent: 0,
      error: 'Port d’imprimante thermique invalide.',
    };
  }
  if (isDisallowedInternalHost(cleanHost)) {
    return {
      ok: false,
      bytesSent: 0,
      error: 'Hôte réseau refusé pour des raisons de sécurité (boucle locale ou métadonnées).',
    };
  }

  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const finish = (result: { ok: boolean; bytesSent: number; error?: string }) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);

    socket.connect(cleanPort, cleanHost, () => {
      socket.write(Buffer.from(bytes), (err) => {
        if (err) {
          finish({ ok: false, bytesSent: 0, error: err.message });
        } else {
          socket.end(() => {
            finish({ ok: true, bytesSent: bytes.length });
          });
        }
      });
    });

    socket.on('timeout', () => {
      finish({
        ok: false,
        bytesSent: 0,
        error: `Délai dépassé vers l’imprimante ${cleanHost}:${cleanPort}`,
      });
    });

    socket.on('error', (err) => {
      finish({ ok: false, bytesSent: 0, error: err.message });
    });
  });
}
