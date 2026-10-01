from pydantic import BaseModel
from typing import List, Optional

class Candidate(BaseModel):
    name: str
    email: str
    password: str

class Resume(BaseModel):
    filename: str
    score: float
    rating: str
    skills: List[str]
    uploaded_at: str
