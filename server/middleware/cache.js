const cache = new Map();

function cacheMiddleware(keyFn, ttlSeconds = 300) {
  return (req, res, next) => {
    const key = typeof keyFn === "function" ? keyFn(req) : keyFn;
    const cached = cache.get(key);
    if (cached && Date.now() - cached.time < ttlSeconds * 1000) {
      return res.json(cached.data);
    }
    const originalJson = res.json.bind(res);
    res.json = (data) => {
      if (res.statusCode === 200) cache.set(key, { data, time: Date.now() });
      return originalJson(data);
    };
    next();
  };
}

function invalidateCache(pattern) {
  for (const key of cache.keys()) {
    if (key.includes(pattern)) cache.delete(key);
  }
}

function clearUserCache(userId) {
  for (const key of cache.keys()) {
    if (key.includes("user:" + userId)) cache.delete(key);
  }
}

setInterval(() => {
  const now = Date.now();
  for (const [key, val] of cache.entries()) {
    if (now - val.time > 600000) cache.delete(key);
  }
}, 60000);

module.exports = { cacheMiddleware, invalidateCache, clearUserCache };
