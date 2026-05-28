# app.py — Flask backend for Drone Classify Atlas
# Replaces Node.js/Express completely
# Run: python app.py

import os
import io
import numpy as np
from datetime import datetime, timezone, timedelta
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from PIL import Image
import tensorflow as tf
from pymongo import MongoClient
from bson import ObjectId
from dotenv import load_dotenv

# ── Load environment variables ─────────────────────────────────────────────
load_dotenv()

MONGO_URI      = os.getenv("MONGO_URI", "mongodb://localhost:27017/drone_classify_atlas")
PORT           = int(os.getenv("PORT", 5000))
MODEL_PATH     = os.getenv("MODEL_PATH", "drone_model_files/drone_classifier_final.keras")
MODEL_ACCURACY = os.getenv("MODEL_ACCURACY", "97")
FRONTEND_PATH  = os.path.join(os.path.dirname(__file__), "frontend")

CLASS_NAMES = ["Hexacopter", "Octacopter", "Quadcopter", "Single_motor", "Tricopter"]
IMG_SIZE    = (224, 224)

# ── Flask app ──────────────────────────────────────────────────────────────
app = Flask(__name__, static_folder=FRONTEND_PATH)
CORS(app)

# ── MongoDB ────────────────────────────────────────────────────────────────
mongo_client = MongoClient(MONGO_URI)
db           = mongo_client["drone_classify_atlas"]
col          = db["classifications"]

# ── Load TF model ──────────────────────────────────────────────────────────
tf_model = None
try:
    tf_model = tf.keras.models.load_model(MODEL_PATH)
    print(f"✅  Keras model loaded from {MODEL_PATH}")
except Exception as e:
    print(f"⚠️   Keras model not found — demo mode active: {e}")

# ── Helper: run inference ──────────────────────────────────────────────────
def run_inference(image_bytes):
    """Returns dict with predictedClass, confidence, allProbabilities, demo."""
    if tf_model is None:
        raw  = np.random.dirichlet(np.ones(len(CLASS_NAMES)))
        top  = int(np.argmax(raw))
        return {
            "predictedClass":   CLASS_NAMES[top],
            "confidence":       float(raw[top]),
            "allProbabilities": {c: float(p) for c, p in zip(CLASS_NAMES, raw)},
            "demo": True,
        }

    img = Image.open(io.BytesIO(image_bytes)).convert("RGB").resize(IMG_SIZE, Image.BILINEAR)
    arr = np.array(img, dtype=np.float32) / 255.0
    tensor = arr[np.newaxis, ...]                        # shape (1,224,224,3)

    probs = tf_model.predict(tensor, verbose=0)[0]       # simple keras predict

    top = int(np.argmax(probs))
    return {
        "predictedClass":   CLASS_NAMES[top],
        "confidence":       float(probs[top]),
        "allProbabilities": {c: float(p) for c, p in zip(CLASS_NAMES, probs)},
        "demo": False,
    }

# ── Helper: serialize MongoDB doc ─────────────────────────────────────────
def serialize(doc):
    doc["_id"] = str(doc["_id"])
    if "scannedAt" in doc and isinstance(doc["scannedAt"], datetime):
        doc["scannedAt"] = doc["scannedAt"].isoformat()
    if "createdAt" in doc and isinstance(doc["createdAt"], datetime):
        doc["createdAt"] = doc["createdAt"].isoformat()
    if "updatedAt" in doc and isinstance(doc["updatedAt"], datetime):
        doc["updatedAt"] = doc["updatedAt"].isoformat()
    return doc

# ══════════════════════════════════════════════════════════════════════════════
#  ROUTES
# ══════════════════════════════════════════════════════════════════════════════

# ── Serve frontend static files ────────────────────────────────────────────
@app.route("/")
def index():
    return send_from_directory(FRONTEND_PATH, "index.html")

@app.route("/<path:filename>")
def static_files(filename):
    return send_from_directory(FRONTEND_PATH, filename)

# ── Health check ───────────────────────────────────────────────────────────
@app.route("/api/health")
def health():
    return jsonify({
        "status":    "ok",
        "service":   "Drone Classify Atlas API (Flask)",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })

# ── POST /api/classify ─────────────────────────────────────────────────────
@app.route("/api/classify", methods=["POST"])
def classify():
    if "image" not in request.files:
        return jsonify({"error": "No image uploaded"}), 400

    file = request.files["image"]
    if file.mimetype not in ("image/jpeg", "image/png", "image/webp"):
        return jsonify({"error": "Only JPG / PNG / WEBP images are accepted"}), 400

    image_bytes = file.read()
    if len(image_bytes) > 10 * 1024 * 1024:
        return jsonify({"error": "File must be under 10 MB"}), 400

    try:
        result = run_inference(image_bytes)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    return jsonify({
        "filename":         file.filename,
        "fileSize":         len(image_bytes),
        "mimeType":         file.mimetype,
        "predictedClass":   result["predictedClass"],
        "confidence":       result["confidence"],
        "allProbabilities": result["allProbabilities"],
        "scannedAt":        datetime.now(timezone.utc).isoformat(),
        "demo":             result["demo"],
    })

