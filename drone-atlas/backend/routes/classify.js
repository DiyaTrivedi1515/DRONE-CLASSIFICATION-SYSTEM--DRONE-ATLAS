// routes/classify.js
// POST /api/classify  — run inference and optionally persist
// POST /api/classifications — manually save a result
// GET  /api/classifications — fetch history with pagination & filters
// GET  /api/classifications/:id — single record
// DELETE /api/classifications/:id — delete

const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const Classification = require('../models/Classification');

const router  = express.Router();

// ── Multer — store uploads in memory (for TF inference) ───────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 },   // 10 MB
  fileFilter: (_req, file, cb) => {
    const ok = /image\/(jpeg|jpg|png|webp)/.test(file.mimetype);
    cb(ok ? null : new Error('Only JPG / PNG / WEBP images are accepted'), ok);
  },
});

// ── Lazy-load the TF model ────────────────────────────────────────────────
const MODEL_PATH = process.env.MODEL_PATH ||
  path.join(__dirname, '../../models/drone_classifier_tf');

let tfModel    = null;
let tf         = null;
const CLASS_NAMES = ['Hexacopter', 'Octacopter', 'Quadcopter', 'Single_motor', 'Tricopter'];

async function loadModel() {
  if (tfModel) return tfModel;
  try {
    tf      = require('@tensorflow/tfjs-node');
    tfModel = await tf.loadSavedModel(MODEL_PATH);
    console.log('🧠  TF model loaded from', MODEL_PATH);
  } catch (err) {
    console.warn('⚠️  TF model not found — classify endpoint will return demo results:', err.message);
  }
  return tfModel;
}
loadModel();   // warm up on startup

// ── Inference helper ──────────────────────────────────────────────────────
async function runInference(imageBuffer) {
  if (!tf || !tfModel) {
    // Return plausible demo probabilities when model not loaded
    const raw  = CLASS_NAMES.map(() => Math.random());
    const sum  = raw.reduce((a, b) => a + b, 0);
    const norm = raw.map(v => v / sum);
    const topI = norm.indexOf(Math.max(...norm));
    return {
      predictedClass:   CLASS_NAMES[topI],
      confidence:       norm[topI],
      allProbabilities: Object.fromEntries(CLASS_NAMES.map((c, i) => [c, norm[i]])),
      demo: true,
    };
  }

  const imageTensor = tf.node.decodeImage(imageBuffer, 3)
    .resizeBilinear([224, 224])
    .div(255.0)
    .expandDims(0);

  const output = tfModel.predict(imageTensor);
  const probs  = Array.from(await output.data());
  const topI   = probs.indexOf(Math.max(...probs));

  imageTensor.dispose();
  output.dispose();

  return {
    predictedClass:   CLASS_NAMES[topI],
    confidence:       probs[topI],
    allProbabilities: Object.fromEntries(CLASS_NAMES.map((c, i) => [c, probs[i]])),
    demo: false,
  };
}

// ══════════════════════════════════════════════════════════════════
//  POST /api/classify
//  Upload image → inference → return result (does NOT save to DB)
// ══════════════════════════════════════════════════════════════════
router.post('/classify', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image uploaded' });

    const result = await runInference(req.file.buffer);

    return res.json({
      filename:         req.file.originalname,
      fileSize:         req.file.size,
      mimeType:         req.file.mimetype,
      predictedClass:   result.predictedClass,
      confidence:       result.confidence,
      allProbabilities: result.allProbabilities,
      scannedAt:        new Date().toISOString(),
      demo:             result.demo,
    });
  } catch (err) {
    console.error('Classify error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════
//  POST /api/classifications
//  Persist a classification result to MongoDB
// ══════════════════════════════════════════════════════════════════
router.post('/classifications', async (req, res) => {
  try {
    const { filename, predictedClass, confidence, allProbabilities, fileSize, mimeType } = req.body;

    if (!predictedClass || confidence === undefined) {
      return res.status(400).json({ error: 'predictedClass and confidence are required' });
    }

    const record = await Classification.create({
      filename,
      fileSize,
      mimeType,
      predictedClass,
      confidence,
      allProbabilities,
      ipAddress: req.ip,
      sessionId: req.headers['x-session-id'] || null,
    });

    return res.status(201).json(record);
  } catch (err) {
    console.error('Save error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════
//  GET /api/classifications
//  Query params: page, limit, class, search, sort
// ══════════════════════════════════════════════════════════════════
router.get('/classifications', async (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page  || '1'));
    const limit  = Math.min(500, parseInt(req.query.limit || '20'));
    const skip   = (page - 1) * limit;

    // Build filter
    const filter = {};
    if (req.query.class)  filter.predictedClass = req.query.class;
    if (req.query.search) filter.filename = { $regex: req.query.search, $options: 'i' };

    // Sort
    const sortMap = {
      newest:    { scannedAt: -1 },
      oldest:    { scannedAt: 1  },
      'conf-desc': { confidence: -1 },
      'conf-asc':  { confidence: 1  },
    };
    const sort = sortMap[req.query.sort] || { scannedAt: -1 };

    const [records, total] = await Promise.all([
      Classification.find(filter).sort(sort).skip(skip).limit(limit).lean(),
      Classification.countDocuments(filter),
    ]);

    return res.json({
      records,
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error('Fetch error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════
//  GET /api/classifications/:id
// ══════════════════════════════════════════════════════════════════
router.get('/classifications/:id', async (req, res) => {
  try {
    const record = await Classification.findById(req.params.id);
    if (!record) return res.status(404).json({ error: 'Record not found' });
    return res.json(record);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════
//  DELETE /api/classifications/:id
// ══════════════════════════════════════════════════════════════════
router.delete('/classifications/:id', async (req, res) => {
  try {
    const record = await Classification.findByIdAndDelete(req.params.id);
    if (!record) return res.status(404).json({ error: 'Record not found' });
    return res.json({ message: 'Deleted', id: req.params.id });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
