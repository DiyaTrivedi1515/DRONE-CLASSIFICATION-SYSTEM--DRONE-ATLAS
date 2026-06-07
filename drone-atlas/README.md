# 🚁 Drone Atlas — AI Drone Classifier

A web application that classifies drone types using a deep learning model trained on drone images.

## Tech Stack
- **Frontend** — HTML, CSS, JavaScript
- **Backend** — Python, Flask
- **AI Model** — TensorFlow / Keras (CNN)-TRANSFER LEARNING APPLIED(MobileNetV2)
- **Database** — MongoDB Atlas

## Drone Classes
- Hexacopter
- Octacopter
- Quadcopter
- Single Motor
- Tricopter

## Setup Instructions

### 1 — Clone the repository
```bash
git clone https://github.com/yourusername/drone-atlas.git
cd drone-atlas
```

### 2 — Add your model file
Place your trained model inside the project:
```
drone-atlas/
└── drone_model_files/
    └── drone_classifier_final.keras
```
> The model file is not included in this repo (too large). Train it using the notebook or contact the owner.

### 3 — Create your `.env` file
```bash
copy .env.example .env
```
Edit `.env` and fill in your MongoDB Atlas URI:
```env
MONGO_URI=mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/drone_classify_atlas
PORT=5000
MODEL_PATH=drone_model_files/drone_classifier_final.keras
MODEL_ACCURACY=97
```

### 4 — Install dependencies
```bash
pip install -r requirements.txt
```

### 5 — Run the app
```bash
python app.py
```

Open **http://localhost:5000** in your browser.

## Model Accuracy
**97%** on test dataset
