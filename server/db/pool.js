const { Pool } = require("pg");
require("dotenv").config();

const isProd = process.env.NODE_ENV === "production";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isProd ? { rejectUnauthorized: false } : false,
  max: isProd ? 15 : 5,
  min: isProd ? 2 : 1,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  allowExitOnIdle: false,
  statement_timeout: 30000,
});

pool.on("error", (err) => {
  console.error("Pool error:", err.message);
});

pool.on("connect", (client) => {
  client.query("SET statement_timeout = '30s'").catch(() => {});
});

let poolStats = { totalQueries: 0, errors: 0, slowQueries: 0, lastError: null };

const originalQuery = pool.query.bind(pool);
pool.query = async function (...args) {
  const start = Date.now();
  poolStats.totalQueries++;
  try {
    const result = await originalQuery(...args);
    const duration = Date.now() - start;
    if (duration > 2000) {
      poolStats.slowQueries++;
      const queryText = typeof args[0] === "string" ? args[0].substring(0, 80) : "prepared";
      console.warn(`Slow query (${duration}ms): ${queryText}`);
    }
    return result;
  } catch (err) {
    poolStats.errors++;
    poolStats.lastError = { message: err.message, time: new Date().toISOString() };
    throw err;
  }
};

pool.getStats = () => ({
  ...poolStats,
  totalCount: pool.totalCount,
  idleCount: pool.idleCount,
  waitingCount: pool.waitingCount,
});

module.exports = pool;