# ── POST /api/classifications — save result to MongoDB ────────────────────
@app.route("/api/classifications", methods=["POST"])
def save_classification():
    body = request.get_json()
    if not body or "predictedClass" not in body or "confidence" not in body:
        return jsonify({"error": "predictedClass and confidence are required"}), 400

    doc = {
        "filename":         body.get("filename", "unknown.jpg"),
        "fileSize":         body.get("fileSize"),
        "mimeType":         body.get("mimeType"),
        "predictedClass":   body["predictedClass"],
        "confidence":       body["confidence"],
        "allProbabilities": body.get("allProbabilities", {}),
        "sessionId":        request.headers.get("x-session-id"),
        "ipAddress":        request.remote_addr,
        "scannedAt":        datetime.now(timezone.utc),
        "createdAt":        datetime.now(timezone.utc),
        "updatedAt":        datetime.now(timezone.utc),
    }

    result = col.insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    doc["scannedAt"] = doc["scannedAt"].isoformat()
    doc["createdAt"] = doc["createdAt"].isoformat()
    doc["updatedAt"] = doc["updatedAt"].isoformat()

    return jsonify(doc), 201

# ── GET /api/classifications — paginated history ───────────────────────────
@app.route("/api/classifications", methods=["GET"])
def get_classifications():
    page   = max(1, int(request.args.get("page", 1)))
    limit  = min(500, int(request.args.get("limit", 20)))
    skip   = (page - 1) * limit

    query = {}
    if request.args.get("class"):
        query["predictedClass"] = request.args["class"]
    if request.args.get("search"):
        query["filename"] = {"$regex": request.args["search"], "$options": "i"}

    sort_map = {
        "newest":    [("scannedAt", -1)],
        "oldest":    [("scannedAt",  1)],
        "conf-desc": [("confidence", -1)],
        "conf-asc":  [("confidence",  1)],
    }
    sort = sort_map.get(request.args.get("sort", "newest"), [("scannedAt", -1)])

    total   = col.count_documents(query)
    records = [serialize(doc) for doc in col.find(query).sort(sort).skip(skip).limit(limit)]

    return jsonify({
        "records": records,
        "total":   total,
        "page":    page,
        "pages":   (total + limit - 1) // limit,
    })

# ── GET /api/classifications/:id ───────────────────────────────────────────
@app.route("/api/classifications/<id>", methods=["GET"])
def get_classification(id):
    try:
        doc = col.find_one({"_id": ObjectId(id)})
    except Exception:
        return jsonify({"error": "Invalid ID"}), 400
    if not doc:
        return jsonify({"error": "Record not found"}), 404
    return jsonify(serialize(doc))

# ── DELETE /api/classifications/:id ───────────────────────────────────────
@app.route("/api/classifications/<id>", methods=["DELETE"])
def delete_classification(id):
    try:
        result = col.delete_one({"_id": ObjectId(id)})
    except Exception:
        return jsonify({"error": "Invalid ID"}), 400
    if result.deleted_count == 0:
        return jsonify({"error": "Record not found"}), 404
    return jsonify({"message": "Deleted", "id": id})

# ── GET /api/stats ─────────────────────────────────────────────────────────
@app.route("/api/stats")
def stats():
    total = col.count_documents({})

    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    today_scans = col.count_documents({"scannedAt": {"$gte": today_start}})

    # Class distribution
    distribution = list(col.aggregate([
        {"$group": {"_id": "$predictedClass", "count": {"$sum": 1}}},
        {"$sort":  {"count": -1}},
    ]))

    # Average confidence per class
    avg_by_class = list(col.aggregate([
        {"$group": {
            "_id":     "$predictedClass",
            "avgConf": {"$avg": "$confidence"},
            "count":   {"$sum": 1},
        }},
        {"$sort": {"avgConf": -1}},
    ]))

    # Overall average confidence
    avg_conf = 0.0
    if avg_by_class:
        total_weight = sum(r["count"] for r in avg_by_class)
        avg_conf = sum(r["avgConf"] * r["count"] for r in avg_by_class) / total_weight if total_weight else 0

    # Daily scans (last 30 days)
    since = datetime.now(timezone.utc) - timedelta(days=30)
    daily = list(col.aggregate([
        {"$match": {"scannedAt": {"$gte": since}}},
        {"$group": {
            "_id":   {"$dateToString": {"format": "%Y-%m-%d", "date": "$scannedAt"}},
            "count": {"$sum": 1},
        }},
        {"$sort": {"_id": 1}},
    ]))

    return jsonify({
        "totalScans":    total,
        "todayScans":    today_scans,
        "avgConfidence": round(avg_conf * 100, 2),
        "accuracy":      MODEL_ACCURACY,
        "distribution":  distribution,
        "avgByClass":    avg_by_class,
        "dailyScans":    daily,
    })

# ── Run ────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print(f"\n🚁  Drone Classify Atlas — Flask Backend")
    print(f"    http://localhost:{PORT}")
    print(f"    http://localhost:{PORT}/api/health\n")
    app.run(host="0.0.0.0", port=PORT, debug=True)
