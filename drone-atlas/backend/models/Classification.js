// models/Classification.js
// Mongoose schema for a drone classification scan result

const mongoose = require('mongoose');

const probabilitySchema = new mongoose.Schema(
  {
    Hexacopter:   { type: Number, min: 0, max: 1 },
    Octacopter:   { type: Number, min: 0, max: 1 },
    Quadcopter:   { type: Number, min: 0, max: 1 },
    Single_motor: { type: Number, min: 0, max: 1 },
    Tricopter:    { type: Number, min: 0, max: 1 },
  },
  { _id: false }
);

const classificationSchema = new mongoose.Schema(
  {
    // ── Image metadata ─────────────────────────────────────────────────────
    filename: {
      type: String,
      trim: true,
      default: 'unknown.jpg',
    },
    fileSize: {
      type: Number,   // bytes
      default: null,
    },
    mimeType: {
      type: String,
      default: null,
    },

    // ── Model output ───────────────────────────────────────────────────────
    predictedClass: {
      type: String,
      enum: ['Hexacopter', 'Octacopter', 'Quadcopter', 'Single_motor', 'Tricopter'],
      required: true,
      index: true,
    },
    confidence: {
      type: Number,
      required: true,
      min: 0,
      max: 1,
    },
    allProbabilities: {
      type: probabilitySchema,
      default: {},
    },

    // ── Grad-CAM heatmap (optional, stored as base64 PNG) ─────────────────
    gradcamImage: {
      type: String,
      default: null,
      select: false,   // excluded from default queries to keep responses slim
    },

    // ── Session / user ─────────────────────────────────────────────────────
    sessionId: {
      type: String,
      default: null,
      index: true,
    },
    ipAddress: {
      type: String,
      default: null,
    },

    // ── Timestamps ─────────────────────────────────────────────────────────
    scannedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,   // adds createdAt / updatedAt
    toJSON:  { virtuals: true },
    toObject:{ virtuals: true },
  }
);

// ── Virtuals ───────────────────────────────────────────────────────────────
classificationSchema.virtual('confidencePct').get(function () {
  return `${(this.confidence * 100).toFixed(2)}%`;
});

// ── Indexes ────────────────────────────────────────────────────────────────
classificationSchema.index({ predictedClass: 1, scannedAt: -1 });
classificationSchema.index({ scannedAt: -1 });

// ── Static helpers ─────────────────────────────────────────────────────────

/**
 * Class distribution across all documents.
 * Returns [{ _id: 'Hexacopter', count: 42 }, …]
 */
classificationSchema.statics.getClassDistribution = function () {
  return this.aggregate([
    { $group: { _id: '$predictedClass', count: { $sum: 1 } } },
    { $sort:  { count: -1 } },
  ]);
};

/**
 * Average confidence per class.
 */
classificationSchema.statics.getAvgConfidenceByClass = function () {
  return this.aggregate([
    {
      $group: {
        _id:        '$predictedClass',
        avgConf:    { $avg: '$confidence' },
        count:      { $sum: 1 },
      },
    },
    { $sort: { avgConf: -1 } },
  ]);
};

/**
 * Daily scan counts for the last `days` days.
 */
classificationSchema.statics.getDailyScans = function (days = 30) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  return this.aggregate([
    { $match: { scannedAt: { $gte: since } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$scannedAt' } },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);
};

module.exports = mongoose.model('Classification', classificationSchema);
