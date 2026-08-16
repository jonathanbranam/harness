// crypto.randomUUID() requires a secure context, which plain-HTTP LAN access
// (e.g. a NUC on the local network without TLS) doesn't provide — see the
// "Local Testing" note in track-web's CLAUDE.md for the same pitfall with
// DeviceMotionEvent. Client-side ids here are just React keys / correlation
// tokens, so a simple non-cryptographic generator is enough.
export function genId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
