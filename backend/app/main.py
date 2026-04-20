from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os

# Load environment variables
load_dotenv()

app = FastAPI(
    title="CuringGuard Backend API",
    description="The FastAPI core backend for the CuringGuard Multi-Tenant System",
    version="1.0.0"
)

# Allow React frontend to communicate natively
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def health_check():
    return {"status": "success", "message": "CuringGuard API Engine Room is Online. 🚀"}

# TODO: Database Configuration (SQLAlchemy / Laragon PostgreSQL) will be mounted here.
