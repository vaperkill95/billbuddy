const express = require("express");
const router = express.Router();
const pool = require("../db/pool");
const speakeasy = require("speakeasy");
const QRCode = require("qrcode");
const { authMiddleware } = require("../middleware/auth");

// GET /api/2fa/status - Check if user has 2FA enabled
router.get("/status", authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT enabled FROM user_2fa WHERE user_id = $1",
      [req.user.id]
    );
    res.json({ enabled: rows.length > 0 && rows[0].enabled });
  } catch (err) {
    console.error("2FA status error:", err);
    res.status(500).json({ error: "Failed to check 2FA status" });
  }
});

// POST /api/2fa/setup - Generate secret and QR code
router.post("/setup", authMiddleware, async (req, res) => {
  try {
    // Check if already enabled
    const { rows: existing } = await pool.query(
      "SELECT enabled FROM user_2fa WHERE user_id = $1",
      [req.user.id]
    );
    if (existing.length && existing[0].enabled) {
      return res.status(400).json({ error: "2FA is already enabled" });
    }

    // Generate secret
    const secret = speakeasy.generateSecret({
      name: `BillBuddy (${req.user.email})`,
      issuer: "BillBuddy",
      length: 20,
    });

    // Store the secret (not yet enabled)
    await pool.query(
      `INSERT INTO user_2fa (user_id, secret, enabled)
       VALUES ($1, $2, false)
       ON CONFLICT (user_id)
       DO UPDATE SET secret = $2, enabled = false`,
      [req.user.id, secret.base32]
    );

    // Generate QR code as data URL
    const qrDataUrl = await QRCode.toDataURL(secret.otpauth_url);

    res.json({
      secret: secret.base32,
      qrCode: qrDataUrl,
      otpauthUrl: secret.otpauth_url,
    });
  } catch (err) {
    console.error("2FA setup error:", err);
    res.status(500).json({ error: "Failed to setup 2FA" });
  }
});

// POST /api/2fa/verify - Verify code and enable 2FA
router.post("/verify", authMiddleware, async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: "Code required" });

    const { rows } = await pool.query(
      "SELECT secret FROM user_2fa WHERE user_id = $1",
      [req.user.id]
    );
    if (!rows.length) return res.status(400).json({ error: "Run setup first" });

    const verified = speakeasy.totp.verify({
      secret: rows[0].secret,
      encoding: "base32",
      token: code,
      window: 2,
    });

    if (!verified) return res.status(400).json({ error: "Invalid code" });

    // Enable 2FA
    // Generate backup codes
    const backupCodes = [];
    for (let i = 0; i < 8; i++) {
      backupCodes.push(
        Math.random().toString(36).substring(2, 8).toUpperCase()
      );
    }

    await pool.query(
      "UPDATE user_2fa SET enabled = true, backup_codes = $2 WHERE user_id = $1",
      [req.user.id, JSON.stringify(backupCodes)]
    );

    res.json({ success: true, backupCodes });
  } catch (err) {
    console.error("2FA verify error:", err);
    res.status(500).json({ error: "Failed to verify" });
  }
});

// POST /api/2fa/validate - Validate code during login
router.post("/validate", async (req, res) => {
  try {
    const { userId, code } = req.body;
    if (!userId || !code) return res.status(400).json({ error: "User ID and code required" });

    const { rows } = await pool.query(
      "SELECT secret, backup_codes FROM user_2fa WHERE user_id = $1 AND enabled = true",
      [userId]
    );
    if (!rows.length) return res.status(400).json({ error: "2FA not enabled" });

    // Check TOTP code
    const verified = speakeasy.totp.verify({
      secret: rows[0].secret,
      encoding: "base32",
      token: code,
      window: 2,
    });

    if (verified) return res.json({ valid: true });

    // Check backup codes
    const backupCodes = JSON.parse(rows[0].backup_codes || "[]");
    const backupIdx = backupCodes.indexOf(code.toUpperCase());
    if (backupIdx >= 0) {
      // Remove used backup code
      backupCodes.splice(backupIdx, 1);
      await pool.query(
        "UPDATE user_2fa SET backup_codes = $2 WHERE user_id = $1",
        [userId, JSON.stringify(backupCodes)]
      );
      return res.json({ valid: true, backupCodeUsed: true });
    }

    res.status(400).json({ error: "Invalid code" });
  } catch (err) {
    console.error("2FA validate error:", err);
    res.status(500).json({ error: "Validation failed" });
  }
});

// POST /api/2fa/disable - Disable 2FA
router.post("/disable", authMiddleware, async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: "Code required to disable 2FA" });

    const { rows } = await pool.query(
      "SELECT secret FROM user_2fa WHERE user_id = $1 AND enabled = true",
      [req.user.id]
    );
    if (!rows.length) return res.status(400).json({ error: "2FA not enabled" });

    const verified = speakeasy.totp.verify({
      secret: rows[0].secret,
      encoding: "base32",
      token: code,
      window: 2,
    });

    if (!verified) return res.status(400).json({ error: "Invalid code" });

    await pool.query("DELETE FROM user_2fa WHERE user_id = $1", [req.user.id]);
    res.json({ success: true });
  } catch (err) {
    console.error("2FA disable error:", err);
    res.status(500).json({ error: "Failed to disable 2FA" });
  }
});

module.exports = router;
