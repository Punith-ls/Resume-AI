from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, Header
from jose import jwt, JWTError, ExpiredSignatureError
from bson import ObjectId
from .database import db
from .utils import SECRET_KEY, ALGORITHM
from .config import settings
from .models_manager import model_manager
from .ai_pipeline import (
    extract_text_from_file,
    extract_skills,
    extract_education,
    extract_experience,
    analyze_sentiment,
    calculate_score,
)
import os
import uuid
import datetime
import re
import shutil

router = APIRouter()
UPLOAD_DIR = str(settings.UPLOAD_DIR)
os.makedirs(UPLOAD_DIR, exist_ok=True)


def get_current_user(authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid authorization header")

    token = authorization.split(" ")[1]
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        role = payload.get("role")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        if role and role != "candidate":
            raise HTTPException(status_code=401, detail="Candidate token required")
        return user_id
    except ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")


def safe_filename(name: str) -> str:
    base = os.path.basename(name or "resume")
    cleaned = re.sub(r"[^A-Za-z0-9._-]", "_", base)
    return cleaned or "resume"


def extract_age(text: str) -> str:
    match = re.search(r"(\b\d{2}\b)\s*(years old|yrs|years|age)?", text, re.IGNORECASE)
    if match:
        return match.group(1)
    return "N/A"


def extract_qualification(text: str) -> str:
    qualifications = [
        "B.Tech", "B.E", "M.Tech", "MCA", "MBA", "PhD",
        "Bachelor", "Master", "Diploma", "High School",
    ]
    for q in qualifications:
        if q.lower() in text.lower():
            return q
    return "Unknown"


def build_resume_analysis(candidate: dict) -> dict:
    resume = candidate.get("resume") or {}
    text = resume.get("text_content", "")
    skills = resume.get("skills") or extract_skills(text)
    education = resume.get("education") or extract_education(text)
    experience = resume.get("experience") or extract_experience(text)
    sentiment = resume.get("sentiment_score")
    if sentiment is None:
        sentiment = analyze_sentiment(text)
    score, rating = calculate_score(skills, sentiment)
    return {
        "filename": resume.get("filename", ""),
        "text_content": text,
        "uploaded_at": resume.get("uploaded_at", ""),
        "file_size": resume.get("file_size", 0),
        "analysis_status": resume.get("analysis_status", "uploaded"),
        "qualification": resume.get("qualification", "Unknown"),
        "age": resume.get("age", "N/A"),
        "skills": skills,
        "skills_count": len(skills),
        "education": education,
        "experience": experience,
        "experience_count": len(experience),
        "score": score,
        "rating": rating,
        "sentiment_score": sentiment,
        "logistic_regression_results": resume.get("logistic_regression_results"),
        "zero_shot_results": resume.get("zero_shot_results"),
    }


JOB_CATEGORIES = [
    "Software Engineer",
    "Data Scientist",
    "Machine Learning Engineer",
    "Frontend Developer",
    "Backend Developer",
    "Full Stack Developer",
    "DevOps Engineer",
    "Project Manager",
    "QA Engineer",
    "Business Analyst",
]


def zero_shot_classify(text: str) -> dict:
    text_lower = text.lower()
    keywords = {
        "Software Engineer": ["software", "engineer", "programming", "developer", "java", "python", "c++"],
        "Data Scientist": ["data science", "pandas", "statistics", "machine learning", "python", "sql"],
        "Machine Learning Engineer": ["machine learning", "deep learning", "tensorflow", "pytorch", "nlp"],
        "Frontend Developer": ["react", "angular", "vue", "html", "css", "javascript", "ui"],
        "Backend Developer": ["api", "django", "flask", "fastapi", "node", "database", "backend"],
        "Full Stack Developer": ["full stack", "react", "node", "frontend", "backend"],
        "DevOps Engineer": ["docker", "kubernetes", "aws", "ci/cd", "jenkins", "linux"],
        "Project Manager": ["project management", "agile", "scrum", "stakeholder", "planning"],
        "QA Engineer": ["testing", "qa", "selenium", "automation", "quality"],
        "Business Analyst": ["business analyst", "requirements", "stakeholder", "process"],
    }
    scores = {}
    for category, words in keywords.items():
        hits = sum(1 for word in words if word in text_lower)
        scores[category] = round(hits / max(len(words), 1), 3)
    ranked = sorted(scores.items(), key=lambda item: item[1], reverse=True)
    top = ranked[0] if ranked else ("Unknown", 0)
    return {
        "predicted_role": top[0],
        "confidence": top[1],
        "scores": [{"label": label, "score": score} for label, score in ranked[:5]],
        "model_type": "keyword_zero_shot",
    }


@router.post("/upload-resume")
async def upload_resume(file: UploadFile = File(...), current_user: str = Depends(get_current_user)):
    allowed_extensions = [".pdf", ".doc", ".docx", ".txt"]
    file_extension = os.path.splitext((file.filename or "").lower())[1]
    if file_extension not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type. Only allowed: {', '.join(allowed_extensions)}",
        )

    candidate = await db.candidates.find_one({"_id": ObjectId(current_user)})
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")

    user_dir = os.path.join(UPLOAD_DIR, "candidates", str(current_user))
    os.makedirs(user_dir, exist_ok=True)
    stored_name = f"{uuid.uuid4().hex}_{safe_filename(file.filename)}"
    path = os.path.join(user_dir, stored_name)

    with open(path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    try:
        text_content = extract_text_from_file(path)
    except Exception as e:
        if os.path.exists(path):
            os.remove(path)
        raise HTTPException(status_code=400, detail=f"Failed to extract text from resume: {str(e)}")

    if not is_valid_resume_content(text_content):
        if os.path.exists(path):
            os.remove(path)
        raise HTTPException(
            status_code=400,
            detail="Invalid resume content. Must contain personal info, skills, and experience.",
        )

    skills = extract_skills(text_content)
    education = extract_education(text_content)
    experience = extract_experience(text_content)
    sentiment = analyze_sentiment(text_content)
    score, rating = calculate_score(skills, sentiment)

    resume_document = {
        "filename": file.filename,
        "original_filename": file.filename,
        "text_content": text_content,
        "file_path": path,
        "uploaded_at": datetime.datetime.utcnow().isoformat(),
        "file_size": os.path.getsize(path),
        "analysis_status": "analyzed",
        "qualification": extract_qualification(text_content),
        "age": extract_age(text_content),
        "skills": skills,
        "education": education,
        "experience": experience,
        "sentiment_score": sentiment,
        "score": score,
        "rating": rating,
        "logistic_regression_results": None,
        "zero_shot_results": None,
    }

    await db.candidates.update_one(
        {"_id": ObjectId(current_user)},
        {"$set": {"resume": resume_document}},
    )

    return {
        "msg": "Resume uploaded successfully",
        "filename": file.filename,
        "text_length": len(text_content),
        "analysis_status": "analyzed",
        "qualification": resume_document["qualification"],
        "age": resume_document["age"],
        "score": score,
        "rating": rating,
        "skills_count": len(skills),
    }


@router.get("/my-resume")
async def get_my_resume(current_user: str = Depends(get_current_user)):
    candidate = await db.candidates.find_one({"_id": ObjectId(current_user)})
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
    if not candidate.get("resume"):
        raise HTTPException(status_code=404, detail="No resume uploaded")
    return {
        "name": candidate["name"],
        "email": candidate["email"],
        "resume_analysis": build_resume_analysis(candidate),
    }


@router.post("/analyze-logistic-regression")
async def analyze_logistic_regression(current_user: str = Depends(get_current_user)):
    candidate = await db.candidates.find_one({"_id": ObjectId(current_user)})
    if not candidate or not candidate.get("resume"):
        raise HTTPException(status_code=404, detail="No resume uploaded")

    from .recruiter import calculate_english_score, qualification_to_bool, age_to_bool

    resume = candidate["resume"]
    text = resume.get("text_content", "")
    skills = resume.get("skills") or extract_skills(text)
    education = resume.get("education") or extract_education(text)
    experience = resume.get("experience") or extract_experience(text)
    english_score = calculate_english_score(text)
    qualification_num = qualification_to_bool(resume.get("qualification", "Unknown"))
    age_status_num = age_to_bool(str(resume.get("age", "N/A")))
    prediction = model_manager.predict_logistic_regression(english_score, qualification_num, age_status_num)

    await db.candidates.update_one(
        {"_id": ObjectId(current_user)},
        {"$set": {"resume.logistic_regression_results": prediction, "resume.analysis_status": "analyzed"}},
    )
    return {
        "msg": "Logistic regression analysis complete",
        "result": prediction,
        "results": {
            "score": round(float(prediction.get("confidence_score", 0.5)) * 10, 2),
            "rating": prediction.get("rating", "Average"),
            "confidence_score": prediction.get("confidence_score", 0.5),
            "predicted_success_probability": prediction.get("confidence_score", 0.5),
            "skills_count": len(skills),
            "education_count": len(education),
            "experience_count": len(experience),
            "skills": skills,
            "model_type": prediction.get("model_type"),
        },
    }


@router.post("/analyze-zero-shot")
async def analyze_zero_shot(current_user: str = Depends(get_current_user)):
    candidate = await db.candidates.find_one({"_id": ObjectId(current_user)})
    if not candidate or not candidate.get("resume"):
        raise HTTPException(status_code=404, detail="No resume uploaded")

    resume = candidate["resume"]
    text = resume.get("text_content", "")
    skills = resume.get("skills") or extract_skills(text)
    education = resume.get("education") or extract_education(text)
    experience = resume.get("experience") or extract_experience(text)
    result = zero_shot_classify(text)
    await db.candidates.update_one(
        {"_id": ObjectId(current_user)},
        {"$set": {"resume.zero_shot_results": result, "resume.analysis_status": "analyzed"}},
    )
    labels = [item["label"] for item in result["scores"]]
    scores = [item["score"] for item in result["scores"]]
    return {
        "msg": "Role classification complete",
        "result": result,
        "results": {
            "score": round(float(result.get("confidence", 0)) * 10, 2),
            "rating": result.get("predicted_role"),
            "best_match": result.get("predicted_role"),
            "confidence_score": result.get("confidence", 0),
            "skills_count": len(skills),
            "education_count": len(education),
            "experience_count": len(experience),
            "skills": skills,
            "classification_labels": labels,
            "classification_scores": scores,
        },
    }


def is_valid_resume_content(text_content: str) -> bool:
    if not text_content or len(text_content.strip()) < 50:
        return False
    text_lower = text_content.lower()
    resume_keywords = [
        "experience", "education", "skills", "work", "job", "position",
        "university", "college", "degree", "certificate", "project",
        "responsibilities", "achievements", "objective", "summary",
        "professional", "career", "employment", "cv", "resume",
    ]
    keyword_count = sum(1 for kw in resume_keywords if kw in text_lower)
    if keyword_count < 3:
        return False
    personal_indicators = ["email", "phone", "address", "contact", "@", "years", "experience"]
    if sum(1 for pi in personal_indicators if pi in text_lower) < 1:
        return False
    skill_indicators = ["programming", "software", "technical", "language", "tool", "technology", "skill"]
    return sum(1 for si in skill_indicators if si in text_lower) > 0 or keyword_count >= 5
