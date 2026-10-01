from fastapi import APIRouter, HTTPException, Depends, Header, UploadFile, File
from pydantic import BaseModel
from jose import jwt, JWTError, ExpiredSignatureError
from bson import ObjectId
from datetime import datetime
from fastapi.responses import FileResponse, StreamingResponse
import os
import re
import csv
import io
from typing import List
from .database import db
from .utils import (
    create_access_token,
    hash_password,
    verify_password,
    SECRET_KEY,
    ALGORITHM,
)
from .models_manager import model_manager
from .ai_pipeline import extract_text_from_file, analyze_sentiment as ai_analyze_sentiment, extract_skills
from .config import settings
import logging
import uuid

logger = logging.getLogger(__name__)

router = APIRouter()


def calculate_english_score(text: str) -> float:
    """Calculate English proficiency score (0-100) based on text quality"""
    if not text:
        return 50.0
    
    score = 50.0  # Base score
    
    # Check for grammar indicators
    sentences = text.split('.')
    avg_sentence_length = sum(len(s.split()) for s in sentences) / max(len(sentences), 1)
    
    # Proper sentence structure (between 10-25 words per sentence is good)
    if 10 <= avg_sentence_length <= 25:
        score += 10
    
    # Check for proper capitalization
    capitalized_sentences = sum(1 for s in sentences if s.strip() and s.strip()[0].isupper())
    if len(sentences) > 0:
        capitalization_ratio = capitalized_sentences / len(sentences)
        score += capitalization_ratio * 15
    
    # Check for professional vocabulary
    professional_words = ["experience", "achieved", "developed", "implemented", "managed", "led", "designed", "analyzed", "optimized", "collaborated"]
    professional_count = sum(1 for word in professional_words if word.lower() in text.lower())
    score += min(professional_count * 2, 15)
    
    # Check for spelling/error indicators (simple heuristic)
    common_errors = ["teh", "recieve", "seperate", "definately"]
    error_count = sum(1 for error in common_errors if error in text.lower())
    score -= error_count * 5
    
    # Check text length (adequate detail)
    word_count = len(text.split())
    if 200 <= word_count <= 2000:
        score += 10
    
    return max(0.0, min(100.0, score))


def qualification_to_bool(qualification: str) -> bool:
    """Convert qualification string to boolean (True for higher education)"""
    if not qualification or qualification.lower() in ["unknown", "n/a", "na"]:
        return False
    
    high_qualifications = ["btech", "b.tech", "b.e", "mtech", "m.tech", "m.e", "mca", "mba", "phd", "master", "bachelor"]
    return any(q in qualification.lower() for q in high_qualifications)


def age_to_bool(age: str) -> bool:
    """Convert age string to boolean (True for age >= 25)"""
    if not age or age.lower() in ["n/a", "na", "unknown"]:
        return False
    
    try:
        age_num = int(re.search(r'\d+', age).group() if re.search(r'\d+', age) else "0")
        return age_num >= 25
    except:
        return False


def analyze_sentiment_numeric(text: str) -> float:
    """Analyze sentiment and return numeric score in range -1 to +1"""
    if not text:
        return 0.0
    
    # Use the AI pipeline sentiment analyzer (returns 0-1), convert to -1 to +1
    sentiment_01 = ai_analyze_sentiment(text)
    sentiment_range = (sentiment_01 * 2) - 1  # Convert 0-1 to -1 to +1
    
    return max(-1.0, min(1.0, sentiment_range))


class RecruiterLoginRequest(BaseModel):
    email: str
    password: str


class RecruiterSignupRequest(BaseModel):
    name: str
    email: str
    password: str
    company: str
    company_id: str  # Unique company identifier


class JobPostingRequest(BaseModel):
    title: str
    description: str
    experience: str
    education: str
    skills: str
    location: str
    salary: str = ""


def get_current_recruiter(authorization: str = Header(None)):
    if not authorization:
        logger.warning("Missing authorization header")
        raise HTTPException(401, "Missing authorization header")
    
    if not authorization.startswith("Bearer "):
        logger.warning(f"Invalid authorization header format: {authorization[:20]}...")
        raise HTTPException(401, "Invalid authorization header format. Expected 'Bearer <token>'")

    try:
        token = authorization.split(" ")[1]
    except IndexError:
        logger.warning("Token not found in authorization header")
        raise HTTPException(401, "Token not found in authorization header")
    
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        recruiter_id = payload.get("sub")
        role = payload.get("role")
        
        if recruiter_id is None:
            logger.warning("Token missing 'sub' field")
            raise HTTPException(401, "Invalid token: missing recruiter ID")
        
        if role != "recruiter":
            logger.warning(f"Invalid role in token: {role}, expected 'recruiter'")
            raise HTTPException(401, f"Invalid token: role is '{role}', expected 'recruiter'. Please login as recruiter.")
        
        logger.debug(f"✅ Authenticated recruiter: {recruiter_id}")
        return recruiter_id
    except ExpiredSignatureError:
        logger.warning("Token expired")
        raise HTTPException(401, "Token expired. Please login again.")
    except JWTError as e:
        logger.warning(f"JWT decode error: {str(e)}")
        raise HTTPException(401, f"Invalid token: {str(e)}")


def result_filename(result: dict) -> str:
    return (
        result.get("Resume File")
        or result.get("Filename")
        or result.get("resume_file")
        or result.get("filename")
        or ""
    )


def result_label(result: dict) -> str:
    return result.get("Predicted Label") or result.get("ML_Label") or "Average"


def rating_rank(label: str) -> int:
    rating = str(label).split(" - ")[0].strip()
    return {"Good": 2, "Average": 1, "Worst": 0}.get(rating, 1)


async def find_matching_candidates(job: dict):
    """Score candidate resumes against a job's required skills and description."""
    required = [skill.strip().lower() for skill in (job.get("required_skills") or []) if skill]
    job_text = " ".join([
        job.get("title", ""),
        job.get("description", ""),
        job.get("education", ""),
        job.get("experience", ""),
        " ".join(required),
    ]).lower()

    candidates = await db.candidates.find({"resume": {"$ne": None}}).to_list(None)
    scored = []
    for candidate in candidates:
        resume = candidate.get("resume") or {}
        text = (resume.get("text_content") or "").lower()
        skills = [str(s).lower() for s in (resume.get("skills") or extract_skills(text))]
        if required:
            hits = sum(1 for skill in required if skill in text or any(skill in s for s in skills))
            skill_score = hits / max(len(required), 1)
        else:
            skill_score = 0.3
        keyword_hits = 0
        for token in set(job_text.split()):
            if len(token) > 3 and token in text:
                keyword_hits += 1
        keyword_score = min(keyword_hits / 12, 1.0)
        match_score = round((skill_score * 7) + (keyword_score * 3), 2)
        if match_score <= 0:
            continue
        scored.append({
            **candidate,
            "match_score": match_score,
        })
    scored.sort(key=lambda item: item["match_score"], reverse=True)
    return scored


@router.post("/signup")
async def recruiter_signup(request: RecruiterSignupRequest):
    if await db.recruiters.find_one({"email": request.email}):
        raise HTTPException(400, "Email already registered")

    if await db.recruiters.find_one({"company_id": request.company_id}):
        raise HTTPException(400, "Company ID already exists")

    recruiter = {
        "name": request.name,
        "email": request.email,
        "password_hash": hash_password(request.password),
        "company": request.company,
        "company_id": request.company_id,
        "posted_jobs": [],
        "created_at": datetime.utcnow().isoformat(),
    }
    await db.recruiters.insert_one(recruiter)
    return {"msg": "Recruiter registration successful"}


