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
from backend.app.routers import auth, hierarchy, users, curing, library, gateways, progress, system

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
    try:
        user_columns = {column["name"] for column in inspector.get_columns("users")}
    except Exception:
        user_columns = set()
    try:
        default_element_columns = {column["name"] for column in inspector.get_columns("default_elements")}
    except Exception:
        default_element_columns = set()
    try:
        custom_element_columns = {column["name"] for column in inspector.get_columns("custom_elements")}
    except Exception:
        custom_element_columns = set()
    try:
        progress_media_columns = {column["name"] for column in inspector.get_columns("curing_progress_media")}
    except Exception:
        progress_media_columns = set()

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

    if "default_elements" not in table_names:
        with engine.begin() as connection:
            connection.execute(text("""
                CREATE TABLE default_elements (
                    id INTEGER PRIMARY KEY AUTO_INCREMENT,
                    element_name VARCHAR(255) NOT NULL,
                    geometry_type VARCHAR(255) NOT NULL,
                    required_curing_days INTEGER NOT NULL,
                    description VARCHAR(1000) NULL,
                    is_active BOOLEAN DEFAULT TRUE,
                    created_at DATETIME NULL,
                    updated_at DATETIME NULL
                )
            """))
        table_names.add("default_elements")

    if "curing_rules" in table_names:
        with engine.begin() as connection:
            connection.execute(text("""
                INSERT INTO default_elements (element_name, geometry_type, required_curing_days, description, is_active, created_at, updated_at)
                SELECT cr.element_name, cr.geometry_type, cr.required_curing_days, cr.description, cr.is_active, cr.created_at, cr.updated_at
                FROM curing_rules cr
                LEFT JOIN default_elements de ON de.element_name = cr.element_name
                WHERE de.id IS NULL
            """))
            connection.execute(text("DROP TABLE curing_rules"))
        table_names.discard("curing_rules")

    if "custom_elements" not in table_names:
        with engine.begin() as connection:
            connection.execute(text("""
                CREATE TABLE custom_elements (
                    id INTEGER PRIMARY KEY AUTO_INCREMENT,
                    user_id INTEGER NOT NULL,
                    element_name VARCHAR(255) NOT NULL,
                    geometry_type VARCHAR(255) NOT NULL,
                    required_curing_days INTEGER NOT NULL,
                    description VARCHAR(1000) NULL,
                    is_active BOOLEAN DEFAULT TRUE,
                    created_at DATETIME NULL,
                    updated_at DATETIME NULL
                )
            """))
        table_names.add("custom_elements")

    if "custom_elements" in table_names and "default_elements" in table_names:
        with engine.begin() as connection:
            monitor_rows = connection.execute(text("SELECT id FROM users WHERE role = 'MONITOR' OR role = 'monitor'")).mappings().all()
            for row in monitor_rows:
                connection.execute(text("""
                    INSERT INTO custom_elements (user_id, element_name, geometry_type, required_curing_days, description, is_active, created_at, updated_at)
                    SELECT :user_id, de.element_name, de.geometry_type, de.required_curing_days, de.description, de.is_active, de.created_at, de.updated_at
                    FROM default_elements de
                    LEFT JOIN custom_elements ce ON ce.user_id = :user_id AND ce.element_name = de.element_name AND ce.geometry_type = de.geometry_type
                    WHERE ce.id IS NULL
                """), {"user_id": row["id"]})

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

    if "system_settings" in table_names:
        with engine.begin() as connection:
            row = connection.execute(
                text("SELECT id FROM system_settings WHERE setting_key = 'manual_file_entry' ORDER BY id ASC LIMIT 1")
            ).mappings().first()
            if not row:
                connection.execute(
                    text("""
                        INSERT INTO system_settings (setting_key, setting_value, category, description)
                        VALUES ('manual_file_entry', 'yes', 'progress', 'Allow manual photo and video upload in curing progress')
                    """)
                )

    if "source_type" not in progress_media_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE curing_progress_media ADD COLUMN source_type VARCHAR(32) NULL"))

    if "captured_at" not in progress_media_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE curing_progress_media ADD COLUMN captured_at DATETIME NULL"))

    if "capture_latitude" not in progress_media_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE curing_progress_media ADD COLUMN capture_latitude VARCHAR(64) NULL"))

    if "capture_longitude" not in progress_media_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE curing_progress_media ADD COLUMN capture_longitude VARCHAR(64) NULL"))

    if "curing_start_date" not in drawing_element_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE drawing_elements ADD COLUMN curing_start_date DATE NULL"))

    if "curing_end_date" not in drawing_element_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE drawing_elements ADD COLUMN curing_end_date DATE NULL"))

    if "created_by_monitor_id" not in user_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE users ADD COLUMN created_by_monitor_id INTEGER NULL"))


ensure_runtime_schema()

app.include_router(auth.router)
app.include_router(hierarchy.router)
app.include_router(users.router)
app.include_router(curing.router)
app.include_router(library.router)
app.include_router(gateways.router)
app.include_router(progress.router)
app.include_router(system.router)

@app.get("/")
def health_check():
    return {"status": "success", "message": "CuringGuard API Engine Room is Online. 🚀"}
