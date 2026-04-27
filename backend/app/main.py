from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os

# Load environment variables
load_dotenv()

from contextlib import asynccontextmanager
from backend.app.services.cron_service import start_scheduler

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup actions
    start_scheduler()
    yield
    # Shutdown actions could go here

app = FastAPI(
    title="CuringGuard Backend API",
    description="The FastAPI core backend for the CuringGuard Multi-Tenant System",
    version="1.0.0",
    lifespan=lifespan
)

# Allow React frontend to communicate natively
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from backend.app.core.database import engine, Base
from backend.app.routers import auth, hierarchy, users, curing, library, gateways

# Initialize all database tables
Base.metadata.create_all(bind=engine)

app.include_router(auth.router)
app.include_router(hierarchy.router)
app.include_router(users.router)
app.include_router(curing.router)
app.include_router(library.router)
app.include_router(gateways.router)

@app.get("/")
def health_check():
    return {"status": "success", "message": "CuringGuard API Engine Room is Online. 🚀"}
