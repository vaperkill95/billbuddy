const requests = new Map();

function rateLimiter(maxRequests = 100, windowMs = 60000) {
  return (req, res, next) => {
    const key = req.user ? req.user.id : req.ip;
    const now = Date.now();
    const windowStart = now - windowMs;
    if (!requests.has(key)) requests.set(key, []);
    const timestamps = requests.get(key).filter(t => t > windowStart);
    requests.set(key, timestamps);
    if (timestamps.length >= maxRequests) {
      return res.status(429).json({ error: "Too many requests", retryAfter: Math.ceil((timestamps[0] + windowMs - now) / 1000) });
    }
    timestamps.push(now);
    next();
  };
}

function authRateLimiter(maxRequests = 30, windowMs = 300000) {
  return rateLimiter(maxRequests, windowMs);
}

setInterval(() => {
  const now = Date.now();
  for (const [key, timestamps] of requests.entries()) {
    const fresh = timestamps.filter(t => now - t < 300000);
    if (fresh.length === 0) requests.delete(key);
    else requests.set(key, fresh);
  }
}, 60000);

module.exports = { rateLimiter, authRateLimiter };
