from collections import defaultdict
from datetime import date, datetime
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import text
from sqlalchemy.orm import Session
from typing import List
import json
import os
import shutil

from backend.app.core.auth import get_current_user
from backend.app.core.database import get_db
from backend.app.models.curing import CuringProgressEntry, CuringProgressMedia, DrawingElement
from backend.app.models.hierarchy import Drawing, DrawingPage, Package, Project, Structure
from backend.app.models.users import User, UserRole
from backend.app.schemas.progress import ProgressEntryResponse

router = APIRouter(prefix="/api/progress", tags=["Progress"])

ALLOWED_IMAGE_MIME_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/bmp",
    "image/gif",
}


def _base_element_query(db: Session):
    return (
        db.query(DrawingElement, DrawingPage, Drawing, Structure, Package, Project)
        .join(DrawingPage, DrawingElement.drawing_page_id == DrawingPage.id)
        .join(Drawing, DrawingElement.drawing_id == Drawing.id)
        .join(Structure, Drawing.structure_id == Structure.id)
        .join(Package, Structure.package_id == Package.id)
        .join(Project, Package.project_id == Project.id)
        .filter(
            DrawingElement.curing_start_date != None,
            DrawingElement.curing_end_date != None,
            DrawingPage.is_deleted == False,
            Structure.is_deleted == False,
            Package.is_deleted == False,
            Project.is_deleted == False,
        )
    )


def _scoped_element_query(db: Session, current_user: User):
    query = _base_element_query(db)
    if current_user.role == UserRole.MONITOR:
        return query.filter(Project.user_id == current_user.id)
    if current_user.role == UserRole.CONTRACTOR:
        return query.filter(Structure.contractor_id == current_user.id)
    if current_user.role == UserRole.SUPERADMIN:
        return query
    raise HTTPException(status_code=403, detail="Forbidden")


def _load_latest_progress_map(db: Session, element_ids: List[str]):
    progress_rows = (
        db.query(CuringProgressEntry)
        .filter(CuringProgressEntry.drawing_element_id.in_(element_ids))
        .order_by(
            CuringProgressEntry.drawing_element_id.asc(),
            CuringProgressEntry.progress_date.asc(),
            CuringProgressEntry.created_at.asc(),
            CuringProgressEntry.id.asc(),
        )
        .all()
    )
    latest_map: dict[str, dict[str, CuringProgressEntry]] = defaultdict(dict)
    for row in progress_rows:
        latest_map[row.drawing_element_id][row.progress_date.isoformat()] = row
    return latest_map


