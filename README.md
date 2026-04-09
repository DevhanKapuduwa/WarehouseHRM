# WarehouseHRM — AI-Powered HR & Task Management System

> An integrated, multi-service platform combining a **Laravel + React management dashboard** with **real-time face recognition attendance**, **AWS Rekognition emotion analysis**, and a **machine-learning churn prediction engine**.

---

## ⚡ Quick Start (After Setup)

> Already set up the project? Just run these two commands from **anywhere** on Windows:

**▶️ Start everything:**
```powershell
powershell -ExecutionPolicy Bypass -File "D:\Data managment\start_all.ps1"
```

**⏹ Stop everything:**
```powershell
powershell -ExecutionPolicy Bypass -File "D:\Data managment\stop_all.ps1"
```

Then open 👉 **http://localhost:5173** in your browser.

> 💡 **Why `-ExecutionPolicy Bypass`?** Windows blocks unsigned scripts by default. This flag lets you run the scripts without permanently changing your system policy — it only applies to that single command.

---

## 📋 Table of Contents

- [⚡ Quick Start (After Setup)](#-quick-start-after-setup)
- [System Overview](#-system-overview)
- [Architecture](#-architecture)
- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [Prerequisites](#-prerequisites)
- [First-Time Setup](#-first-time-setup)
- [Running the Application](#-running-the-application)
- [Stopping the Application](#-stopping-the-application)
- [Service URLs](#-service-urls)
- [Face Enrollment Guide](#-face-enrollment-guide)
- [Churn Model Training](#-churn-model-training)
- [Environment Variables](#-environment-variables)

---

## 🧭 System Overview

WarehouseHRM is a monorepo containing **four integrated services** that work together:

| # | Service | Technology | Purpose |
|---|---------|-----------|---------|
| 1 | **HR & Task Management Backend** | Laravel 10 + React (Inertia.js) | Main dashboard — workers, tasks, attendance |
| 2 | **Face Detection & Attendance** | Python · YOLOv8 · InsightFace · Intel RealSense | Real-time face recognition using a depth camera |
| 3 | **Emotion Analysis** | Python · Amazon Rekognition | Analyses captured face snapshots for emotions & demographics |
| 4 | **Churn Prediction API** | Python · FastAPI · Scikit-learn | Predicts employee churn risk using ML |

---

## 🏗 Architecture

```
Browser (React/Inertia)
        │
        ▼
Laravel Backend  (:8000)  ──► MySQL Database
        │
        ├──► Churn API  (:8001)  [FastAPI / Python]
        │         └── churn_model.joblib (scikit-learn pipeline)
        │
        └──► Emotion Analysis  [on-demand via API call]
                  └── Amazon Rekognition (ap-south-1)

RealSense Camera
        │
        ▼
Face Detection (step8) ──► detections_log.csv
        │                ──► faceEmotionAWS/database/<name>/<photo>.jpg
        └── Attendance logged every 10 seconds per person (cooldown)
```

---

## ✨ Features

### 👷 Worker & HR Management
- Add, edit, and view worker profiles
- Assign roles, departments, and job positions
- Track employee status (active / inactive)

### ✅ Task Management
- Create and assign tasks to workers
- Track task completion and deadlines
- Dashboard overview of pending and completed tasks

### 📸 Real-Time Face Recognition Attendance
- Uses **Intel RealSense D400-series** depth camera at 1280×720
- **YOLOv8s** detects persons in the frame
- **InsightFace (RetinaFace + ArcFace)** extracts 512-dim face embeddings
- **Low-light enhancement** (CLAHE + auto-gamma + bilateral denoise)
- **Temporal voting tracker** — confirms identity across multiple frames before logging
- **Pose-adaptive thresholds** — handles angled and rotated faces
- Attendance logged to `detections_log.csv` with a 10-second cooldown per person
- **Face snapshots** saved automatically to `faceEmotionAWS/database/<name>/` on each log

### 😊 Emotion & Demographic Analysis (AWS Rekognition)
- On-demand analysis of captured face snapshots
- Reports per face:
  - **Emotions**: Happy, Sad, Angry, Surprised, Fear, Disgusted, Confused, Calm (with confidence %)
  - **Demographics**: Age range, Gender
  - **Appearance**: Smile, Beard, Mustache, Eyeglasses, Eyes open, Mouth open
  - **Head pose**: Roll, Yaw, Pitch
  - **Image quality**: Brightness & Sharpness scores
- Results saved as `.rekognition.json` alongside the image
- Dashboard slide-over panel to view analysis per employee

### 📊 Employee Churn Prediction (ML)
- Trained on `employee_churn_dataset.csv` (21 features)
- **Scikit-learn pipeline** with preprocessing + classification
- Served via **FastAPI** at port 8001
- Laravel **ChurnController** calls `/predict-batch` for all active employees
- Dashboard displays risk labels: 🟢 **Low** / 🟡 **Medium** / 🔴 **High**
- API endpoints:
  - `GET  /health` — check model status
  - `POST /predict` — single employee prediction
  - `POST /predict-batch` — batch predictions (used by dashboard)

### 📡 Live Stream Dashboard
- "Start Live Stream" button in the management dashboard
- Triggers `step7_robust_attendance.py` in the background
- Live camera feed displayed inside the dashboard

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend Framework | Laravel 10 (PHP 8.2) |
| Frontend | React 18 + Inertia.js + Vite |
| Database | MySQL |
| Face Detection | YOLOv8 (Ultralytics) |
| Face Recognition | InsightFace (RetinaFace + ArcFace) |
| Depth Camera | Intel RealSense SDK (pyrealsense2) |
| Emotion Analysis | Amazon Rekognition (boto3) |
| ML / Churn API | Python · Scikit-learn · FastAPI · Uvicorn |
| ML Serialization | joblib |

---

## 📁 Project Structure

```
WarehouseHRM/
│
├── HR_and_Task_Management_Backend/   # Laravel + React main application
│   ├── app/                          # Laravel models, controllers, services
│   ├── resources/js/                 # React components, pages (Inertia.js)
│   ├── routes/api.php                # REST API routes
│   ├── database/migrations/          # Database schema
│   └── .env.example                  # Environment template
│
├── faceDetection/                    # Python face recognition pipeline
│   ├── step1_realsense_rgb_fps.py    # Camera FPS test
│   ├── step2_yolo_realsense_people.py # YOLO person detection test
│   ├── step3_yolo_person_to_retinaface.py # Face detection chain
│   ├── step4_embeddings_realsense.py # Embedding extraction
│   ├── step5_enroll_build_db.py      # ⭐ Face enrollment - builds embeddings.npz
│   ├── step6_attendance_realsense.py # Basic attendance (v1)
│   ├── step7_robust_attendance.py    # Improved attendance + live stream
│   ├── step8_attendance_with_photos.py # ⭐ Full attendance + photo capture
│   ├── embeddings.npz                # Face database (generated by step5)
│   ├── detections_log.csv            # Attendance log (generated at runtime)
│   ├── faces_db/                     # Raw enrollment face images
│   ├── yolov8n.pt                    # YOLO nano weights
│   └── yolov8s.pt                    # YOLO small weights (used in production)
│
├── faceEmotionAWS/                   # AWS Rekognition emotion analysis
│   ├── face_analyzer.py              # Single-image Rekognition analyser
│   ├── emotion_batch_analyzer.py     # Batch analyser for all captured photos
│   └── database/                     # Auto-created: <name>/<name>_timestamp.jpg
│
├── model/                            # Churn prediction ML service
│   ├── train_churn_model.py          # Training script — produces churn_model.joblib
│   ├── churn_api.py                  # FastAPI service (runs on :8001)
│   ├── predict_churn.py              # CLI prediction utility
│   ├── employee_churn_dataset.csv    # Training dataset
│   └── artifacts/
│       └── churn_model.joblib        # Trained model (generated by training)
│
├── employee_churn_dataset.csv        # Dataset copy at root
├── start_all.ps1                     # ⭐ One-click startup script (Windows)
├── stop_all.ps1                      # ⭐ One-click stop script (Windows)
└── README.md
```

---

## 🔧 Prerequisites

Make sure the following are installed before you begin:

| Tool | Version | Notes |
|------|---------|-------|
| PHP | 8.2+ | With `ext-pdo`, `ext-mbstring`, `ext-xml` |
| Composer | 2.x | PHP package manager |
| Node.js | 18+ | |
| npm | 9+ | |
| Python | 3.10+ | For all Python services |
| MySQL | 8.x | Local or remote instance |
| Intel RealSense SDK | 2.x | Required for face detection (`pyrealsense2`) |
| AWS Account | — | For Rekognition emotion analysis |

---

## 🚀 First-Time Setup

Follow these steps **only once** on a fresh machine.

### Step 1 — Clone the repository

```bash
git clone https://github.com/DevhanKapuduwa/WarehouseHRM.git
cd WarehouseHRM
```

---

### Step 2 — Laravel Backend Setup

```bash
cd HR_and_Task_Management_Backend

# Install PHP dependencies
composer install

# Copy environment file
copy .env.example .env

# Generate application key
php artisan key:generate
```

Now open `.env` and fill in your database credentials:

```env
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=warehousehrm
DB_USERNAME=root
DB_PASSWORD=your_password
```

Then run the database migrations:

```bash
php artisan migrate
```

Install frontend dependencies and build assets:

```bash
npm install
npm run build
```

---

### Step 3 — Python Virtual Environment (Face Detection)

```bash
cd ..\faceDetection

# Create virtual environment
python -m venv venv

# Activate it
.\venv\Scripts\activate

# Install dependencies
pip install pyrealsense2 ultralytics insightface opencv-python numpy
```

---

### Step 4 — Enroll Faces into the Database

Before running attendance, you must register each employee's face.

1. Place enrolled face images in `faceDetection/faces_db/<EmployeeName>/`  
   (e.g., `faces_db/Devhan/img1.jpg`, `faces_db/Devhan/img2.jpg`)

2. Run the enrollment script:

```bash
cd faceDetection
.\venv\Scripts\activate
python step5_enroll_build_db.py
```

This generates `embeddings.npz` — the face database used during attendance.

---

### Step 5 — Train the Churn Prediction Model

```bash
cd ..\model

# (Activate or create a venv if needed)
pip install fastapi uvicorn scikit-learn pandas numpy joblib

# Train the model
python train_churn_model.py
```

This creates `model/artifacts/churn_model.joblib`. The FastAPI service will not start without this file.

---

### Step 6 — Configure AWS Credentials (Emotion Analysis)

Set your AWS credentials so the Rekognition service can be called:

**Option A — Environment variables (recommended):**

```powershell
$env:AWS_ACCESS_KEY_ID     = "your-access-key"
$env:AWS_SECRET_ACCESS_KEY = "your-secret-key"
$env:AWS_DEFAULT_REGION    = "ap-south-1"
```

**Option B — AWS credentials file:**

Create `C:\Users\<you>\.aws\credentials`:

```ini
[default]
aws_access_key_id = your-access-key
aws_secret_access_key = your-secret-key
region = ap-south-1
```

> ⚠️ **Never commit real AWS credentials to Git.** The `.gitignore` excludes `.env` files, but double-check before pushing.

---

## ▶️ Running the Application

### Option A — One-Click Start (Recommended on Windows)

Open **any PowerShell window** (no need to navigate to the folder) and run:

```powershell
powershell -ExecutionPolicy Bypass -File "D:\Data managment\start_all.ps1"
```

Or if your PowerShell is already inside the project folder:

```powershell
.\start_all.ps1
```

This script does the following in order:

| Step | Action | URL |
|------|--------|-----|
| 1 | Build frontend assets (`npm run build`) | — |
| 2 | Start Laravel backend (`php artisan serve`) | http://localhost:8000 |
| 3 | Start Vite dev server (`npm run dev`) | http://localhost:5173 |
| 4 | Start Churn API (`uvicorn churn_api:app`) | http://localhost:8001 |
| 5 | Run face enrollment (`step5_enroll_build_db.py`) | — |
| 6 | Start face attendance + photo capture (`step8`) | Camera window |

**Then open your browser at:** 👉 **http://localhost:5173**

---

### Option B — Start Services Manually

If you prefer to start each service individually:

**Terminal 1 — Laravel Backend:**
```bash
cd HR_and_Task_Management_Backend
php artisan serve
```

**Terminal 2 — Vite Frontend:**
```bash
cd HR_and_Task_Management_Backend
npm run dev
```

**Terminal 3 — Churn Prediction API:**
```bash
cd model
uvicorn churn_api:app --host 0.0.0.0 --port 8001 --reload
```

**Terminal 4 — Face Attendance:**
```bash
cd faceDetection
.\venv\Scripts\activate
python step8_attendance_with_photos.py
```

> Press **`q`** in the camera window to stop face attendance.

---

## ⏹ Stopping the Application

Open **any PowerShell window** and run:

```powershell
powershell -ExecutionPolicy Bypass -File "D:\Data managment\stop_all.ps1"
```

Or from inside the project folder:

```powershell
.\stop_all.ps1
```

This forcefully stops all PHP, Node/Vite, Python (uvicorn + attendance) processes.

---

## 🌐 Service URLs

| Service | URL | Description |
|---------|-----|-------------|
| Main Dashboard | http://localhost:5173 | React frontend (Vite) |
| Laravel API | http://localhost:8000 | PHP backend |
| Churn API Docs | http://localhost:8001/docs | FastAPI Swagger UI |
| Churn API Health | http://localhost:8001/health | Check if model is loaded |

---

## 👤 Face Enrollment Guide

To enroll a new employee:

1. Create a folder with their name inside `faceDetection/faces_db/`:
   ```
   faceDetection/
   └── faces_db/
       └── JohnDoe/
           ├── photo1.jpg
           ├── photo2.jpg
           └── photo3.jpg
   ```

2. Use **clear, well-lit photos** where:
   - The face is clearly visible
   - Multiple angles are included (front, slight left, slight right)
   - At least 3–5 images per person

3. Re-run enrollment:
   ```bash
   cd faceDetection
   .\venv\Scripts\activate
   python step5_enroll_build_db.py
   ```

4. Restart `step8_attendance_with_photos.py` to pick up the new database.

---

## 🧠 Churn Model Training

To retrain the churn model with new data:

1. Place your dataset at `model/employee_churn_dataset.csv`  
   (or `employee_churn_dataset.csv` at the root — the model folder also has a copy)

2. Run:
   ```bash
   cd model
   python train_churn_model.py
   ```

3. The trained model is saved to `model/artifacts/churn_model.joblib`

4. Restart the Churn API to load the new model:
   ```bash
   uvicorn churn_api:app --host 0.0.0.0 --port 8001 --reload
   ```

The model uses **21 features** including age, tenure, salary, performance rating, satisfaction level, overtime hours, and more.

---

## 🔑 Environment Variables

### Laravel `.env` (HR_and_Task_Management_Backend/.env)

```env
APP_NAME="WarehouseHRM"
APP_ENV=local
APP_KEY=           # generated by php artisan key:generate
APP_DEBUG=true
APP_URL=http://localhost

DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=warehousehrm
DB_USERNAME=root
DB_PASSWORD=

CHURN_API_URL=http://localhost:8001
```

### Face Detection paths (`start_all.ps1`)

If your project is not in `D:\Data managment`, update these paths at the top of `start_all.ps1`:

```powershell
$BackendDir  = "D:\Data managment\HR_and_Task_Management_Backend"
$ModelDir    = "D:\Data managment\model"
$FaceDir     = "D:\Data managment\faceDetection"
$PythonBin   = "D:\Data managment\faceDetection\venv\Scripts\python.exe"
```

---

## 📄 License

This project is proprietary software. All rights reserved.
