from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os
from sqlalchemy import inspect, text

# Load environment variables
load_dotenv()

from contextlib import asynccontextmanager
from backend.app.services.cron_service import start_scheduler
import json

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


def ensure_runtime_schema():
    inspector = inspect(engine)
    try:
        drawing_columns = {column["name"] for column in inspector.get_columns("drawings")}
    except Exception:
        drawing_columns = set()
    try:
        project_columns = {column["name"] for column in inspector.get_columns("projects")}
    except Exception:
        project_columns = set()
    try:
        package_columns = {column["name"] for column in inspector.get_columns("packages")}
    except Exception:
        package_columns = set()
    try:
        structure_columns = {column["name"] for column in inspector.get_columns("structures")}
    except Exception:
        structure_columns = set()
    try:
        drawing_page_columns = {column["name"] for column in inspector.get_columns("drawing_pages")}
    except Exception:
        drawing_page_columns = set()
    try:
        drawing_element_columns = {column["name"] for column in inspector.get_columns("drawing_elements")}
    except Exception:
        drawing_element_columns = set()

    if "asset_kind" not in drawing_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE drawings ADD COLUMN asset_kind VARCHAR(50) NOT NULL DEFAULT 'pdf'"))
            connection.execute(text("""
                UPDATE drawings
                SET asset_kind = CASE
                    WHEN file_path = '' THEN 'blank'
                    WHEN LOWER(file_path) LIKE '%.pdf' THEN 'pdf'
                    WHEN LOWER(file_path) LIKE '%.png' THEN 'image'
                    WHEN LOWER(file_path) LIKE '%.jpg' THEN 'image'
                    WHEN LOWER(file_path) LIKE '%.jpeg' THEN 'image'
                    WHEN LOWER(file_path) LIKE '%.webp' THEN 'image'
                    WHEN LOWER(file_path) LIKE '%.bmp' THEN 'image'
                    WHEN LOWER(file_path) LIKE '%.gif' THEN 'image'
                    ELSE 'pdf'
                END
            """))

    if "is_deleted" not in project_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE projects ADD COLUMN is_deleted BOOLEAN NOT NULL DEFAULT FALSE"))

    if "is_deleted" not in package_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE packages ADD COLUMN is_deleted BOOLEAN NOT NULL DEFAULT FALSE"))

    if "is_deleted" not in structure_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE structures ADD COLUMN is_deleted BOOLEAN NOT NULL DEFAULT FALSE"))

    if "calibrations_json" not in drawing_page_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE drawing_pages ADD COLUMN calibrations_json TEXT NULL"))

    try:
        table_names = set(inspector.get_table_names())
    except Exception:
        table_names = set()

    legacy_calibration_columns = [
        "calibration_x1",
        "calibration_y1",
        "calibration_x2",
        "calibration_y2",
        "calibration_value",
        "calibration_unit",
    ]
    existing_legacy_columns = [column_name for column_name in legacy_calibration_columns if column_name in drawing_page_columns]
    if existing_legacy_columns:
        with engine.begin() as connection:
            page_rows = connection.execute(text("""
                SELECT id, calibrations_json, calibration_x1, calibration_y1, calibration_x2, calibration_y2, calibration_value, calibration_unit
                FROM drawing_pages
            """)).mappings().all()
            for row in page_rows:
                calibrations = []
                if row["calibrations_json"]:
                    try:
                        parsed = json.loads(row["calibrations_json"])
                        if isinstance(parsed, list):
                            calibrations = parsed
                    except json.JSONDecodeError:
                        calibrations = []
                if None not in (row["calibration_x1"], row["calibration_y1"], row["calibration_x2"], row["calibration_y2"], row["calibration_value"]) and row["calibration_unit"]:
                    if not calibrations:
                        calibrations.append({
                            "id": 1,
                            "points": [
                                {"x": row["calibration_x1"], "y": row["calibration_y1"]},
                                {"x": row["calibration_x2"], "y": row["calibration_y2"]},
                            ],
                            "value": row["calibration_value"],
                            "unit": row["calibration_unit"],
                        })
                        connection.execute(
                            text("UPDATE drawing_pages SET calibrations_json = :calibrations_json WHERE id = :page_id"),
                            {"page_id": row["id"], "calibrations_json": json.dumps(calibrations)},
                        )

    if "drawing_page_calibrations" in table_names:
        with engine.begin() as connection:
            page_rows = connection.execute(text("""
                SELECT id, calibrations_json
                FROM drawing_pages
            """)).mappings().all()
            page_payloads = {}
            for row in page_rows:
                calibrations = []
                if row["calibrations_json"]:
                    try:
                        parsed = json.loads(row["calibrations_json"])
                        if isinstance(parsed, list):
                            calibrations = parsed
                    except json.JSONDecodeError:
                        calibrations = []
                page_payloads[row["id"]] = calibrations

            calibration_rows = connection.execute(text("""
                SELECT id, drawing_page_id, x1, y1, x2, y2, real_value, unit
                FROM drawing_page_calibrations
                ORDER BY drawing_page_id ASC, id ASC
            """)).mappings().all()
            for row in calibration_rows:
                calibrations = page_payloads.setdefault(row["drawing_page_id"], [])
                calibrations.append({
                    "id": len(calibrations) + 1,
                    "points": [
                        {"x": row["x1"], "y": row["y1"]},
                        {"x": row["x2"], "y": row["y2"]},
                    ],
                    "value": row["real_value"],
                    "unit": row["unit"],
                })

            for page_id, calibrations in page_payloads.items():
                connection.execute(
                    text("""
                        UPDATE drawing_pages
                        SET calibrations_json = :calibrations_json
                        WHERE id = :page_id
                    """),
                    {"page_id": page_id, "calibrations_json": json.dumps(calibrations) if calibrations else None},
                )
            connection.execute(text("DROP TABLE drawing_page_calibrations"))

    if existing_legacy_columns:
        with engine.begin() as connection:
            for column_name in existing_legacy_columns:
                connection.execute(text(f"ALTER TABLE drawing_pages DROP COLUMN {column_name}"))

    if "curing_duration_days" not in drawing_element_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE drawing_elements ADD COLUMN curing_duration_days INTEGER NULL"))

    if "is_hidden" not in drawing_element_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE drawing_elements ADD COLUMN is_hidden BOOLEAN NOT NULL DEFAULT FALSE"))

    if "point_shape" not in drawing_element_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE drawing_elements ADD COLUMN point_shape VARCHAR(32) NULL"))

    if "curing_start_date" not in drawing_element_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE drawing_elements ADD COLUMN curing_start_date DATE NULL"))

    if "curing_end_date" not in drawing_element_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE drawing_elements ADD COLUMN curing_end_date DATE NULL"))


ensure_runtime_schema()

app.include_router(auth.router)
app.include_router(hierarchy.router)
app.include_router(users.router)
app.include_router(curing.router)
app.include_router(library.router)
app.include_router(gateways.router)

@app.get("/")
def health_check():
    return {"status": "success", "message": "CuringGuard API Engine Room is Online. 🚀"}