def _assert_can_submit_progress(db: Session, current_user: User, drawing_element_id: str):
    record = _scoped_element_query(db, current_user).filter(DrawingElement.id == drawing_element_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Drawing element not found")
    drawing_element, drawing_page, drawing, structure, package, project = record
    today = date.today()
    if drawing_element.curing_end_date and today > drawing_element.curing_end_date:
        raise HTTPException(status_code=400, detail="This element is completed. Progress can no longer be submitted.")
    return drawing_element


def _get_system_setting(db: Session):
    row = db.execute(
        text("""
            SELECT setting_value
            FROM system_settings
            WHERE setting_key = 'manual_file_entry'
            ORDER BY id ASC
            LIMIT 1
        """)
    ).mappings().first()
    if row:
        return {"manual_file_entry_enabled": str(row["setting_value"]).lower() != "no"}
    db.execute(
        text("""
            INSERT INTO system_settings (setting_key, setting_value, category, description)
            VALUES ('manual_file_entry', 'yes', 'progress', 'Allow manual photo and video upload in curing progress')
        """)
    )
    db.commit()
    return {"manual_file_entry_enabled": True}


@router.get("/rows")
def get_progress_rows(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    rows = _scoped_element_query(db, current_user).order_by(
        Structure.name.asc(),
        Drawing.name.asc(),
        DrawingPage.sort_order.asc(),
        DrawingElement.member_name.asc(),
        DrawingElement.id.asc(),
    ).all()
    element_ids = [drawing_element.id for drawing_element, *_ in rows]
    latest_progress = _load_latest_progress_map(db, element_ids) if element_ids else {}
    today_key = date.today().isoformat()

    grouped: dict[int, dict] = {}
    for drawing_element, drawing_page, drawing, structure, package, project in rows:
        latest_by_day = latest_progress.get(drawing_element.id, {})
        total_days = drawing_element.curing_duration_days or max((drawing_element.curing_end_date - drawing_element.curing_start_date).days, 0)
        elapsed_days = 0
        if drawing_element.curing_start_date:
            elapsed_days = max((min(date.today(), drawing_element.curing_end_date) - drawing_element.curing_start_date).days, 0) if drawing_element.curing_end_date else max((date.today() - drawing_element.curing_start_date).days, 0)
            if total_days:
                elapsed_days = min(elapsed_days, total_days)
        is_completed = bool(drawing_element.curing_end_date and date.today() > drawing_element.curing_end_date)
        today_entry = latest_by_day.get(today_key)
        if structure.id not in grouped:
            grouped[structure.id] = {
                "structure_id": structure.id,
                "structure_name": structure.name,
                "rows": [],
            }
        grouped[structure.id]["rows"].append({
            "drawing_element_id": drawing_element.id,
            "plan_name": drawing.name,
            "page_name": drawing_page.name,
            "element_name": drawing_element.member_name or drawing_element.element_type,
            "start_date": drawing_element.curing_start_date.isoformat(),
            "end_date": drawing_element.curing_end_date.isoformat() if drawing_element.curing_end_date else "",
            "total_days": total_days,
            "elapsed_days": elapsed_days,
            "is_completed": is_completed,
            "today_status": "added" if today_entry else "pending",
            "gantt_days": [
                {
                    "date": day_key,
                    "did_cure_today": bool(entry.did_cure_today),
                    "entry_id": entry.id,
                }
                for day_key, entry in sorted(latest_by_day.items(), key=lambda item: item[0])
            ],
        })

    return {"structures": list(grouped.values())}


@router.post("/entries", response_model=ProgressEntryResponse)
def create_progress_entry(
    drawing_element_id: str = Form(...),
    progress_date: str = Form(...),
    did_cure_today: str = Form(...),
    remark: str | None = Form(None),
    media_metadata_json: str | None = Form(None),
    files: List[UploadFile] = File(default=[]),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    drawing_element = _assert_can_submit_progress(db, current_user, drawing_element_id)
    system_setting = _get_system_setting(db)
    try:
        parsed_date = date.fromisoformat(progress_date[:10])
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid progress date.")

    if drawing_element.curing_end_date and parsed_date > drawing_element.curing_end_date:
        raise HTTPException(status_code=400, detail="Progress date cannot be after element end date.")

    did_cure_value = did_cure_today.strip().lower() in {"1", "true", "yes", "y"}
    try:
        raw_media_metadata = json.loads(media_metadata_json) if media_metadata_json else []
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid media metadata payload.")
    metadata_by_name = {}
    if isinstance(raw_media_metadata, list):
        for item in raw_media_metadata:
            if isinstance(item, dict) and item.get("name"):
                metadata_by_name[str(item["name"])] = item

    entry = CuringProgressEntry(
        drawing_element_id=drawing_element_id,
        user_id=current_user.id,
        progress_date=parsed_date,
        did_cure_today=did_cure_value,
        remark=(remark or "").strip() or None,
    )
    db.add(entry)
    db.flush()

    upload_dir = os.path.join("uploads", "progress", str(entry.id))
    os.makedirs(upload_dir, exist_ok=True)
    media_records: list[CuringProgressMedia] = []
    try:
        for file in files or []:
            if not file.filename:
                continue
            mime_type = file.content_type or ""
            is_video = mime_type.startswith("video/")
            is_image = mime_type.startswith("image/")
            if is_image and mime_type not in ALLOWED_IMAGE_MIME_TYPES:
                raise HTTPException(status_code=400, detail="Unsupported image format. Allowed: JPG, PNG, WEBP, BMP, GIF.")
            if not is_image and not is_video:
                raise HTTPException(status_code=400, detail="Only image and video files are supported.")

            metadata = metadata_by_name.get(file.filename, {})
            source_type = str(metadata.get("source", "manual")).lower()
            if source_type == "manual" and not system_setting["manual_file_entry_enabled"]:
                raise HTTPException(status_code=400, detail="Manual file entry is currently disabled.")

            file_type = "video" if is_video else "image"
            safe_name = f"{datetime.utcnow().timestamp():.0f}_{os.path.basename(file.filename)}"
            file_path = os.path.join(upload_dir, safe_name)
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)

            captured_at = None
            captured_at_raw = metadata.get("capturedAt")
            if captured_at_raw:
                try:
                    captured_at = datetime.fromisoformat(str(captured_at_raw).replace("Z", "+00:00"))
                except ValueError:
                    captured_at = None

            media = CuringProgressMedia(
                progress_entry_id=entry.id,
                file_path=file_path,
                source_type=source_type,
                file_type=file_type,
                mime_type=mime_type,
                captured_at=captured_at,
                capture_latitude=str(metadata.get("latitude")) if metadata.get("latitude") is not None else None,
                capture_longitude=str(metadata.get("longitude")) if metadata.get("longitude") is not None else None,
            )
            db.add(media)
            media_records.append(media)
        db.commit()
        db.refresh(entry)
    except Exception:
        db.rollback()
        if os.path.isdir(upload_dir):
            shutil.rmtree(upload_dir, ignore_errors=True)
        raise

    return ProgressEntryResponse(
        id=entry.id,
        drawing_element_id=entry.drawing_element_id,
        user_id=entry.user_id,
        progress_date=entry.progress_date,
        did_cure_today=entry.did_cure_today,
        remark=entry.remark,
        created_at=entry.created_at,
        updated_at=entry.updated_at,
        media=media_records,
    )
