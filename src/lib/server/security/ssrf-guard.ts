import net from "net";

/**
 * Checks if an IP address belongs to dangerous internal, private, loopback,
 * or cloud metadata ranges (e.g. AWS/GCP 169.254.169.254).
 */
export function isPrivateOrMetadataIp(ip: string): boolean {
  if (!net.isIP(ip)) {
    return false;
  }

  // IPv4 Checks
  if (net.isIPv4(ip)) {
    const parts = ip.split(".").map((p) => parseInt(p, 10));
    const [b0, b1] = parts;

    // Loopback (127.0.0.0/8)
    if (b0 === 127) return true;

    // Zero / Current network (0.0.0.0/8)
    if (b0 === 0) return true;

    // Cloud Metadata & Link-Local (169.254.0.0/16, including 169.254.169.254)
    if (b0 === 169 && b1 === 254) return true;

    // RFC 1918 Private Addresses:
    // 10.0.0.0/8
    if (b0 === 10) return true;
    // 172.16.0.0/12 (172.16.x.x - 172.31.x.x)
    if (b0 === 172 && b1 >= 16 && b1 <= 31) return true;
    // 192.168.0.0/16
    if (b0 === 192 && b1 === 168) return true;

    // Shared Carrier CGNAT (100.64.0.0/10)
    if (b0 === 100 && b1 >= 64 && b1 <= 127) return true;

    // Broadcast (255.255.255.255)
    if (parts.every((p) => p === 255)) return true;

    return false;
  }

  // IPv6 Checks
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    // Loopback (::1)
    if (lower === "::1" || lower === "0:0:0:0:0:0:0:1") return true;
    // Unspecified (::)
    if (lower === "::") return true;
    // Link-local (fe80::/10)
    if (lower.startsWith("fe80:")) return true;
    // Unique local (fc00::/7)
    if (lower.startsWith("fc00:") || lower.startsWith("fd00:")) return true;
    // IPv4-mapped IPv6 (::ffff:127.0.0.1, ::ffff:169.254.169.254)
    if (lower.includes("::ffff:")) {
      const v4Part = lower.split("::ffff:")[1];
      if (v4Part && isPrivateOrMetadataIp(v4Part)) return true;
    }
    return false;
  }

  return false;
}

/**
 * Validates external outbound URLs to protect against Server-Side Request Forgery (SSRF).
 * Blocks cloud metadata endpoints, internal RFC 1918 addresses, and non-http/https schemes.
 */
export function validateUrlForSsrf(urlString: string): { safe: boolean; reason?: string } {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    return { safe: false, reason: "Invalid URL format" };
  }

  // Strict protocol check (only http/https)
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { safe: false, reason: `Forbidden URL scheme: ${parsed.protocol}` };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block localhost and standard aliases
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname === "::1" ||
    hostname === "metadata.google.internal" ||
    hostname === "instance-data"
  ) {
    return { safe: false, reason: `Blocked localhost/metadata target: ${hostname}` };
  }

  // If hostname is directly an IP address, inspect IP range
  if (net.isIP(hostname)) {
    if (isPrivateOrMetadataIp(hostname)) {
      return { safe: false, reason: `Target IP ${hostname} is private, link-local, or metadata endpoint` };
    }
  }

  return { safe: true };
}

/**
 * Validates request Origin / Referer for CSRF prevention on state-changing methods (POST, PUT, DELETE, PATCH).
 */
export function validateCsrfOrigin(req: Request, allowedHosts?: string[]): boolean {
  const method = req.method.toUpperCase();
  // Safe methods do not require origin check
  if (["GET", "HEAD", "OPTIONS"].includes(method)) {
    return true;
  }

  const origin = req.headers.get("origin") || req.headers.get("referer");
  if (!origin) {
    // If neither origin nor referer is provided on a browser form mutation, reject
    return false;
  }

  try {
    const originHost = new URL(origin).host.toLowerCase();
    const requestHost = req.headers.get("host")?.toLowerCase();

    // Match against current host
    if (requestHost && originHost === requestHost) {
      return true;
    }

    if (allowedHosts && allowedHosts.some((h) => originHost === h.toLowerCase())) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}
