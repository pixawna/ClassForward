import "server-only";
import { isIP } from "node:net";

const PRIVATE_V4 = [
  /^0\./, /^10\./, /^127\./, /^169\.254\./, /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
];

/**
 * A link a teacher wants to cite. The server crawls it, so it must be a
 * public http(s) address: local and private-network hosts are refused.
 * (Hostnames that resolve to private addresses aren't checked here.)
 */
export function parsePublicUrl(raw: string): URL | null {
  const text = raw.trim();
  if (!text) return null;
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || /\.(localhost|local|internal|lan|home)$/.test(host)) return null;
  const ip = isIP(host);
  if (ip === 0 && !host.includes(".")) return null;
  if (ip === 4 && PRIVATE_V4.some((r) => r.test(host))) return null;
  if (ip === 6 && (host === "::1" || host === "::" || /^(fc|fd|fe[89ab])/.test(host) || host.startsWith("::ffff:"))) return null;
  url.hash = "";
  return url;
}
