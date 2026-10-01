# ResumeAI

ResumeAI is a full-stack recruitment project. Candidates upload resumes. Recruiters screen those resumes with trained machine learning models, estimate sentiment, shortlist people, export CSV, and match candidates to job posts.

## What the project does

1. **Candidate signup / login** with JWT authentication.
2. **Resume upload** for PDF, DOCX, DOC, and TXT. Text is extracted from digital PDFs. If a PDF has almost no text (scanned page), optional OCR is used when Tesseract is installed.
3. **Resume parsing** extracts skills, education, experience, age, and qualification using keyword rules and optional spaCy.
4. **Logistic regression model** rates a resume as Worst / Average / Good.
5. **Text classifier** (saved as `llm_trained.pkl`) rates resume text the same way. This is a scikit-learn pipeline, not a generative LLM.
6. **Sentiment models** label resume tone as Weak / Intermediate / Strong.
7. **Zero-shot style role matching** suggests the closest job family from the resume text.
8. **Job posting** scores candidates against required skills and returns the best matches.
9. **Shortlisting and CSV export** for recruiter reports.

## Project structure

```
Resume_ai_new_2/
├── README.md                 ← this file
├── backend/
│   ├── app/                  ← FastAPI application
│   ├── models/               ← trained .pkl files
│   ├── data/                 ← local JSON database (created at runtime)
│   ├── uploads/              ← stored resume files
│   ├── requirements.txt
│   └── .env.example
└── frontend/                 ← React + Vite UI
```

## Requirements

- Python 3.9+
- Node.js 18+
- Windows, macOS, or Linux

MongoDB is **optional**. By default the backend stores data in JSON files under `backend/data/`, so the project runs without Atlas or a local Mongo daemon.

## How to run

Open two terminals.

### 1. Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows
pip install -r requirements.txt
copy .env.example .env          # Windows; already created in this repo
python -m uvicorn app.main:app --host 127.0.0.1 --port 3000 --reload
```

Optional extras:

```bash
python -m spacy download en_core_web_sm
```

Backend URL: http://127.0.0.1:3000  
API docs: http://127.0.0.1:3000/docs  
Health check: http://127.0.0.1:3000/health

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend URL: http://localhost:5173

## First-time demo

1. Open http://localhost:5173
2. Create a **candidate** account at Sign up.
3. Login as candidate and upload a PDF/DOCX/TXT resume.
4. Click **Analyze using Logistic Regression** and **Analyze using Zero-shot**.
5. Create a **recruiter** account at Recruiter signup.
6. Login as recruiter.
7. Click **Load Resumes** or **Upload PDF Resumes**.
8. Run logistic, text-classifier, and sentiment analysis.
9. Shortlist the top N candidates and export CSV.
10. Click **Post a Job**, add required skills, and view matching candidates.

## Configuration

`backend/.env`

| Variable | Meaning | Default |
|---|---|---|
| `USE_FILE_DB` | `true` = JSON files, `false` = MongoDB | `true` |
| `MONGO_URL` | Used only when `USE_FILE_DB=false` | `mongodb://127.0.0.1:27017` |
| `SECRET_KEY` | JWT signing key | change this before sharing |
| `CORS_ORIGINS` | Allowed frontend origins | Vite localhost ports |
| `PORT` | Backend port | `3000` |

`frontend/.env`

```
VITE_API_URL=http://127.0.0.1:3000
```

To use MongoDB Atlas or local Mongo instead of JSON files:

```
USE_FILE_DB=false
MONGO_URL=mongodb+srv://USER:PASSWORD@cluster.mongodb.net
```

Never commit real passwords. Keep them only in `.env`.

## Machine learning models

Files in `backend/models/`:

| File | Used for |
|---|---|
| `logistic_regression.pkl` | Numeric features: English score, qualification, age |
| `llm_trained.pkl` | Text classifier on full resume text |
| `logistic_trained_sentiment.pkl` | Sentiment from a numeric score |
| `llm_sentiment_trained.pkl` | Sentiment from resume text |

If a pickle file fails to load, the API still runs and returns a safe default rating so the UI does not crash.

OCR is optional. Install [Tesseract](https://github.com/tesseract-ocr/tesseract) plus Poppler if you need scanned-PDF support.

## Main API endpoints

| Method | Path | Who |
|---|---|---|
| POST | `/auth/signup` | Candidate register |
| POST | `/auth/login` | Candidate login |
| POST | `/candidate/upload-resume` | Upload resume |
| GET | `/candidate/my-resume` | View parsed resume |
| POST | `/candidate/analyze-logistic-regression` | Candidate ML rating |
| POST | `/candidate/analyze-zero-shot` | Role classification |
| POST | `/recruiter/signup` | Recruiter register |
| POST | `/recruiter/login` | Recruiter login |
| POST | `/recruiter/post-job` | Post job + match candidates |
| GET | `/recruiter/candidates` | Ranked candidate list |
| POST | `/recruiter/load-resumes` | Load candidate resumes |
| POST | `/recruiter/analyze-resumes-logistic` | Batch logistic analysis |
| POST | `/recruiter/analyze-resumes-llm` | Batch text-classifier analysis |
| POST | `/recruiter/analyze-sentiment-logistic` | Batch sentiment |
| POST | `/recruiter/save-shortlisted-logistic` | Save shortlist |
| GET | `/recruiter/export-shortlisted-csv` | Download CSV |

## Architecture

- **Frontend:** React 19, Vite 7, React Router, Axios, JWT in `localStorage`.
- **Backend:** FastAPI, bcrypt passwords, Jose JWT.
- **Storage:** JSON file database by default, or MongoDB.
- **NLP:** pdfplumber / python-docx, optional spaCy and Hugging Face DistilBERT.

## Notes for the report / viva

- This is a **screening assistant**, not an ATS replacement.
- The “LLM” buttons run a **trained scikit-learn text classifier**, not ChatGPT.
- Job matching is skill and keyword overlap scored out of 10.
- Change `SECRET_KEY` before putting this on a public server.