@router.post("/login")
async def recruiter_login(request: RecruiterLoginRequest):
    logger.info(f"Recruiter login attempt for email: {request.email}")
    recruiter = await db.recruiters.find_one({"email": request.email})
    
    if not recruiter:
        logger.warning(f"Recruiter not found for email: {request.email}")
        raise HTTPException(401, "Invalid recruiter credentials")
    
    if not recruiter.get("password_hash"):
        logger.warning(f"Recruiter {request.email} has no password hash")
        raise HTTPException(401, "Invalid recruiter credentials")
    
    password_valid = verify_password(request.password, recruiter["password_hash"])
    logger.info(f"Password verification for {request.email}: {password_valid}")
    
    if not password_valid:
        logger.warning(f"Invalid password for email: {request.email}")
        raise HTTPException(401, "Invalid recruiter credentials")

    token = create_access_token({
        "sub": str(recruiter["_id"]),
        "role": "recruiter",
        "name": recruiter.get("name", ""),
        "email": recruiter.get("email", ""),
    })
    logger.info("Login successful for %s", request.email)
    return {
        "access_token": token,
        "token_type": "bearer",
        "role": "recruiter",
        "name": recruiter.get("name", ""),
    }


@router.post("/post-job")
async def post_job(request: JobPostingRequest, current_recruiter: str = Depends(get_current_recruiter)):
    recruiter = await db.recruiters.find_one({"_id": ObjectId(current_recruiter)})
    if not recruiter:
        raise HTTPException(404, "Recruiter not found")

    job = {
        "title": request.title,
        "description": request.description,
        "experience": request.experience,
        "education": request.education,
        "required_skills": [skill.strip().lower() for skill in request.skills.split(",")],
        "location": request.location,
        "salary": request.salary,
        "recruiter_id": ObjectId(current_recruiter),
        "recruiter_name": recruiter["name"],
        "company": recruiter.get("company", "Unknown Company"),
        "company_id": recruiter.get("company_id", "UNKNOWN001"),
        "posted_at": datetime.utcnow().isoformat(),
        "status": "active",
    }

    result = await db.jobs.insert_one(job)
    job_id = result.inserted_id

    await db.recruiters.update_one(
        {"_id": ObjectId(current_recruiter)},
        {"$push": {"posted_jobs": job_id}},
    )

    matching_candidates = await find_matching_candidates(job)

    top_candidates = []
    for candidate in matching_candidates[:3]:
        top_candidates.append({
            "_id": str(candidate["_id"]),
            "name": candidate["name"],
            "email": candidate["email"],
            "resume": candidate["resume"],
            "match_score": candidate["match_score"],
        })

    return {
        "msg": "Job posted successfully",
        "job_id": str(job_id),
        "matching_candidates": len(matching_candidates),
        "top_candidates": top_candidates,
    }



@router.get("/candidates")
async def get_candidates(topN: int = 6, current_recruiter: str = Depends(get_current_recruiter)):
    candidates = await db.candidates.find({"resume": {"$ne": None}}).to_list(None)
    ranked = sorted(candidates, key=lambda x: x.get("resume", {}).get("uploaded_at", ""), reverse=True)

    return [{
        "_id": str(c["_id"]),
        "name": c.get("name", ""),
        "email": c.get("email", ""),
        "resume": {
            "filename": (c.get("resume") or {}).get("filename", ""),
            "uploaded_at": (c.get("resume") or {}).get("uploaded_at", ""),
            "qualification": (c.get("resume") or {}).get("qualification", "Unknown"),
            "age": (c.get("resume") or {}).get("age", "N/A"),
            "skills": (c.get("resume") or {}).get("skills", []),
            "score": (c.get("resume") or {}).get("score"),
            "rating": (c.get("resume") or {}).get("rating"),
        },
    } for c in ranked[:topN]]


@router.get("/my-jobs")
async def get_my_jobs(current_recruiter: str = Depends(get_current_recruiter)):
    jobs = await db.jobs.find({"recruiter_id": ObjectId(current_recruiter)}).to_list(None)

    return [{
        "_id": str(j["_id"]),
        "title": j["title"],
        "description": j["description"],
        "experience": j["experience"],
        "education": j["education"],
        "required_skills": j["required_skills"],
        "location": j["location"],
        "salary": j["salary"],
        "recruiter_id": str(j["recruiter_id"]),
        "recruiter_name": j.get("recruiter_name", ""),
        "company": j.get("company", ""),
        "company_id": j.get("company_id", ""),
        "posted_at": j["posted_at"],
        "status": j["status"],
    } for j in jobs]


@router.get("/job-candidates/{job_id}")
async def get_job_candidates(job_id: str, current_recruiter: str = Depends(get_current_recruiter)):
    job = await db.jobs.find_one({"_id": ObjectId(job_id), "recruiter_id": ObjectId(current_recruiter)})
    if not job:
        raise HTTPException(404, "Job not found")

    matching = await find_matching_candidates(job)

    return {
        "job": {
            "_id": str(job["_id"]),
            "title": job["title"],
            "description": job["description"],
            "experience": job["experience"],
            "education": job["education"],
            "required_skills": job["required_skills"],
            "location": job["location"],
            "salary": job["salary"],
            "recruiter_id": str(job["recruiter_id"]),
            "recruiter_name": job.get("recruiter_name", ""),
            "company": job.get("company", ""),
            "company_id": job.get("company_id", ""),
            "posted_at": job["posted_at"],
            "status": job["status"],
        },
        "matching_candidates": [{
            "_id": str(c["_id"]),
            "name": c["name"],
            "email": c["email"],
            "resume": c["resume"],
            "match_score": c["match_score"],
        } for c in matching[:10]],
    }


@router.get("/candidate-resume/{candidate_id}")
async def get_candidate_resume(candidate_id: str, current_recruiter: str = Depends(get_current_recruiter)):
    candidate = await db.candidates.find_one({"_id": ObjectId(candidate_id)})
    if not candidate or not candidate.get("resume"):
        raise HTTPException(404, "Candidate or resume not found")

    resume = candidate["resume"]

    return {
        "_id": str(candidate["_id"]),
        "name": candidate["name"],
        "email": candidate["email"],
        "resume_details": {
            "filename": resume.get("filename", ""),
            "score": resume.get("score", 0),
            "rating": resume.get("rating", ""),
            "skills": resume.get("skills", []),
            "education": resume.get("education", []),
            "experience": resume.get("experience", []),
            "contact_info": resume.get("contact_info", {}),
            "sentiment_score": resume.get("sentiment_score", 0),
            "uploaded_at": resume.get("uploaded_at", ""),
            "file_size": resume.get("file_size", 0),
            "content": resume.get("text_content", ""),
        },
    }


@router.get("/download-resume/{candidate_id}")
async def download_resume(candidate_id: str, current_recruiter: str = Depends(get_current_recruiter)):
    candidate = await db.candidates.find_one({"_id": ObjectId(candidate_id)})
    if not candidate or not candidate.get("resume"):
        raise HTTPException(404, "Resume not found")

    resume = candidate["resume"]
    file_path = resume.get("file_path")  # stored when uploaded

    if not file_path or not os.path.exists(file_path):
        raise HTTPException(404, "Original resume file not found")

    return FileResponse(
        path=file_path,
        filename=resume.get("filename", "resume.pdf"),
        media_type="application/octet-stream",
    )


class LoadResumesRequest(BaseModel):
    job_keyword: str = "any"  # Job keyword for filtering (case insensitive)


class ShortlistRequest(BaseModel):
    num_candidates: int
    analysis_method: str  # "logistic_regression" or "llm"

class UploadFolderRequest(BaseModel):
    folder_path: str  # For reference, actual upload handled via multipart


@router.post("/load-resumes")
async def load_resumes(request: LoadResumesRequest, current_recruiter: str = Depends(get_current_recruiter)):
    """Load resumes and store in dataframe, filter by job keyword"""
    
    # Get all candidates with resumes
    candidates = await db.candidates.find({"resume": {"$ne": None}}).to_list(None)
    
    if not candidates:
        return {
            "msg": "No resumes found",
            "resume_count": 0,
            "resumes": []
        }
    
    # Filter by job keyword if not "any"
    filtered_candidates = []
    if request.job_keyword.lower() != "any":
        keyword = request.job_keyword.lower()
        for candidate in candidates:
            resume_text = candidate["resume"].get("text_content", "").lower()
            if keyword in resume_text:
                filtered_candidates.append(candidate)
    else:
        filtered_candidates = candidates
    
    # Store in recruiter's session (simulate dataframe)
    recruiter = await db.recruiters.find_one({"_id": ObjectId(current_recruiter)})
    if not recruiter:
        raise HTTPException(404, "Recruiter not found")
    
    # Update recruiter with loaded resumes
    resume_data = []
    for candidate in filtered_candidates:
        resume_data.append({
            "candidate_id": str(candidate["_id"]),
            "name": candidate["name"],
            "email": candidate["email"],
            "resume": candidate["resume"],
            "loaded_at": datetime.utcnow().isoformat()
        })
    
    await db.recruiters.update_one(
        {"_id": ObjectId(current_recruiter)},
        {"$set": {"loaded_resumes": resume_data, "resume_count": len(resume_data)}}
    )
    
    return {
        "msg": f"Loaded {len(resume_data)} resumes",
        "resume_count": len(resume_data),
        "job_keyword": request.job_keyword,
        "resumes": [{
            "candidate_id": r["candidate_id"],
            "name": r["name"],
            "email": r["email"],
            "filename": r["resume"].get("filename", ""),
            "uploaded_at": r["resume"].get("uploaded_at", "")
        } for r in resume_data]
    }
