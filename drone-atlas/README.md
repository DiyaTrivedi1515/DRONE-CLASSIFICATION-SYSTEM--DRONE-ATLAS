# 🚁 Drone Classify Atlas

A full-stack web application for UAV image classification.  
**Frontend:** Pure HTML/CSS/JS (no framework)  
**Backend:** Node.js + Express  
**Database:** MongoDB via Mongoose  
**Model:** MobileNetV2 fine-tuned on 2 251 drone images (5 classes)

---

## Project Structure

```
drone-classify-atlas/
├── index.html          ← Classify page (upload + inference)
├── atlas.html          ← Drone type catalog
├── dashboard.html      ← Scan history + analytics
├── css/
│   └── styles.css
├── js/
│   ├── app.js          ← Shared helpers & API base
│   ├── classify.js     ← Upload / inference / result UI
│   └── dashboard.js    ← History table, KPIs, chart
└── backend/
    ├── server.js           ← Express entry point
    ├── package.json
    ├── .env.example        ← Copy to .env
    ├── config/
    │   └── db.js           ← Mongoose connection
    ├── models/
    │   └── Classification.js   ← MongoDB schema + statics
    ├── routes/
    │   ├── classify.js     ← /api/classify, /api/classifications
    │   └── stats.js        ← /api/stats
    └── scripts/
        └── seed.js         ← Populate DB with demo data
```

---

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | ≥ 18 |
| MongoDB | ≥ 6 (local) or MongoDB Atlas |
| Python + TF | for the training notebooks |

---

## Quick Start

### 1 · Train the model (if not done yet)
```bash
# Open and run drone_training.ipynb in Jupyter
# It will produce:  models/drone_classifier_tf/
#                   models/drone_classifier_final.keras
#                   class_indices.json
```

### 2 · Configure the backend
```bash
cd backend
cp .env.example .env
# Edit .env:
#   MONGO_URI  — your MongoDB connection string
#   MODEL_PATH — absolute path to models/drone_classifier_tf
```

### 3 · Install dependencies & start the server
```bash
cd backend
npm install
npm run dev          # nodemon (auto-restart on changes)
# or
npm start            # plain node
```

Server starts on **http://localhost:3000**

### 4 · (Optional) Seed the database with demo records
```bash
cd backend
node scripts/seed.js
```

### 5 · Open the frontend
Open `index.html` in your browser directly **or** use VS Code Live Server.  
The backend also serves static files at **http://localhost:3000**.

---

## API Reference

### `POST /api/classify`
Upload an image for inference. Returns result but does **not** save to DB.

**Body:** `multipart/form-data` with field `image`

**Response:**
```json
{
  "filename": "drone.jpg",
  "predictedClass": "Hexacopter",
  "confidence": 0.9423,
  "allProbabilities": {
    "Hexacopter": 0.9423,
    "Octacopter": 0.0214,
    "Quadcopter": 0.0198,
    "Single_motor": 0.0112,
    "Tricopter": 0.0053
  },
  "scannedAt": "2025-06-01T10:30:00.000Z",
  "demo": false
}
```

### `POST /api/classifications`
Persist a result to MongoDB.

**Body (JSON):**
```json
{
  "filename": "drone.jpg",
  "predictedClass": "Hexacopter",
  "confidence": 0.9423,
  "allProbabilities": { ... }
}
```

### `GET /api/classifications`
Fetch paginated history.

**Query params:**
| Param | Default | Description |
|-------|---------|-------------|
| `page` | 1 | Page number |
| `limit` | 20 | Records per page (max 500) |
| `class` | — | Filter by `predictedClass` |
| `search` | — | Search by filename |
| `sort` | `newest` | `newest` \| `oldest` \| `conf-desc` \| `conf-asc` |

### `GET /api/classifications/:id`
Single record by MongoDB `_id`.

### `DELETE /api/classifications/:id`
Delete a record.

### `GET /api/stats`
Aggregate metrics — total scans, daily counts, class distribution, average confidence.

### `GET /api/health`
Health check.

---

## MongoDB Schema

```js
{
  filename:         String,
  fileSize:         Number,         // bytes
  mimeType:         String,
  predictedClass:   String,         // enum of 5 classes
  confidence:       Number,         // 0–1
  allProbabilities: {
    Hexacopter:   Number,
    Octacopter:   Number,
    Quadcopter:   Number,
    Single_motor: Number,
    Tricopter:    Number,
  },
  sessionId:        String,
  ipAddress:        String,
  scannedAt:        Date,
  createdAt:        Date,           // Mongoose timestamp
  updatedAt:        Date,
}
```

---

## Drone Classes

| Class | Rotors | Training Images |
|-------|--------|----------------|
| Hexacopter | 6 | 480 |
| Octacopter | 8 | 482 |
| Quadcopter | 4 | 466 |
| Single Motor | 1 + tail | 368 |
| Tricopter | 3 | 455 |

---

## Notes

- When the backend is **not running**, the frontend falls back to randomised demo predictions automatically (no errors shown to the user).
- The `@tensorflow/tfjs-node` package is only required if you want **real model inference** in the backend. If your model is served elsewhere (e.g. Python Flask + TF Serving), replace `runInference()` in `routes/classify.js` with an HTTP call to that service.
- For MongoDB Atlas, replace `MONGO_URI` in `.env` with your Atlas connection string.
