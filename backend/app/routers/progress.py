from collections import defaultdict
from datetime import date, datetime, timedelta
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
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


def _build_progress_row_payload(drawing_element, drawing_page, drawing, structure, latest_progress_by_day: dict[str, CuringProgressEntry], today_key: str):
    total_days = drawing_element.curing_duration_days or max((drawing_element.curing_end_date - drawing_element.curing_start_date).days, 0)
    elapsed_days = 0
    if drawing_element.curing_start_date:
        elapsed_days = max((min(date.today(), drawing_element.curing_end_date) - drawing_element.curing_start_date).days, 0) if drawing_element.curing_end_date else max((date.today() - drawing_element.curing_start_date).days, 0)
        if total_days:
            elapsed_days = min(elapsed_days, total_days)
    is_completed = bool(drawing_element.curing_end_date and date.today() > drawing_element.curing_end_date)
    today_entry = latest_progress_by_day.get(today_key)
    return {
        "drawing_element_id": drawing_element.id,
        "structure_id": structure.id,
        "structure_name": structure.name,
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
            for day_key, entry in sorted(latest_progress_by_day.items(), key=lambda item: item[0])
        ],
    }


def _assert_can_submit_progress(db: Session, current_user: User, drawing_element_id: str):
    record = _scoped_element_query(db, current_user).filter(DrawingElement.id == drawing_element_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Drawing element not found")
    drawing_element, drawing_page, drawing, structure, package, project = record
    today = date.today()
    if drawing_element.curing_end_date and today > drawing_element.curing_end_date:
        raise HTTPException(status_code=400, detail="This element is completed. Progress can no longer be submitted.")
    return drawing_element


def _assert_can_access_progress_element(db: Session, current_user: User, drawing_element_id: str):
    record = _scoped_element_query(db, current_user).filter(DrawingElement.id == drawing_element_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Drawing element not found")
    return record


def _presentation_window_dates(drawing_element: DrawingElement) -> list[date]:
    if not drawing_element.curing_start_date:
        return []
    total_days = drawing_element.curing_duration_days
    if isinstance(total_days, int) and total_days > 0:
        return [drawing_element.curing_start_date + timedelta(days=index) for index in range(total_days)]
    if drawing_element.curing_end_date and drawing_element.curing_end_date >= drawing_element.curing_start_date:
        delta_days = max((drawing_element.curing_end_date - drawing_element.curing_start_date).days, 0)
        return [drawing_element.curing_start_date + timedelta(days=index) for index in range(max(delta_days, 1))]
    return [drawing_element.curing_start_date]


def _serialize_progress_media(media: CuringProgressMedia):
    return {
        "media_id": media.id,
        "file_url": f"/api/progress/media/{media.id}/file",
        "file_type": media.file_type,
        "mime_type": media.mime_type,
        "captured_at": media.captured_at.isoformat() if media.captured_at else None,
        "capture_latitude": media.capture_latitude,
        "capture_longitude": media.capture_longitude,
        "source_type": media.source_type,
    }


def _serialize_presentation_element(element: DrawingElement):
    return {
        "id": element.id,
        "type": element.annotation_type,
        "elementType": element.element_type,
        "memberName": element.member_name or "",
        "color": element.color,
        "pointShape": element.point_shape or "circle",
        "isHidden": bool(element.is_hidden),
        "points": json.loads(element.coordinates_json),
    }


def _build_presentation_navigation(db: Session, current_user: User, current_element: DrawingElement):
    today = date.today()
    if not current_element.curing_start_date or not current_element.curing_end_date:
        return {
            "enabled": False,
            "current_position": None,
            "total": 0,
            "previous_element_id": None,
            "next_element_id": None,
        }
    if not (current_element.curing_start_date <= today <= current_element.curing_end_date):
        return {
            "enabled": False,
            "current_position": None,
            "total": 0,
            "previous_element_id": None,
            "next_element_id": None,
        }

    active_rows = _scoped_element_query(db, current_user).filter(
        DrawingElement.curing_start_date <= today,
        DrawingElement.curing_end_date >= today,
    ).order_by(
        Structure.name.asc(),
        Drawing.name.asc(),
        DrawingPage.sort_order.asc(),
        DrawingElement.member_name.asc(),
        DrawingElement.id.asc(),
    ).all()
    active_ids = [drawing_element.id for drawing_element, *_ in active_rows]
    if current_element.id not in active_ids:
        return {
            "enabled": False,
            "current_position": None,
            "total": len(active_ids),
            "previous_element_id": None,
            "next_element_id": None,
        }

    current_index = active_ids.index(current_element.id)
    return {
        "enabled": len(active_ids) > 1,
        "current_position": current_index + 1,
        "total": len(active_ids),
        "previous_element_id": active_ids[current_index - 1] if current_index > 0 else None,
        "next_element_id": active_ids[current_index + 1] if current_index < len(active_ids) - 1 else None,
    }


def _get_system_setting(db: Session):
    rows = db.execute(
        text("""
            SELECT setting_key, setting_value
            FROM system_settings
            WHERE setting_key IN ('manual_file_entry', 'server_time_offset_hours')
        """)
    ).mappings().all()
    by_key = {row["setting_key"]: row["setting_value"] for row in rows}

    if "manual_file_entry" not in by_key:
        db.execute(
            text("""
                INSERT INTO system_settings (setting_key, setting_value, category, description)
                VALUES ('manual_file_entry', 'yes', 'progress', 'Allow manual photo and video upload in curing progress')
            """)
        )
        by_key["manual_file_entry"] = "yes"
    if "server_time_offset_hours" not in by_key:
        db.execute(
            text("""
                INSERT INTO system_settings (setting_key, setting_value, category, description)
                VALUES ('server_time_offset_hours', '0', 'progress', 'Hour offset to apply on top of server UTC time when capture time falls back to server time')
            """)
        )
        by_key["server_time_offset_hours"] = "0"
    db.commit()

    return {
        "manual_file_entry_enabled": str(by_key["manual_file_entry"]).lower() != "no",
        "server_time_offset_hours": int(by_key["server_time_offset_hours"] or 0),
    }


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
        if structure.id not in grouped:
            grouped[structure.id] = {
                "structure_id": structure.id,
                "structure_name": structure.name,
                "rows": [],
            }
        grouped[structure.id]["rows"].append(
            _build_progress_row_payload(drawing_element, drawing_page, drawing, structure, latest_by_day, today_key)
        )

    return {"structures": list(grouped.values())}


@router.get("/dashboard-summary")
def get_dashboard_summary(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    today = date.today()
    yesterday = today - timedelta(days=1)
    today_key = today.isoformat()
    yesterday_key = yesterday.isoformat()

    declared_query = _scoped_element_query(db, current_user)
    declared_rows = declared_query.all()
    active_today_rows = [row for row in declared_rows if row[0].curing_start_date and row[0].curing_end_date and row[0].curing_start_date <= today <= row[0].curing_end_date]
    active_yesterday_rows = [row for row in declared_rows if row[0].curing_start_date and row[0].curing_end_date and row[0].curing_start_date <= yesterday <= row[0].curing_end_date]

    all_element_ids = [drawing_element.id for drawing_element, *_ in declared_rows]
    latest_progress = _load_latest_progress_map(db, all_element_ids) if all_element_ids else {}

    def count_cured(rows, day_key: str):
        count = 0
        for drawing_element, *_ in rows:
            entry = latest_progress.get(drawing_element.id, {}).get(day_key)
            if entry and entry.did_cure_today:
                count += 1
        return count

    grouped_active: dict[int, dict] = {}
    for drawing_element, drawing_page, drawing, structure, package, project in active_today_rows:
        latest_by_day = latest_progress.get(drawing_element.id, {})
        if structure.id not in grouped_active:
            grouped_active[structure.id] = {
                "structure_id": structure.id,
                "structure_name": structure.name,
                "rows": [],
            }
        grouped_active[structure.id]["rows"].append(
            _build_progress_row_payload(drawing_element, drawing_page, drawing, structure, latest_by_day, today_key)
        )

    flat_active_rows = []
    for group in grouped_active.values():
        for row in group["rows"]:
            flat_active_rows.append(row)

    return {
        "today_status": {
            "cured_count": count_cured(active_today_rows, today_key),
            "active_count": len(active_today_rows),
        },
        "yesterday_status": {
            "cured_count": count_cured(active_yesterday_rows, yesterday_key),
            "active_count": len(active_yesterday_rows),
        },
        "elements_status": {
            "started_count": sum(1 for drawing_element, *_ in declared_rows if drawing_element.curing_start_date is not None),
            "total_declared": len(declared_rows),
        },
        "active_groups": list(grouped_active.values()),
        "active_rows": flat_active_rows,
    }


@router.get("/presentation/{drawing_element_id}")
def get_presentation_payload(
    drawing_element_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    drawing_element, drawing_page, drawing, structure, package, project = _assert_can_access_progress_element(db, current_user, drawing_element_id)
    navigation = _build_presentation_navigation(db, current_user, drawing_element)

    entries = (
        db.query(CuringProgressEntry)
        .filter(CuringProgressEntry.drawing_element_id == drawing_element_id)
        .order_by(CuringProgressEntry.progress_date.asc(), CuringProgressEntry.created_at.asc(), CuringProgressEntry.id.asc())
        .all()
    )
    entry_ids = [entry.id for entry in entries]
    media_rows = (
        db.query(CuringProgressMedia)
        .filter(CuringProgressMedia.progress_entry_id.in_(entry_ids))
        .order_by(CuringProgressMedia.progress_entry_id.asc(), CuringProgressMedia.id.asc())
        .all()
        if entry_ids
        else []
    )
    submitter_ids = sorted({entry.user_id for entry in entries if entry.user_id})
    submitter_map = {
        user.id: (user.full_name or user.username or f"User {user.id}")
        for user in db.query(User).filter(User.id.in_(submitter_ids)).all()
    } if submitter_ids else {}

    media_by_entry: dict[int, list[dict]] = defaultdict(list)
    for media in media_rows:
        media_by_entry[media.progress_entry_id].append(_serialize_progress_media(media))

    entries_by_day: dict[str, list[dict]] = defaultdict(list)
    latest_entry_by_day: dict[str, CuringProgressEntry] = {}
    for entry in entries:
        day_key = entry.progress_date.isoformat()
        serialized_entry = {
            "entry_id": entry.id,
            "created_at": entry.created_at.isoformat() if entry.created_at else None,
            "did_cure_today": bool(entry.did_cure_today),
            "remark": entry.remark,
            "submitted_by": submitter_map.get(entry.user_id, f"User {entry.user_id}"),
            "media": media_by_entry.get(entry.id, []),
        }
        entries_by_day[day_key].append(serialized_entry)
        latest_entry_by_day[day_key] = entry

    today = date.today()
    timeline_dates = _presentation_window_dates(drawing_element)
    timeline_days = []
    missed_days_count = 0
    for day_value in timeline_dates:
        day_key = day_value.isoformat()
        day_entries = entries_by_day.get(day_key, [])
        latest_entry = latest_entry_by_day.get(day_key)
        if latest_entry is None:
            day_status = "no_update"
        else:
            day_status = "cured" if latest_entry.did_cure_today else "not_cured"

        if day_value < today and day_status in {"no_update", "not_cured"}:
            missed_days_count += 1

        timeline_days.append({
            "date": day_key,
            "day_status": day_status,
            "entry_count": len(day_entries),
            "media_count": sum(len(entry["media"]) for entry in day_entries),
            "entries": day_entries,
        })

    total_days = drawing_element.curing_duration_days or max((drawing_element.curing_end_date - drawing_element.curing_start_date).days, 0)
    is_completed = bool(drawing_element.curing_end_date and today > drawing_element.curing_end_date)

    return {
        "drawing_element_id": drawing_element.id,
        "element_name": drawing_element.member_name or drawing_element.element_type,
        "structure_name": structure.name,
        "plan_name": drawing.name,
        "page_name": drawing_page.name,
        "drawing_id": drawing.id,
        "drawing_page_id": drawing_page.id,
        "page_id": drawing_page.page_ref,
        "page_kind": drawing_page.kind,
        "page_number": drawing_page.source_page_number,
        "drawing_asset_kind": drawing.asset_kind,
        "start_date": drawing_element.curing_start_date.isoformat() if drawing_element.curing_start_date else None,
        "end_date": drawing_element.curing_end_date.isoformat() if drawing_element.curing_end_date else None,
        "total_days": total_days,
        "missed_days_count": missed_days_count,
        "is_completed": is_completed,
        "element_annotation": _serialize_presentation_element(drawing_element),
        "navigation": navigation,
        "timeline_days": timeline_days,
    }


@router.get("/media/{media_id}/file")
def get_progress_media_file(
    media_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    media = (
        db.query(CuringProgressMedia, CuringProgressEntry)
        .join(CuringProgressEntry, CuringProgressMedia.progress_entry_id == CuringProgressEntry.id)
        .filter(CuringProgressMedia.id == media_id)
        .first()
    )
    if not media:
        raise HTTPException(status_code=404, detail="Progress media not found")

    media_row, entry_row = media
    _assert_can_access_progress_element(db, current_user, entry_row.drawing_element_id)
    if not os.path.exists(media_row.file_path):
        raise HTTPException(status_code=404, detail="Progress media file not found on server")

    return FileResponse(
        path=media_row.file_path,
        filename=os.path.basename(media_row.file_path),
        media_type=media_row.mime_type or None,
    )


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
