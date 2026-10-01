import json
import os
from pathlib import Path

import requests

BASE = "http://127.0.0.1:3000"
SAMPLE = Path(__file__).parent / "sample_resume.txt"


def main():
    health = requests.get(f"{BASE}/health", timeout=10).json()
    print("HEALTH", json.dumps(health, indent=2)[:500])

    cand = {
        "name": "John Smith",
        "email": "john.demo@example.com",
        "password": "secret123",
    }
    rec = {
        "name": "Priya Recruiter",
        "email": "priya.demo@example.com",
        "password": "secret123",
        "company": "Demo Corp",
        "company_id": "DEMO001",
    }

    requests.post(f"{BASE}/auth/signup", json=cand, timeout=10)
    login = requests.post(f"{BASE}/auth/login", json={"email": cand["email"], "password": cand["password"]}, timeout=10)
    login.raise_for_status()
    cand_token = login.json()["access_token"]
    print("CANDIDATE_LOGIN_OK", login.json().get("name"))

    headers = {"Authorization": f"Bearer {cand_token}"}
    with open(SAMPLE, "rb") as handle:
        upload = requests.post(
            f"{BASE}/candidate/upload-resume",
            headers=headers,
            files={"file": ("sample_resume.txt", handle, "text/plain")},
            timeout=30,
        )
    print("UPLOAD", upload.status_code, upload.text[:300])
    upload.raise_for_status()

    logistic = requests.post(f"{BASE}/candidate/analyze-logistic-regression", headers=headers, timeout=30)
    print("LOGISTIC", logistic.status_code, logistic.text[:400])
    logistic.raise_for_status()

    zero = requests.post(f"{BASE}/candidate/analyze-zero-shot", headers=headers, timeout=30)
    print("ZERO_SHOT", zero.status_code, zero.text[:400])
    zero.raise_for_status()

    requests.post(f"{BASE}/recruiter/signup", json=rec, timeout=10)
    rlogin = requests.post(f"{BASE}/recruiter/login", json={"email": rec["email"], "password": rec["password"]}, timeout=10)
    rlogin.raise_for_status()
    rec_token = rlogin.json()["access_token"]
    print("RECRUITER_LOGIN_OK", rlogin.json().get("name"))
    rh = {"Authorization": f"Bearer {rec_token}"}

    loaded = requests.post(f"{BASE}/recruiter/load-resumes", headers=rh, json={"job_keyword": "any"}, timeout=30)
    print("LOAD", loaded.status_code, loaded.text[:300])
    loaded.raise_for_status()

    analyzed = requests.post(f"{BASE}/recruiter/analyze-resumes-logistic", headers=rh, timeout=30)
    print("ANALYZE", analyzed.status_code, analyzed.text[:400].encode("ascii", "replace").decode())
    analyzed.raise_for_status()

    short = requests.post(
        f"{BASE}/recruiter/save-shortlisted-logistic",
        headers=rh,
        json={"num_candidates": 3, "analysis_method": "logistic_regression"},
        timeout=30,
    )
    print("SHORTLIST", short.status_code, short.text[:400])
    short.raise_for_status()

    job = requests.post(
        f"{BASE}/recruiter/post-job",
        headers=rh,
        json={
            "title": "Python Developer",
            "description": "Build APIs with FastAPI and machine learning.",
            "experience": "2+ years",
            "education": "B.Tech",
            "skills": "python, fastapi, machine learning, react",
            "location": "Remote",
            "salary": "12 LPA",
        },
        timeout=30,
    )
    print("JOB", job.status_code, job.text[:500])
    job.raise_for_status()
    print("ALL_CHECKS_PASSED")


if __name__ == "__main__":
    main()
