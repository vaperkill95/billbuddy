const express = require("express");
const bcrypt = require("bcryptjs");
const router = express.Router();
const pool = require("../db/pool");
const { generateToken, JWT_SECRET, authMiddleware } = require("../middleware/auth");
const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");
const { authRateLimiter } = require("../middleware/rateLimit");

router.use("/signup", authRateLimiter());
router.use("/login", authRateLimiter());
router.use("/google", authRateLimiter(20, 300000));

// Helper: check if user has 2FA enabled and return appropriate response
async function handleAuthResponse(user, res) {
  const { rows: tfa } = await pool.query(
    "SELECT enabled FROM user_2fa WHERE user_id = $1 AND enabled = true",
    [user.id]
  );
  if (tfa.length > 0) {
    // 2FA enabled - return pending state, no token yet
    return res.json({
      requires2FA: true,
      userId: user.id,
      userName: user.name,
    });
  }
  // No 2FA - return token directly
  const token = generateToken(user);
  res.json({ token, user: { id: user.id, email: user.email, name: user.name, darkMode: user.dark_mode } });
}

// POST /api/auth/signup
router.post("/signup", async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password || !name) return res.status(400).json({ error: "All fields required" });
    const { rows: existing } = await pool.query("SELECT id FROM users WHERE email=$1", [email]);
    if (existing.length) return res.status(409).json({ error: "Email already exists" });
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query("INSERT INTO users (email, password_hash, name) VALUES ($1,$2,$3) RETURNING id, email, name", [email, hash, name]);
    const user = rows[0];
    const token = generateToken(user);
    res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ error: "Signup failed" });
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password required" });
    const { rows } = await pool.query("SELECT * FROM users WHERE email=$1", [email]);
    if (!rows.length) return res.status(401).json({ error: "Invalid credentials" });
    const user = rows[0];
    if (!user.password_hash) return res.status(401).json({ error: "Please sign in with Google" });
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: "Invalid credentials" });
    await handleAuthResponse(user, res);
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Login failed" });
  }
});

// POST /api/auth/google
router.post("/google", async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ error: "No credential provided" });
    const clientId = process.env.REACT_APP_GOOGLE_CLIENT_ID;
    if (!clientId) return res.status(500).json({ error: "Google sign-in not configured" });
    const client = new OAuth2Client(clientId);
    const ticket = await client.verifyIdToken({ idToken: credential, audience: clientId });
    const payload = ticket.getPayload();
    const { email, name, sub: googleId } = payload;
    let { rows } = await pool.query("SELECT * FROM users WHERE email=$1", [email]);
    if (!rows.length) {
      const result = await pool.query("INSERT INTO users (email, name, google_id) VALUES ($1,$2,$3) RETURNING *", [email, name, googleId]);
      rows = result.rows;
    } else if (!rows[0].google_id) {
      await pool.query("UPDATE users SET google_id=$1 WHERE id=$2", [googleId, rows[0].id]);
    }
    const user = rows[0];
    await handleAuthResponse(user, res);
  } catch (err) {
    console.error("Google auth error:", err);
    if (err.message && err.message.includes("Token used too late")) return res.status(400).json({ error: "Google token expired, please try again" });
    res.status(500).json({ error: "Google sign-in failed" });
  }
});

// POST /api/auth/2fa-complete - Called after 2FA validation succeeds
router.post("/2fa-complete", async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: "User ID required" });
    const { rows } = await pool.query("SELECT id, email, name, dark_mode FROM users WHERE id=$1", [userId]);
    if (!rows.length) return res.status(404).json({ error: "User not found" });
    const user = rows[0];
    const token = generateToken(user);
    res.json({ token, user: { id: user.id, email: user.email, name: user.name, darkMode: user.dark_mode } });
  } catch (err) {
    console.error("2FA complete error:", err);
    res.status(500).json({ error: "Failed" });
  }
});

// GET /api/auth/me
router.get("/me", authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT id, email, name, dark_mode FROM users WHERE id=$1", [req.user.id]);
    if (!rows.length) return res.status(404).json({ error: "User not found" });
    res.json({ id: rows[0].id, email: rows[0].email, name: rows[0].name, darkMode: rows[0].dark_mode });
  } catch (err) {
    res.status(500).json({ error: "Failed" });
  }
});

// PATCH /api/auth/preferences
router.patch("/preferences", authMiddleware, async (req, res) => {
  try {
    const { darkMode } = req.body;
    if (darkMode !== undefined) {
      await pool.query("UPDATE users SET dark_mode=$1 WHERE id=$2", [darkMode, req.user.id]);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed" });
  }
});

module.exports = router;
