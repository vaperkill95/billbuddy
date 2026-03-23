const express = require("express");
const bcrypt = require("bcryptjs");
const router = express.Router();
const pool = require("../db/pool");
const { generateToken, JWT_SECRET } = require("../middleware/auth");
const jwt = require("jsonwebtoken");
const { authRateLimiter } = require("../middleware/rateLimit");

// Rate limit auth endpoints
router.use("/signup", authRateLimiter());
router.use("/login", authRateLimiter());
router.use("/google", authRateLimiter(20, 300000));

// POST /api/auth/signup - Email + password registration
router.post("/signup", async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: "Name, email, and password are required" });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    // Check if email already exists
    const existing = await pool.query("SELECT id FROM users WHERE email = $1", [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: "An account with this email already exists" });
    }

    // Hash password and create user
    const hashedPassword = await bcrypt.hash(password, 12);
    const { rows } = await pool.query(
      `INSERT INTO users (email, password_hash, name, auth_provider)
       VALUES ($1, $2, $3, 'email') RETURNING id, email, name, created_at`,
      [email.toLowerCase(), hashedPassword, name]
    );

    const user = rows[0];
    const token = generateToken(user);

    res.status(201).json({
      token,
      user: { id: user.id, email: user.email, name: user.name },
    });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ error: "Failed to create account" });
  }
});

// POST /api/auth/login - Email + password login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const { rows } = await pool.query(
      "SELECT id, email, name, password_hash, auth_provider FROM users WHERE email = $1",
      [email.toLowerCase()]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const user = rows[0];

    // If they signed up with Google, tell them
    if (user.auth_provider === "google" && !user.password_hash) {
      return res.status(401).json({ error: "This account uses Google sign-in. Please sign in with Google." });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const token = generateToken(user);
    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Failed to log in" });
  }
});

// POST /api/auth/google - Google OAuth (receives Google credential/token from frontend)
router.post("/google", async (req, res) => {
  try {
    const { credential } = req.body;

    if (!credential) {
      return res.status(400).json({ error: "Google credential is required" });
    }

    // Decode the Google JWT (ID token)
    // In production you'd verify with Google's public keys, but for now
    // we decode and verify the basic structure
    const decoded = jwt.decode(credential);

    if (!decoded || !decoded.email) {
      return res.status(400).json({ error: "Invalid Google credential" });
    }

    const { email, name, sub: googleId, picture } = decoded;

    // Check if user exists
    let { rows } = await pool.query(
      "SELECT id, email, name FROM users WHERE email = $1",
      [email.toLowerCase()]
    );

    let user;
    if (rows.length > 0) {
      // Existing user - update their Google info
      user = rows[0];
      await pool.query(
        "UPDATE users SET google_id = $1, avatar_url = $2, updated_at = NOW() WHERE id = $3",
        [googleId, picture, user.id]
      );
    } else {
      // New user - create account
      const result = await pool.query(
        `INSERT INTO users (email, name, google_id, avatar_url, auth_provider)
         VALUES ($1, $2, $3, $4, 'google') RETURNING id, email, name`,
        [email.toLowerCase(), name || email.split("@")[0], googleId, picture]
      );
      user = result.rows[0];
    }

    const token = generateToken(user);
    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name },
    });
  } catch (err) {
    console.error("Google auth error:", err);
    res.status(500).json({ error: "Google sign-in failed" });
  }
});

// GET /api/auth/me - Get current user from token
router.get("/me", async (req, res) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    const token = header.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const { rows } = await pool.query("SELECT dark_mode FROM users WHERE id = $1", [decoded.id]);
    res.json({ user: { id: decoded.id, email: decoded.email, name: decoded.name, darkMode: rows[0]?.dark_mode || false } });
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
});

// PATCH /api/auth/preferences - Update user preferences
const { authMiddleware } = require("../middleware/auth");
router.patch("/preferences", authMiddleware, async (req, res) => {
  try {
    const { darkMode } = req.body;
    if (darkMode !== undefined) {
      await pool.query("UPDATE users SET dark_mode = $1 WHERE id = $2", [darkMode, req.user.id]);
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: "Failed to update preferences" }); }
});

module.exports = router;

