// routes/stats.js
// GET /api/stats  — aggregate metrics for the frontend

const express = require('express');
const Classification = require('../models/Classification');
const router  = express.Router();

// ══════════════════════════════════════════════════════════════════
//  GET /api/stats
// ══════════════════════════════════════════════════════════════════
router.get('/stats', async (req, res) => {
  try {
    const [totalScans, distribution, avgByClass, daily] = await Promise.all([
      Classification.countDocuments(),
      Classification.getClassDistribution(),
      Classification.getAvgConfidenceByClass(),
      Classification.getDailyScans(30),
    ]);

    // Overall average confidence
    const avgConfidence = avgByClass.length
      ? avgByClass.reduce((s, r) => s + r.avgConf * r.count, 0) /
        avgByClass.reduce((s, r) => s + r.count, 0)
      : 0;

    // Today's count
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayScans = await Classification.countDocuments({ scannedAt: { $gte: todayStart } });

    // Model accuracy placeholder (set from your training notebook results)
    const accuracy = process.env.MODEL_ACCURACY || '93.2';

    return res.json({
      totalScans,
      todayScans,
      avgConfidence:    parseFloat((avgConfidence * 100).toFixed(2)),
      accuracy,
      distribution,
      avgByClass,
      dailyScans: daily,
    });
  } catch (err) {
    console.error('Stats error:', err);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
