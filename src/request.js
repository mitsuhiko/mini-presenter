function normalizeAddress(address) {
  if (!address || typeof address !== "string") {
    return null;
  }
  if (address.startsWith("::ffff:")) {
    return address.slice("::ffff:".length);
  }
  return address;
}

function isLoopbackAddress(address) {
  const normalized = normalizeAddress(address);
  return normalized === "127.0.0.1" || normalized === "::1";
}

function extractForwardedAddress(req) {
  const cfConnectingIp = req.headers["cf-connecting-ip"];
  if (typeof cfConnectingIp === "string" && cfConnectingIp.trim()) {
    return cfConnectingIp.split(",")[0].trim();
  }
  const forwardedFor = req.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.trim()) {
    return forwardedFor.split(",")[0].trim();
  }
  if (Array.isArray(forwardedFor) && forwardedFor.length > 0) {
    return forwardedFor[0].split(",")[0].trim();
  }
  return null;
}

export function getRequestAddress(req) {
  if (!req) {
    return null;
  }
  const forwarded = extractForwardedAddress(req);
  return normalizeAddress(forwarded ?? req.socket?.remoteAddress ?? null);
}

export function isLocalRequest(req) {
  if (!req) {
    return false;
  }
  const forwarded = extractForwardedAddress(req);
  if (forwarded) {
    return isLoopbackAddress(forwarded);
  }
  return isLoopbackAddress(req.socket?.remoteAddress ?? null);
}
