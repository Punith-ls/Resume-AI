from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from .database import db
from .utils import hash_password, verify_password, create_access_token

router = APIRouter()

class SignupRequest(BaseModel):
    name: str
    email: str
    password: str

class LoginRequest(BaseModel):
    email: str
    password: str

@router.post("/signup")
async def signup(request: SignupRequest):
    if await db.candidates.find_one({"email": request.email}):
        raise HTTPException(400, "Email already registered")
    user = {"name": request.name, "email": request.email, "password_hash": hash_password(request.password), "resume": None}
    await db.candidates.insert_one(user)
    return {"msg": "Signup successful"}

@router.post("/login")
async def login(request: LoginRequest):
    user = await db.candidates.find_one({"email": request.email})
    if not user or not verify_password(request.password, user["password_hash"]):
        raise HTTPException(401, "Invalid credentials")
    token = create_access_token({
        "sub": str(user["_id"]),
        "role": "candidate",
        "name": user.get("name", ""),
        "email": user.get("email", ""),
    })
    return {"access_token": token, "token_type": "bearer", "role": "candidate", "name": user.get("name", "")}
