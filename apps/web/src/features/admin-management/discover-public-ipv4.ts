/** Best-effort public IPv4 discovery when the page itself loaded over IPv6. */

function isPublicIpv4(ip: string): boolean {
  const parts = ip.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return false;
  }
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a >= 224) return false;
  return true;
}

function ipv4FromCandidate(candidate: string | undefined): string | null {
  if (!candidate) return null;
  const match = candidate.match(/\b(\d{1,3}(?:\.\d{1,3}){3})\b/);
  if (!match) return null;
  return isPublicIpv4(match[1]) ? match[1] : null;
}

export async function discoverPublicIpv4(timeoutMs = 2500): Promise<string | null> {
  if (typeof RTCPeerConnection === 'undefined') return null;

  const pc = new RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }],
  });

  try {
    pc.createDataChannel('safescribe-ip');
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    return await new Promise((resolve) => {
      let settled = false;
      const finish = (ip: string | null) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        pc.onicecandidate = null;
        resolve(ip);
      };

      const timer = window.setTimeout(() => finish(null), timeoutMs);

      pc.onicecandidate = (event) => {
        const ip = ipv4FromCandidate(event.candidate?.candidate);
        if (ip) finish(ip);
        if (!event.candidate) finish(null);
      };
    });
  } catch {
    return null;
  } finally {
    pc.close();
  }
}
