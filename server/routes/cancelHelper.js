const express = require("express");
const router = express.Router();
const pool = require("../db/pool");
const { authMiddleware } = require("../middleware/auth");

router.use(authMiddleware);

// Cancellation database - direct links and instructions for popular services
const CANCEL_DB = {
  "netflix": { url: "https://www.netflix.com/cancelplan", method: "Online", steps: ["Go to Account", "Click Cancel Membership", "Confirm cancellation"], difficulty: "Easy", note: "Access continues until end of billing period" },
  "hulu": { url: "https://secure.hulu.com/account", method: "Online", steps: ["Go to Account page", "Click Cancel under Your Subscription", "Confirm"], difficulty: "Easy", note: "You keep access until end of period" },
  "disney": { url: "https://www.disneyplus.com/account", method: "Online", steps: ["Go to Account", "Click your subscription", "Click Cancel Subscription"], difficulty: "Easy", note: "" },
  "spotify": { url: "https://www.spotify.com/account/subscription/", method: "Online", steps: ["Go to Account page", "Scroll to Your plan", "Click Change plan then Cancel Premium"], difficulty: "Easy", note: "Reverts to free tier" },
  "amazon prime": { url: "https://www.amazon.com/mc/pipelines/cancel", method: "Online", steps: ["Go to Prime membership settings", "Click End membership", "Confirm cancellation"], difficulty: "Easy", note: "May get retention offer" },
  "apple": { url: "https://support.apple.com/en-us/HT202039", method: "Device Settings", steps: ["Open Settings on iPhone", "Tap your name > Subscriptions", "Tap the subscription > Cancel"], difficulty: "Easy", note: "Works for all Apple subscriptions" },
  "youtube": { url: "https://www.youtube.com/paid_memberships", method: "Online", steps: ["Go to youtube.com/paid_memberships", "Click Manage membership", "Click Deactivate"], difficulty: "Easy", note: "" },
  "hbo": { url: "https://www.max.com/settings/subscription", method: "Online", steps: ["Go to Settings", "Click Subscription", "Click Cancel Subscription"], difficulty: "Easy", note: "Now called Max" },
  "peacock": { url: "https://www.peacocktv.com/account/plan", method: "Online", steps: ["Go to Account", "Click your plan", "Click Cancel Plan"], difficulty: "Easy", note: "" },
  "paramount": { url: "https://www.paramountplus.com/account/", method: "Online", steps: ["Go to Account", "Click Cancel Subscription", "Confirm"], difficulty: "Easy", note: "" },
  "gym": { method: "In Person / Mail", steps: ["Most gyms require in-person visit or certified letter", "Bring photo ID", "Ask for written confirmation"], difficulty: "Hard", note: "Planet Fitness, LA Fitness etc often require letter or in-person" },
  "planet fitness": { method: "In Person / Mail", steps: ["Visit your home club in person", "OR send certified letter to your home club", "Include name, address, and membership barcode"], difficulty: "Hard", note: "Cannot cancel online or by phone" },
  "adobe": { url: "https://account.adobe.com/plans", method: "Online", steps: ["Go to Plans page", "Click Manage plan", "Click Cancel plan"], difficulty: "Medium", note: "Annual plans may have early termination fee" },
  "microsoft": { url: "https://account.microsoft.com/services", method: "Online", steps: ["Go to Services & Subscriptions", "Find your subscription", "Click Manage > Cancel"], difficulty: "Easy", note: "" },
  "doordash": { url: "https://www.doordash.com/consumer/membership/", method: "Online", steps: ["Go to DashPass page", "Click Manage", "Click End Subscription"], difficulty: "Easy", note: "" },
  "instacart": { url: "https://www.instacart.com/store/account/instacart-plus", method: "Online", steps: ["Go to Account > Instacart+", "Click Manage membership", "Click Turn off auto-renew"], difficulty: "Easy", note: "" },
  "audible": { url: "https://www.audible.com/account/overview", method: "Online", steps: ["Go to Account Details", "Click Cancel membership", "Follow prompts - they will offer deals"], difficulty: "Medium", note: "They aggressively try to retain you" },
  "sirius": { method: "Phone Call", steps: ["Call 1-866-635-2349", "Say 'Cancel subscription'", "Be firm - they will offer many retention deals"], difficulty: "Hard", note: "Call is the only reliable way. Budget 20-30 minutes." },
};

// GET /api/cancel-helper/lookup?name=netflix
router.get("/lookup", async (req, res) => {
  try {
    const name = (req.query.name || "").toLowerCase();
    if (!name) return res.status(400).json({ error: "Name required" });

    // Find best match
    let match = null;
    for (const [key, data] of Object.entries(CANCEL_DB)) {
      if (name.includes(key) || key.includes(name)) { match = { service: key, ...data }; break; }
    }

    if (match) {
      res.json({ found: true, ...match });
    } else {
      // Generic advice
      res.json({
        found: false,
        service: name,
        method: "Check Account Settings",
        steps: [
          "Log into your " + name + " account",
          "Look for Account Settings or Subscription/Billing",
          "Find Cancel or Unsubscribe option",
          "If no option online, call their customer support",
          "Ask for written confirmation of cancellation",
        ],
        difficulty: "Unknown",
        note: "Check your email for the original signup confirmation to find the service's website",
      });
    }
  } catch (err) { res.status(500).json({ error: "Failed" }); }
});

// Generate cancellation email template
router.get("/email-template", async (req, res) => {
  try {
    const name = req.query.name || "the service";
    const template = {
      subject: "Request to Cancel My Subscription - " + name,
      body: "Hello,\n\nI am writing to request the immediate cancellation of my subscription/membership with " + name + ".\n\nPlease confirm the cancellation and ensure no further charges are made to my payment method on file.\n\nIf there are any remaining balances or steps I need to complete, please let me know.\n\nThank you for your prompt attention to this matter.\n\nBest regards",
    };
    res.json(template);
  } catch (err) { res.status(500).json({ error: "Failed" }); }
});

module.exports = router;