@router.post("/analyze-resumes-logistic")
async def analyze_resumes_logistic(current_recruiter: str = Depends(get_current_recruiter)):
    """Analyze loaded resumes using Logistic Regression model"""
    
    recruiter = await db.recruiters.find_one({"_id": ObjectId(current_recruiter)})
    if not recruiter:
        raise HTTPException(404, "Recruiter not found")
    
    loaded_resumes = recruiter.get("loaded_resumes", [])
    if not loaded_resumes:
        raise HTTPException(400, "No resumes loaded. Please load resumes first.")
    
    try:
        results = []
        
        for resume_data in loaded_resumes:
            candidate_id = resume_data["candidate_id"]
            resume = resume_data["resume"]
            text = resume.get("text_content", "")
            filename = resume.get("filename", f"{candidate_id}.pdf")
            qualification = resume.get("qualification", "Unknown")
            age = resume.get("age", "N/A")
            
            if not text:
                continue
            
            # Calculate features for logistic model
            english_score = calculate_english_score(text)
            qualification_num = qualification_to_bool(qualification)
            age_status_num = age_to_bool(age)
            
            # Get prediction from logistic model
            prediction_result = model_manager.predict_logistic_regression(
                english_score, qualification_num, age_status_num
            )
            ml_label = prediction_result["rating"]
            
            # Extract rating from model prediction (should be "Good", "Average", or "Worst")
            ml_label = str(prediction_result["rating"]).strip()
            
            # Safety check: if ml_label contains " - ", it might already have age/qual info
            # In that case, take only the first part (the rating)
            if " - " in ml_label:
                ml_label = ml_label.split(" - ")[0].strip()
            
            # Ensure ml_label is one of the expected values (Good/Average/Worst)
            # If it contains age or qualification keywords, extract just the rating
            valid_ratings = ["Good", "Average", "Worst"]
            if ml_label not in valid_ratings:
                # Try to find a valid rating in the string
                for rating in valid_ratings:
                    if rating in ml_label:
                        ml_label = rating
                        break
                # If still not found, default to first part before any " - "
                if ml_label not in valid_ratings:
                    ml_label = ml_label.split(" - ")[0].strip() if " - " in ml_label else ml_label.split()[0] if ml_label else "Average"
            
            # Format age and qualification status (exactly once)
            age_status = "Age OK" if age_status_num else "Age Not OK"
            qualification_status = "Qualified" if qualification_num else "Not Qualified"
            
            # Construct the predicted label exactly once: "Rating - Age Status - Qualification Status"
            # Example: "Good - Age OK - Qualified" or "Average - Age Not OK - Not Qualified"
            predicted_label = f"{ml_label} - {age_status} - {qualification_status}"
            
            # Debug logging
            logger.info(f"Label for {filename}: rating='{ml_label}', age='{age_status}', qual='{qualification_status}', final='{predicted_label}'")
            
            # Simplified result format matching the image
            results.append({
                "Resume File": filename,
                "Predicted Label": predicted_label
            })
        
        await db.recruiters.update_one(
            {"_id": ObjectId(current_recruiter)},
            {"$set": {"logistic_analysis_results": results}}
        )
        
        logger.info(f"✅ Logistic Regression analysis completed. {len(results)} resumes analyzed.")
        logger.info(f"Sample result: {results[0] if results else 'No results'}")
        
        return {
            "msg": f"✅ Classification completed. {len(results)} resumes analyzed.",
            "results": results
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error during logistic regression analysis: {str(e)}")
@router.post("/analyze-resumes-llm")
async def analyze_resumes_llm(current_recruiter: str = Depends(get_current_recruiter)):
    """Analyze loaded resumes using LLM model"""

    recruiter = await db.recruiters.find_one({"_id": ObjectId(current_recruiter)})
    if not recruiter:
        raise HTTPException(404, "Recruiter not found")

    loaded_resumes = recruiter.get("loaded_resumes", [])
    if not loaded_resumes:
        raise HTTPException(400, "No resumes loaded. Please load resumes first.")

    try:
        results = []
        
        for resume_data in loaded_resumes:
            candidate_id = resume_data["candidate_id"]
            resume = resume_data["resume"]
            text = resume.get("text_content", "")
            filename = resume.get("filename", f"{candidate_id}.pdf")
            qualification = resume.get("qualification", "Unknown")
            age = resume.get("age", "N/A")

            if not text:
                continue

            # LLM prediction
            prediction_result = model_manager.predict_llm(text)
            logger.info(f"DEBUG LLM prediction_result for {filename}: {prediction_result}")
            
            # Extract rating from model prediction (should be "Good", "Average", or "Worst")
            raw_rating = prediction_result.get("rating", "Average")
            logger.info(f"DEBUG raw_rating for {filename}: '{raw_rating}' (type: {type(raw_rating)})")
            
            ml_label = str(raw_rating).strip()
            
            # Safety check: if ml_label contains " - ", it might already have age/qual info
            # In that case, take only the first part (the rating)
            if " - " in ml_label:
                logger.warning(f"WARNING: ml_label contains ' - ', splitting: '{ml_label}'")
                ml_label = ml_label.split(" - ")[0].strip()
                logger.info(f"DEBUG after split: '{ml_label}'")
            
            # Ensure ml_label is one of the expected values (Good/Average/Worst)
            # If it contains age or qualification keywords, extract just the rating
            valid_ratings = ["Good", "Average", "Worst"]
            if ml_label not in valid_ratings:
                logger.warning(f"WARNING: ml_label '{ml_label}' not in valid_ratings, attempting to extract...")
                # Try to find a valid rating in the string
                for rating in valid_ratings:
                    if rating in ml_label:
                        ml_label = rating
                        logger.info(f"DEBUG found rating '{rating}' in ml_label")
                        break
                # If still not found, default to first part before any " - "
                if ml_label not in valid_ratings:
                    ml_label = ml_label.split(" - ")[0].strip() if " - " in ml_label else ml_label.split()[0] if ml_label else "Average"
                    logger.warning(f"WARNING: using extracted/default ml_label: '{ml_label}'")
            
            # Extract age and qualification status from resume data (ONCE)
            qualification_num = qualification_to_bool(qualification)
            age_status_num = age_to_bool(age)
            
            logger.info(f"DEBUG for {filename}: qualification='{qualification}' -> {qualification_num}, age='{age}' -> {age_status_num}")
            
            # Format age and qualification status (exactly once) - ensure they're clean single values
            age_status = "Age OK" if age_status_num else "Age Not OK"
            qualification_status = "Qualified" if qualification_num else "Not Qualified"
            
            # CRITICAL: Ensure ml_label, age_status, and qualification_status are all single values
            # Remove any " - " from these values to prevent duplication
            ml_label_final = str(ml_label).strip()
            if " - " in ml_label_final:
                ml_label_final = ml_label_final.split(" - ")[0].strip()
            # Ensure it's a valid rating
            if ml_label_final not in valid_ratings:
                for rating in valid_ratings:
                    if rating in ml_label_final:
                        ml_label_final = rating
                        break
                if ml_label_final not in valid_ratings:
                    ml_label_final = "Average"
            
            age_status_final = "Age OK" if age_status_num else "Age Not OK"
            qualification_status_final = "Qualified" if qualification_num else "Not Qualified"
            
            # CRITICAL: Construct the predicted label EXACTLY ONCE with clean values
            # Force clean values - strip any existing separators
            rating_clean = str(ml_label_final).strip()
            age_clean = str(age_status_final).strip()
            qual_clean = str(qualification_status_final).strip()
            
            # Remove any " - " from individual parts (shouldn't be there, but safety check)
            if " - " in rating_clean:
                rating_clean = rating_clean.split(" - ")[0].strip()
            if " - " in age_clean:
                age_clean = age_clean.split(" - ")[0].strip()
            if " - " in qual_clean:
                qual_clean = qual_clean.split(" - ")[0].strip()
            
            # Ensure rating is valid
            if rating_clean not in valid_ratings:
                rating_clean = "Average"
            
            # Ensure age is valid
            if age_clean not in ["Age OK", "Age Not OK"]:
                age_clean = "Age OK" if age_status_num else "Age Not OK"
            
            # Ensure qualification is valid
            if qual_clean not in ["Qualified", "Not Qualified"]:
                qual_clean = "Qualified" if qualification_num else "Not Qualified"
            
            # Construct label EXACTLY ONCE - no concatenation, no appending
            predicted_label = f"{rating_clean} - {age_clean} - {qual_clean}"
            
            # FINAL VALIDATION: Split and verify exactly 3 parts
            parts = predicted_label.split(" - ")
            logger.info(f"DEBUG after construction: predicted_label='{predicted_label}', parts={parts}, len={len(parts)}")
            
            if len(parts) != 3:
                logger.error(f"ERROR: Label has {len(parts)} parts instead of 3: {parts}")
                # FORCE exactly 3 parts by using ONLY the clean values we calculated
                # Recalculate from scratch to be absolutely sure
                rating_final = "Good" if "Good" in str(ml_label_final) else "Average" if "Average" in str(ml_label_final) else "Worst" if "Worst" in str(ml_label_final) else "Average"
                age_final = "Age OK" if age_status_num else "Age Not OK"
                qual_final = "Qualified" if qualification_num else "Not Qualified"
                
                # Reconstruct from scratch
                predicted_label = f"{rating_final} - {age_final} - {qual_final}"
                logger.error(f"ERROR: Reconstructed label: '{predicted_label}'")
            
            # ONE MORE CHECK: Verify the parts are correct
            final_check = predicted_label.split(" - ")
            if len(final_check) != 3:
                logger.critical(f"CRITICAL: Still wrong! Forcing exact values...")
                # Last resort: hardcode the exact values
                predicted_label = f"{rating_clean} - {age_clean} - {qual_clean}"
                logger.critical(f"CRITICAL: Final forced label: '{predicted_label}'")
            
            # Log the final result
            logger.info(f"LLM FINAL for {filename}: '{predicted_label}' (parts count: {len(predicted_label.split(' - '))})")
            
            # Simplified result format matching the image
            results.append({
                "Resume File": filename,
                "Predicted Label": predicted_label
            })

        # Verify all results before saving
        for i, result in enumerate(results):
            label = result.get("Predicted Label", "")
            parts = label.split(" - ")
            if len(parts) != 3:
                logger.error(f"ERROR: Result {i} has invalid label before save: '{label}' ({len(parts)} parts)")
                # Fix it
                filename = result.get("Resume File", "")
                # Find the resume data to recalculate
                for resume_data in loaded_resumes:
                    if resume_data.get("resume", {}).get("filename", "") == filename:
                        # Recalculate from scratch
                        qualification = resume_data.get("resume", {}).get("qualification", "Unknown")
                        age = resume_data.get("resume", {}).get("age", "N/A")
                        qualification_num = qualification_to_bool(qualification)
                        age_status_num = age_to_bool(age)
                        # Extract clean rating from the label
                        rating_clean = parts[0].strip() if parts else "Average"
                        if rating_clean not in ["Good", "Average", "Worst"]:
                            rating_clean = "Average"
                        age_clean = "Age OK" if age_status_num else "Age Not OK"
                        qual_clean = "Qualified" if qualification_num else "Not Qualified"
                        # Reconstruct
                        result["Predicted Label"] = f"{rating_clean} - {age_clean} - {qual_clean}"
                        logger.error(f"ERROR: Fixed result {i}: '{result['Predicted Label']}'")
                        break
        
        # Clear old results and save new ones
        await db.recruiters.update_one(
            {"_id": ObjectId(current_recruiter)},
            {"$set": {"llm_analysis_results": results}}
        )

        logger.info(f"✅ LLM analysis completed. {len(results)} resumes analyzed.")
        # Verify the stored results
        for i, result in enumerate(results[:3]):  # Check first 3
            label = result.get("Predicted Label", "")
            parts = label.split(" - ")
            logger.info(f"Stored result {i}: '{label}' (parts: {len(parts)})")
        logger.info(f"Sample result: {results[0] if results else 'No results'}")

        return {
            "msg": f"✅ LLM analysis completed. {len(results)} resumes analyzed.",
            "results": results
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error during LLM analysis: {str(e)}")


@router.post("/analyze-sentiment-logistic")
async def analyze_sentiment_logistic(current_recruiter: str = Depends(get_current_recruiter)):
    """Analyze sentiment using Logistic Sentiment model"""
    
    recruiter = await db.recruiters.find_one({"_id": ObjectId(current_recruiter)})
    if not recruiter:
        raise HTTPException(404, "Recruiter not found")
    
    loaded_resumes = recruiter.get("loaded_resumes", [])
    if not loaded_resumes:
        raise HTTPException(400, "No resumes loaded. Please load resumes first.")
    
    try:
        results = []
        
        for resume_data in loaded_resumes:
            candidate_id = resume_data["candidate_id"]
            resume = resume_data["resume"]
            text = resume.get("text_content", "")
            filename = resume.get("filename", f"{candidate_id}.pdf")
            name = resume_data.get("name", "N/A")
            
            if not text:
                continue
            
            # Calculate sentiment score (-1 to +1)
            sentiment_score = analyze_sentiment_numeric(text)
            
            # Get prediction from logistic sentiment model
            prediction_result = model_manager.predict_logistic_sentiment(sentiment_score)
            
            rating = prediction_result["rating"]
            confidence_percent = prediction_result["confidence_percent"]
            
            # Categorize based on confidence percentage: >80% = Strong, 60-80% = Intermediate, <60% = Weak
            if confidence_percent > 80:
                rating_category = "Strong"
                selected = "Selected"
            elif confidence_percent >= 60:
                rating_category = "Intermediate"
                selected = "Selected"
            else:
                rating_category = "Weak"
                selected = "Not Selected"
            
            results.append({
                "Filename": filename,
                "Name": name,
                "Sentiment_Score": round(sentiment_score, 3),
                "Rating": rating,
                "Confidence_Percent": round(confidence_percent, 2),
                "Rating_Category": rating_category,
                "Selected": selected
            })
        
        await db.recruiters.update_one(
            {"_id": ObjectId(current_recruiter)},
            {"$set": {"logistic_sentiment_results": results}}
        )
        
        return {
            "msg": f"✅ Sentiment analysis (Logistic) completed. {len(results)} resumes analyzed.",
            "results": results
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error during logistic sentiment analysis: {str(e)}")


@router.post("/analyze-sentiment-llm")
async def analyze_sentiment_llm(current_recruiter: str = Depends(get_current_recruiter)):
    """Analyze sentiment using LLM Sentiment model"""
    
    recruiter = await db.recruiters.find_one({"_id": ObjectId(current_recruiter)})
    if not recruiter:
        raise HTTPException(404, "Recruiter not found")
    
    loaded_resumes = recruiter.get("loaded_resumes", [])
    if not loaded_resumes:
        raise HTTPException(400, "No resumes loaded. Please load resumes first.")
    
    try:
        results = []
        
        for resume_data in loaded_resumes:
            candidate_id = resume_data["candidate_id"]
            resume = resume_data["resume"]
            text = resume.get("text_content", "")
            filename = resume.get("filename", f"{candidate_id}.pdf")
            name = resume_data.get("name", "N/A")
            
            if not text:
                continue
            
            # Get prediction from LLM sentiment model
            prediction_result = model_manager.predict_llm_sentiment(text)
            
            rating = prediction_result["rating"]
            confidence_percent = prediction_result["confidence_percent"]
            
            # Categorize based on confidence percentage: >80% = Strong, 60-80% = Intermediate, <60% = Weak
            if confidence_percent > 80:
                rating_category = "Strong"
                selected = "Selected"
            elif confidence_percent >= 60:
                rating_category = "Intermediate"
                selected = "Selected"
            else:
                rating_category = "Weak"
                selected = "Not Selected"
            
            results.append({
                "Filename": filename,
                "Name": name,
                "Rating": rating,
                "Confidence_Percent": round(confidence_percent, 2),
                "Rating_Category": rating_category,
                "Selected": selected
            })
        
        await db.recruiters.update_one(
            {"_id": ObjectId(current_recruiter)},
            {"$set": {"llm_sentiment_results": results}}
        )
        
        return {
            "msg": f"✅ Sentiment analysis (LLM) completed. {len(results)} resumes analyzed.",
            "results": results
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error during LLM sentiment analysis: {str(e)}")


@router.post("/upload-folder")
async def upload_folder(files: List[UploadFile] = File(...), current_recruiter: str = Depends(get_current_recruiter)):
    """Upload multiple PDF resume files from a folder - PDF files only. Clears previous uploads."""
    
    recruiter = await db.recruiters.find_one({"_id": ObjectId(current_recruiter)})
    if not recruiter:
        raise HTTPException(404, "Recruiter not found")
    
    # Clear previously loaded resumes
    await db.recruiters.update_one(
        {"_id": ObjectId(current_recruiter)},
        {"$set": {"loaded_resumes": []}}
    )
    
    UPLOAD_DIR = os.path.join(str(settings.UPLOAD_DIR), "recruiters", str(current_recruiter))
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    
    uploaded_files = []
    processed_resumes = []
    rejected_files = []
    
    # Resume keywords to validate that file is actually a resume
    resume_keywords = [
        "resume", "cv", "curriculum vitae", "experience", "education", 
        "skills", "qualification", "career", "objective", "summary",
        "work history", "employment", "professional", "background"
    ]
    
    def is_resume(text: str) -> bool:
        """Check if text content appears to be a resume"""
        if not text or len(text.strip()) < 100:
            return False
        text_lower = text.lower()
        # Check for at least 2 resume keywords
        keyword_count = sum(1 for keyword in resume_keywords if keyword in text_lower)
        return keyword_count >= 2
    
    try:
        for file in files:
            # Validate file type - ONLY PDF files
            file_extension = os.path.splitext(file.filename.lower())[1]
            
            if file_extension != '.pdf':
                rejected_files.append({
                    "filename": file.filename,
                    "reason": f"Only PDF files are allowed. File type: {file_extension}"
                })
                continue
            
            stored_name = f"{uuid.uuid4().hex}_{os.path.basename(file.filename)}"
            file_path = os.path.join(UPLOAD_DIR, stored_name)
            with open(file_path, "wb") as buffer:
                content = await file.read()
                buffer.write(content)
            
            # Extract text from PDF
            try:
                text_content = extract_text_from_file(file_path)
                
                # Validate that the file is actually a resume
                if not is_resume(text_content):
                    rejected_files.append({
                        "filename": file.filename,
                        "reason": "File does not appear to be a resume (missing resume keywords)"
                    })
                    if os.path.exists(file_path):
                        os.remove(file_path)
                    continue
                
                # Extract basic info
                from .candidate import extract_age, extract_qualification
                age = extract_age(text_content)
                qualification = extract_qualification(text_content)
                
                resume_doc = {
                    "filename": file.filename,
                    "text_content": text_content,
                    "qualification": qualification,
                    "age": age,
                    "uploaded_at": datetime.utcnow().isoformat(),
                    "file_size": os.path.getsize(file_path),
                    "file_type": "pdf",
                    "file_path": file_path,
                }
                
                processed_resumes.append({
                    "filename": file.filename,
                    "name": file.filename.replace(file_extension, "").replace("_", " ").title(),
                    "resume": resume_doc
                })
                
                uploaded_files.append(file.filename)
                
            except Exception as e:
                logger.error(f"Error processing {file.filename}: {str(e)}")
                rejected_files.append({
                    "filename": file.filename,
                    "reason": f"Error extracting text: {str(e)}"
                })
                if os.path.exists(file_path):
                    os.remove(file_path)
                continue
        
        # Store in recruiter's loaded resumes
        recruiter = await db.recruiters.find_one({"_id": ObjectId(current_recruiter)})
        if recruiter:
            existing_resumes = recruiter.get("loaded_resumes", [])
            # Add new resumes
            for resume_data in processed_resumes:
                existing_resumes.append({
                    "candidate_id": f"upload_{datetime.utcnow().timestamp()}",
                    "name": resume_data["name"],
                    "email": "uploaded@example.com",
                    "resume": resume_data["resume"],
                    "loaded_at": datetime.utcnow().isoformat()
                })
            
            await db.recruiters.update_one(
                {"_id": ObjectId(current_recruiter)},
                {"$set": {"loaded_resumes": existing_resumes, "resume_count": len(existing_resumes)}}
            )
        
        return {
            "msg": f"Successfully uploaded and processed {len(processed_resumes)} PDF resume(s)",
            "uploaded_files": uploaded_files,
            "resume_count": len(processed_resumes),
            "rejected_files": rejected_files,
            "rejected_count": len(rejected_files),
            "loaded_resumes": existing_resumes if recruiter else processed_resumes
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error uploading folder: {str(e)}")


@router.post("/save-shortlisted-logistic")
async def save_shortlisted_logistic(request: ShortlistRequest, current_recruiter: str = Depends(get_current_recruiter)):
    """Save shortlisted candidates from logistic regression analysis"""
    
    recruiter = await db.recruiters.find_one({"_id": ObjectId(current_recruiter)})
    if not recruiter:
        raise HTTPException(404, "Recruiter not found")
    
    analysis_results = recruiter.get("logistic_analysis_results", [])
    if not analysis_results:
        raise HTTPException(400, "No logistic regression analysis results found. Please analyze resumes first.")
    
    # Remove existing shortlisted candidates for this recruiter
    await db.shortlisted_candidates.delete_many({
        "recruiter_id": ObjectId(current_recruiter)
    })
    
    sorted_results = sorted(analysis_results, key=lambda x: rating_rank(result_label(x)), reverse=True)
    top_candidates = sorted_results[:request.num_candidates]
    
    shortlist_doc = {
        "recruiter_id": ObjectId(current_recruiter),
        "analysis_method": "logistic_regression",
        "num_candidates": request.num_candidates,
        "created_at": datetime.utcnow().isoformat(),
        "candidates": []
    }
    
    loaded_resumes = recruiter.get("loaded_resumes", [])
    resume_map = {r["resume"].get("filename", ""): r for r in loaded_resumes}
    
    for result in top_candidates:
        filename = result_filename(result)
        resume_data = resume_map.get(filename)
        ml_label = result_label(result)
        if resume_data:
            qualification = resume_data.get("resume", {}).get("qualification", result.get("Qualification", "N/A"))
            age = resume_data.get("resume", {}).get("age", result.get("Age", "N/A"))
            english_score = result.get("English_Score", 0)
            shortlist_doc["candidates"].append({
                "candidate_id": resume_data.get("candidate_id", ""),
                "name": resume_data.get("name", result.get("Name", "N/A")),
                "email": resume_data.get("email", "N/A"),
                "filename": filename,
                "qualification": qualification,
                "age": age,
                "english_level": f"{english_score:.1f}/100" if isinstance(english_score, (int, float)) else str(english_score),
                "ml_label": ml_label,
                "analysis": {"score": rating_rank(ml_label) * 4, "rating": str(ml_label).split(" - ")[0]},
            })
        else:
            shortlist_doc["candidates"].append({
                "candidate_id": "",
                "name": result.get("Name") or filename or "N/A",
                "email": "N/A",
                "filename": filename,
                "qualification": "N/A",
                "age": "N/A",
                "english_level": "N/A",
                "ml_label": ml_label,
                "analysis": {"score": rating_rank(ml_label) * 4, "rating": str(ml_label).split(" - ")[0]},
            })
    
    # Save to shortlisted candidates collection
    result = await db.shortlisted_candidates.insert_one(shortlist_doc)
    
    return {
        "msg": f"Successfully shortlisted {len(shortlist_doc['candidates'])} candidates using Logistic Regression",
        "shortlist_id": str(result.inserted_id),
        "candidates": shortlist_doc["candidates"]
    }


@router.post("/save-shortlisted-llm")
async def save_shortlisted_llm(request: ShortlistRequest, current_recruiter: str = Depends(get_current_recruiter)):
    """Save shortlisted candidates from LLM analysis"""
    
    recruiter = await db.recruiters.find_one({"_id": ObjectId(current_recruiter)})
    if not recruiter:
        raise HTTPException(404, "Recruiter not found")
    
    analysis_results = recruiter.get("llm_analysis_results", [])
    if not analysis_results:
        raise HTTPException(400, "No LLM analysis results found. Please analyze resumes first.")
    
    # Remove existing shortlisted candidates for this recruiter
    await db.shortlisted_candidates.delete_many({
        "recruiter_id": ObjectId(current_recruiter)
    })
    
    sorted_results = sorted(analysis_results, key=lambda x: rating_rank(result_label(x)), reverse=True)
    top_candidates = sorted_results[:request.num_candidates]
    
    shortlist_doc = {
        "recruiter_id": ObjectId(current_recruiter),
        "analysis_method": "llm",
        "num_candidates": request.num_candidates,
        "created_at": datetime.utcnow().isoformat(),
        "candidates": []
    }
    
    loaded_resumes = recruiter.get("loaded_resumes", [])
    resume_map = {r["resume"].get("filename", ""): r for r in loaded_resumes}
    
    for result in top_candidates:
        filename = result_filename(result)
        resume_data = resume_map.get(filename)
        ml_label = result_label(result)
        if resume_data:
            qualification = resume_data.get("resume", {}).get("qualification", result.get("Qualification", "N/A"))
            age = resume_data.get("resume", {}).get("age", result.get("Age", "N/A"))
            shortlist_doc["candidates"].append({
                "candidate_id": resume_data.get("candidate_id", ""),
                "name": resume_data.get("name", result.get("Name", "N/A")),
                "email": resume_data.get("email", "N/A"),
                "filename": filename,
                "qualification": qualification,
                "age": age,
                "ml_label": ml_label,
                "analysis": {"score": rating_rank(ml_label) * 4, "rating": str(ml_label).split(" - ")[0]},
            })
        else:
            shortlist_doc["candidates"].append({
                "candidate_id": "",
                "name": result.get("Name") or filename or "N/A",
                "email": "N/A",
                "filename": filename,
                "qualification": "N/A",
                "age": "N/A",
                "ml_label": ml_label,
                "analysis": {"score": rating_rank(ml_label) * 4, "rating": str(ml_label).split(" - ")[0]},
            })
    
    # Save to shortlisted candidates collection
    result = await db.shortlisted_candidates.insert_one(shortlist_doc)
    
    return {
        "msg": f"Successfully shortlisted {len(shortlist_doc['candidates'])} candidates using LLM",
        "shortlist_id": str(result.inserted_id),
        "candidates": shortlist_doc["candidates"]
    }


@router.get("/export-shortlisted-csv")
async def export_shortlisted_csv(current_recruiter: str = Depends(get_current_recruiter)):
    """Export all analyzed candidates to CSV file with complete information"""
    
    recruiter = await db.recruiters.find_one({"_id": ObjectId(current_recruiter)})
    if not recruiter:
        raise HTTPException(404, "Recruiter not found")
    
    # Get both analysis results
    logistic_results = recruiter.get("logistic_analysis_results", [])
    llm_results = recruiter.get("llm_analysis_results", [])
    
    # CRITICAL: Log the raw data from MongoDB
    logger.info(f"🔍 RAW DATA FROM MONGODB:")
    logger.info(f"   logistic_analysis_results type: {type(logistic_results)}")
    logger.info(f"   logistic_analysis_results length: {len(logistic_results) if isinstance(logistic_results, list) else 'NOT A LIST'}")
    logger.info(f"   llm_analysis_results type: {type(llm_results)}")
    logger.info(f"   llm_analysis_results length: {len(llm_results) if isinstance(llm_results, list) else 'NOT A LIST'}")
    
    # Ensure we have lists
    if not isinstance(logistic_results, list):
        logger.error(f"❌ ERROR: logistic_analysis_results is not a list! Type: {type(logistic_results)}, Value: {logistic_results}")
        logistic_results = []
    
    if not isinstance(llm_results, list):
        logger.error(f"❌ ERROR: llm_analysis_results is not a list! Type: {type(llm_results)}, Value: {llm_results}")
        llm_results = []
    
    # Log first few results to see structure
    if logistic_results:
        logger.info(f"   First logistic result: {logistic_results[0]}")
        logger.info(f"   First logistic result keys: {list(logistic_results[0].keys()) if isinstance(logistic_results[0], dict) else 'NOT A DICT'}")
    
    if llm_results:
        logger.info(f"   First LLM result: {llm_results[0]}")
        logger.info(f"   First LLM result keys: {list(llm_results[0].keys()) if isinstance(llm_results[0], dict) else 'NOT A DICT'}")
    
    if not logistic_results and not llm_results:
        raise HTTPException(400, "No analysis results found. Please analyze resumes first.")
    
    # Create a map of results by filename for both methods
    # New format uses "Resume File" instead of "Filename"
    # CRITICAL: Always use the original filename, don't modify it even if duplicates exist
    # We want all results, even if they have the same filename
    
    logger.info(f"🔍 Starting CSV export - Logistic results: {len(logistic_results)}, LLM results: {len(llm_results)}")
    
    logistic_map = {}
    for i, r in enumerate(logistic_results):
        # Try multiple possible key names
        filename = r.get("Resume File") or r.get("Filename") or r.get("resume_file") or r.get("filename") or ""
        
        # Convert to string and strip whitespace
        if filename:
            filename = str(filename).strip()
        
        if not filename:
            # Generate a unique filename if missing
            filename = f"result_{i+1}.pdf"
            logger.warning(f"⚠️ Logistic result {i} missing filename, using: {filename}")
        else:
            logger.info(f"✅ Logistic result {i}: filename='{filename}'")
        
        # Store the result - if duplicate, keep the last one (or we could append to list)
        # For now, we'll overwrite duplicates but log a warning
        if filename in logistic_map:
            logger.warning(f"⚠️ Duplicate filename '{filename}' in logistic results at index {i} - overwriting previous entry")
        
        logistic_map[filename] = r
        logger.debug(f"  Logistic result {i}: keys={list(r.keys())}, filename='{filename}'")
    
    llm_map = {}
    for i, r in enumerate(llm_results):
        # Try multiple possible key names
        filename = r.get("Resume File") or r.get("Filename") or r.get("resume_file") or r.get("filename") or ""
        
        # Convert to string and strip whitespace
        if filename:
            filename = str(filename).strip()
        
        if not filename:
            # Generate a unique filename if missing
            filename = f"result_{i+1}.pdf"
            logger.warning(f"⚠️ LLM result {i} missing filename, using: {filename}")
        else:
            logger.info(f"✅ LLM result {i}: filename='{filename}'")
        
        # Store the result - if duplicate, keep the last one (or we could append to list)
        if filename in llm_map:
            logger.warning(f"⚠️ Duplicate filename '{filename}' in LLM results at index {i} - overwriting previous entry")
        
        llm_map[filename] = r
        logger.debug(f"  LLM result {i}: keys={list(r.keys())}, filename='{filename}'")
    
    # Get all unique filenames from both results
    all_filenames = set(logistic_map.keys()) | set(llm_map.keys())
    
    # Log for debugging - THIS IS CRITICAL
    logger.info(f"📊 Mapping summary:")
    logger.info(f"   Logistic results: {len(logistic_results)} -> mapped: {len(logistic_map)}")
    logger.info(f"   Logistic filenames: {sorted(logistic_map.keys())}")
    logger.info(f"   LLM results: {len(llm_results)} -> mapped: {len(llm_map)}")
    logger.info(f"   LLM filenames: {sorted(llm_map.keys())}")
    logger.info(f"   All unique filenames ({len(all_filenames)}): {sorted(all_filenames)}")
    
    # If we have fewer filenames than results, something is wrong
    if len(logistic_map) < len(logistic_results):
        logger.error(f"❌ ERROR: Only {len(logistic_map)} unique filenames in logistic_map, but {len(logistic_results)} results!")
        logger.error(f"   This suggests duplicate or empty filenames")
    
    if len(llm_map) < len(llm_results):
        logger.error(f"❌ ERROR: Only {len(llm_map)} unique filenames in llm_map, but {len(llm_results)} results!")
        logger.error(f"   This suggests duplicate or empty filenames")
    
    if not all_filenames:
        logger.error("No filenames found in analysis results!")
        logger.error(f"Logistic results sample: {logistic_results[0] if logistic_results else 'None'}")
        logger.error(f"LLM results sample: {llm_results[0] if llm_results else 'None'}")
        raise HTTPException(400, "No candidate data found in analysis results.")
    
    # Get loaded resumes to extract email, qualification, and age information
    loaded_resumes = recruiter.get("loaded_resumes", [])
    resume_map = {}
    for r in loaded_resumes:
        filename = r.get("resume", {}).get("filename", "")
        if filename:
            resume_map[filename] = r
        else:
            logger.warning(f"Loaded resume missing filename: {r.get('candidate_id', 'unknown')}")
    
    logger.info(f"Loaded resumes: {len(loaded_resumes)}, resume_map: {len(resume_map)}, keys: {list(resume_map.keys())[:5]}")
    
    # Import email extraction function
    from .ai_pipeline import extract_contact_info
    
    # Helper function to parse predicted label
    def parse_predicted_label(label_str):
        """Parse 'Rating - Age Status - Qualification Status' into components"""
        if not label_str:
            return {"rating": "N/A", "age_status": "N/A", "qualification_status": "N/A"}
        
        parts = label_str.split(" - ")
        if len(parts) >= 3:
            return {
                "rating": parts[0].strip(),
                "age_status": parts[1].strip(),
                "qualification_status": parts[2].strip()
            }
        elif len(parts) == 2:
            return {
                "rating": parts[0].strip(),
                "age_status": parts[1].strip(),
                "qualification_status": "N/A"
            }
        else:
            return {
                "rating": parts[0].strip() if parts else "N/A",
                "age_status": "N/A",
                "qualification_status": "N/A"
            }
    
    # Create CSV content
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Write header - simplified columns matching the new format
    writer.writerow([
        "Rank", 
        "Candidate_Name", 
        "Candidate_Email", 
        "Candidate_ID",
        "Filename",
        "Qualification", 
        "Age",
        # Logistic Regression columns
        "Logistic_Predicted_Label",
        "Logistic_Rating",
        "Logistic_Age_Status",
        "Logistic_Qualification_Status",
        # LLM columns
        "LLM_Predicted_Label",
        "LLM_Rating",
        "LLM_Age_Status",
        "LLM_Qualification_Status"
    ])
    
    # Write all candidate data from both analysis methods
    logger.info(f"📊 Exporting {len(all_filenames)} candidates to CSV (Logistic: {len(logistic_results)}, LLM: {len(llm_results)})")
    
    # If we have fewer unique filenames than results, log a warning
    if len(all_filenames) < max(len(logistic_results), len(llm_results)):
        logger.warning(f"⚠️ Only {len(all_filenames)} unique filenames found, but we have {len(logistic_results)} logistic results and {len(llm_results)} LLM results")
        logger.warning(f"⚠️ This might indicate duplicate filenames or missing filename fields")
    
    rows_written = 0
    
    # Sort filenames for consistent ordering
    sorted_filenames = sorted(all_filenames)
    
    logger.info(f"📝 Processing {len(sorted_filenames)} unique filenames for CSV export")
    
    for idx, filename in enumerate(sorted_filenames, start=1):
        logger.info(f"Processing filename {idx}/{len(sorted_filenames)}: '{filename}'")
        
        # Get results from both methods
        logistic_result = logistic_map.get(filename, {})
        llm_result = llm_map.get(filename, {})
        
        logger.info(f"  Logistic result found: {bool(logistic_result)}, keys: {list(logistic_result.keys()) if logistic_result else []}")
        logger.info(f"  LLM result found: {bool(llm_result)}, keys: {list(llm_result.keys()) if llm_result else []}")
        
        # Get resume data for name, email, qualification, and age
        resume_data = resume_map.get(filename)
        logger.info(f"  Resume data found in map: {bool(resume_data)}")
        if not resume_data:
            logger.warning(f"  WARNING: No resume data found for filename '{filename}' in resume_map")
            logger.warning(f"  Available resume_map keys: {list(resume_map.keys())[:10]}")
        
        name = "N/A"
        candidate_email = "N/A"
        candidate_id = "N/A"
        qualification = "N/A"
        age = "N/A"
        
        if resume_data:
            name = resume_data.get("name", "N/A")
            candidate_email = resume_data.get("email", "N/A")
            candidate_id = resume_data.get("candidate_id", "N/A")
            
            # Get qualification and age from resume data
            resume = resume_data.get("resume", {})
            qualification = resume.get("qualification", "Unknown")
            age = resume.get("age", "N/A")
            
            logger.info(f"  Extracted data: name={name}, email={candidate_email}, qualification={qualification}, age={age}")
            
            # If email not found in loaded_resumes, try extracting from resume text
            if candidate_email == "N/A" or candidate_email == "uploaded@example.com":
                resume_text = resume.get("text_content", "")
                if resume_text:
                    try:
                        contact_info = extract_contact_info(resume_text)
                        emails = contact_info.get("emails", [])
                        if emails:
                            candidate_email = emails[0]  # Take first email found
                            logger.info(f"  Extracted email from text: {candidate_email}")
                    except Exception as e:
                        logger.debug(f"Could not extract email from resume text: {str(e)}")
                        pass
        else:
            # Try to get qualification and age from analysis results if resume_data not found
            if logistic_result:
                # Try to extract from loaded_resumes by matching any available data
                logger.warning(f"  Attempting to find resume data by matching filename in all loaded resumes...")
                for loaded_resume in loaded_resumes:
                    loaded_filename = loaded_resume.get("resume", {}).get("filename", "")
                    if loaded_filename == filename:
                        resume_data = loaded_resume
                        name = loaded_resume.get("name", "N/A")
                        candidate_email = loaded_resume.get("email", "N/A")
                        candidate_id = loaded_resume.get("candidate_id", "N/A")
                        resume = loaded_resume.get("resume", {})
                        qualification = resume.get("qualification", "Unknown")
                        age = resume.get("age", "N/A")
                        logger.info(f"  Found resume data by direct matching: name={name}")
                        break
        
        # Parse predicted labels - extract rating, age, and qualification from the label
        logistic_label = logistic_result.get("Predicted Label", "") if logistic_result else ""
        llm_label = llm_result.get("Predicted Label", "") if llm_result else ""
        
        logger.info(f"  Labels - Logistic: '{logistic_label}', LLM: '{llm_label}'")
        
        # Parse labels to extract components
        logistic_parsed = parse_predicted_label(logistic_label)
        llm_parsed = parse_predicted_label(llm_label)
        
        # If we don't have qualification/age from resume_data, try to get from all loaded_resumes by matching filename
        if (qualification == "N/A" or qualification == "Unknown") or age == "N/A":
            # Try to find resume data in all loaded_resumes by exact filename match
            for loaded_resume in loaded_resumes:
                loaded_filename = loaded_resume.get("resume", {}).get("filename", "")
                if loaded_filename == filename:
                    # Found matching resume - update qualification and age
                    resume_obj = loaded_resume.get("resume", {})
                    if qualification == "N/A" or qualification == "Unknown":
                        qualification = resume_obj.get("qualification", "Unknown")
                    if age == "N/A":
                        age = resume_obj.get("age", "N/A")
                    if name == "N/A" or not name:
                        name = loaded_resume.get("name", name)
                    if candidate_email == "N/A":
                        candidate_email = loaded_resume.get("email", candidate_email)
                    if candidate_id == "N/A":
                        candidate_id = loaded_resume.get("candidate_id", candidate_id)
                    logger.info(f"  Found matching resume data: qualification={qualification}, age={age}, name={name}")
                    break
        
        # If name is still N/A, use filename as name
        if name == "N/A" or not name or name == "":
            # Clean up filename to make it a readable name
            name = filename.replace(".pdf", "").replace("_", " ").replace("-", " ").strip()
            if not name:
                name = f"Candidate {idx}"
        
        # Ensure qualification and age have valid values
        if not qualification or qualification == "N/A" or qualification == "Unknown":
            qualification = "Not Specified"
        if not age or age == "N/A":
            age = "Not Specified"
        
        # Log row data before writing
        logger.info(f"  Final row data for {filename}:")
        logger.info(f"    name={name}, email={candidate_email}, qualification={qualification}, age={age}")
        logger.info(f"    Logistic: '{logistic_label}' -> rating={logistic_parsed['rating']}, age={logistic_parsed['age_status']}, qual={logistic_parsed['qualification_status']}")
        logger.info(f"    LLM: '{llm_label}' -> rating={llm_parsed['rating']}, age={llm_parsed['age_status']}, qual={llm_parsed['qualification_status']}")
        
        # Build row data - ensure all values are strings and not None
        # CRITICAL: Ensure filename is always a valid string
        if not filename or filename == "":
            logger.error(f"  ❌ ERROR: Filename is empty for row {idx}!")
            filename = f"unknown_{idx}.pdf"
        
        # Ensure all values are non-empty strings
        def safe_str(val, default="N/A"):
            if val is None:
                return default
            val_str = str(val).strip()
            return val_str if val_str else default
        
        row_data = [
            str(idx),  # Rank
            safe_str(name, "Unknown"),  # Candidate_Name
            safe_str(candidate_email, "N/A"),  # Candidate_Email
            safe_str(candidate_id, "N/A"),  # Candidate_ID
            safe_str(filename, f"file_{idx}.pdf"),  # Filename - CRITICAL: must not be empty
            safe_str(qualification, "Not Specified"),  # Qualification
            safe_str(age, "Not Specified"),  # Age
            # Logistic Regression columns
            safe_str(logistic_label, "N/A"),  # Logistic_Predicted_Label
            safe_str(logistic_parsed.get("rating"), "N/A"),  # Logistic_Rating
            safe_str(logistic_parsed.get("age_status"), "N/A"),  # Logistic_Age_Status
            safe_str(logistic_parsed.get("qualification_status"), "N/A"),  # Logistic_Qualification_Status
            # LLM columns
            safe_str(llm_label, "N/A"),  # LLM_Predicted_Label
            safe_str(llm_parsed.get("rating"), "N/A"),  # LLM_Rating
            safe_str(llm_parsed.get("age_status"), "N/A"),  # LLM_Age_Status
            safe_str(llm_parsed.get("qualification_status"), "N/A")  # LLM_Qualification_Status
        ]
        
        # Log the row data to verify it's correct
        logger.info(f"  📝 Row {idx} data: filename='{row_data[4]}', name='{row_data[1]}', logistic_label='{row_data[7]}', llm_label='{row_data[11]}'")
        
        # Verify row data has correct number of columns
        expected_columns = 16  # Count from header
        if len(row_data) != expected_columns:
            logger.error(f"  ERROR: Row {idx} has {len(row_data)} columns, expected {expected_columns}")
            logger.error(f"  Row data: {row_data}")
            # Pad or truncate to match expected columns
            while len(row_data) < expected_columns:
                row_data.append("N/A")
            row_data = row_data[:expected_columns]
        
        logger.info(f"  Writing row {idx} with {len(row_data)} columns")
        writer.writerow(row_data)
        rows_written += 1
        logger.info(f"  ✅ Row {idx} written successfully")
    
    logger.info(f"✅ Wrote {rows_written} rows to CSV")
    
    # Get CSV content
    csv_content = output.getvalue()
    
    # Log CSV content for debugging
    logger.info(f"CSV content length: {len(csv_content)} characters")
    if csv_content:
        lines = csv_content.strip().split('\n')
        logger.info(f"CSV has {len(lines)} lines (including header)")
        if len(lines) > 0:
            logger.info(f"CSV header ({len(lines[0].split(','))} columns): {lines[0][:200]}")
        if len(lines) > 1:
            logger.info(f"CSV first data row ({len(lines[1].split(','))} columns): {lines[1][:200]}")
        if len(lines) > 2:
            logger.info(f"CSV second data row: {lines[2][:200]}")
    else:
        logger.error("ERROR: CSV content is empty!")
        raise HTTPException(status_code=500, detail="CSV export failed: no data generated")
    
    # Verify we have data rows
    if rows_written == 0:
        logger.error("ERROR: No rows written to CSV!")
        raise HTTPException(status_code=400, detail="No candidate data to export. Please analyze resumes first.")
    
    # Verify CSV has correct structure
    csv_lines = csv_content.strip().split('\n')
    if len(csv_lines) < 2:
        logger.error(f"ERROR: CSV should have at least 2 lines (header + data), but has {len(csv_lines)}")
        logger.error(f"CSV content preview: {csv_content[:500]}")
        raise HTTPException(status_code=500, detail=f"CSV export failed: only {len(csv_lines)} lines generated (expected at least 2)")
    
    logger.info(f"✅ CSV export successful: {len(csv_lines)-1} data rows (plus 1 header row)")
    
    # Don't close the StringIO - we need to return its content
    # Return CSV as streaming response
    return StreamingResponse(
        iter([csv_content]),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": "attachment; filename=all_candidates.csv",
            "Content-Type": "text/csv; charset=utf-8"
        }
    )


@router.delete("/clear-shortlisted-candidates")
async def clear_shortlisted_candidates(current_recruiter: str = Depends(get_current_recruiter)):
    """Clear all shortlisted candidates for the current recruiter"""
    
    result = await db.shortlisted_candidates.delete_many({
        "recruiter_id": ObjectId(current_recruiter)
    })
    
    return {
        "msg": f"Successfully cleared {result.deleted_count} shortlisted candidate records",
        "deleted_count": result.deleted_count
    }


@router.get("/sentiment-analysis")
async def get_sentiment_analysis(current_recruiter: str = Depends(get_current_recruiter)):
    """Get sentiment analysis for all shortlisted candidates"""
    
    # Get all shortlisted candidates for this recruiter
    shortlists = await db.shortlisted_candidates.find({
        "recruiter_id": ObjectId(current_recruiter)
    }).sort("created_at", -1).to_list(None)
    
    if not shortlists:
        return {
            "msg": "No shortlisted candidates found",
            "sentiment_data": []
        }
    
    sentiment_data = []
    
    for shortlist in shortlists:
        for candidate in shortlist.get("candidates", []):
            # Get analysis data from the candidate object
            analysis = candidate.get("analysis", {})
            score = analysis.get("score", 0)
            rating = analysis.get("rating", "N/A")
            
            # Determine remark based on score
            if score >= 8:
                remark = "Good"
            elif score >= 6:
                remark = "Intermediate"
            else:
                remark = "Poor"
            
            sentiment_data.append({
                "name": candidate.get("name", "N/A"),
                "score": score,
                "remark": remark,
                "rating": rating,
                "email": candidate.get("email", "N/A"),
                "analysis_method": shortlist.get("analysis_method", "N/A"),
                "shortlist_id": str(shortlist["_id"]),
                "created_at": shortlist.get("created_at", "")
            })
    
    # Sort by score (highest first)
    sentiment_data.sort(key=lambda x: x["score"], reverse=True)
    
    return {
        "msg": f"Found sentiment analysis for {len(sentiment_data)} shortlisted candidates",
        "sentiment_data": sentiment_data
    }


@router.get("/model-status")
async def get_model_status(current_recruiter: str = Depends(get_current_recruiter)):
    """Get the status of loaded ML models"""
    try:
        status = model_manager.get_model_status()
        return {
            "msg": "Model status retrieved successfully",
            "status": status
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get model status: {str(e)}")