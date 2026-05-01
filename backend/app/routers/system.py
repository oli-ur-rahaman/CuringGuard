from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import datetime, timezone

from backend.app.core.auth import get_current_user
from backend.app.core.database import get_db
from backend.app.models.users import User, UserRole
from backend.app.schemas.system import SystemSettingResponse, SystemSettingUpdate

router = APIRouter(prefix="/api/system", tags=["System"])


def _ensure_setting_row(db: Session, key: str, value: str, category: str, description: str):
    row = db.execute(
        text("""
            SELECT id, setting_value
            FROM system_settings
            WHERE setting_key = :key
            ORDER BY id ASC
            LIMIT 1
        """),
        {"key": key},
    ).mappings().first()
    if row:
        return row

    db.execute(
        text("""
            INSERT INTO system_settings (setting_key, setting_value, category, description)
            VALUES (:key, :value, :category, :description)
        """),
        {
            "key": key,
            "value": value,
            "category": category,
            "description": description,
        },
    )
    db.commit()
    return db.execute(
        text("""
            SELECT id, setting_value
            FROM system_settings
            WHERE setting_key = :key
            ORDER BY id ASC
            LIMIT 1
        """),
        {"key": key},
    ).mappings().first()


def _get_or_create_system_setting(db: Session) -> dict:
    manual_row = _ensure_setting_row(
        db,
        "manual_file_entry",
        "yes",
        "progress",
        "Allow manual photo and video upload in curing progress",
    )
    offset_row = _ensure_setting_row(
        db,
        "server_time_offset_hours",
        "0",
        "progress",
        "Hour offset to apply on top of server UTC time when capture time falls back to server time",
    )
    return {
        "manual_file_entry_enabled": str(manual_row["setting_value"]).lower() != "no",
        "server_time_offset_hours": int(offset_row["setting_value"] or 0),
        "server_now_utc": datetime.now(timezone.utc),
        "updated_at": None,
    }


@router.get("/settings", response_model=SystemSettingResponse)
def get_system_settings(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role not in {UserRole.SUPERADMIN, UserRole.MONITOR, UserRole.CONTRACTOR}:
        raise HTTPException(status_code=403, detail="Forbidden")
    return _get_or_create_system_setting(db)


@router.patch("/settings", response_model=SystemSettingResponse)
def update_system_settings(
    payload: SystemSettingUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != UserRole.SUPERADMIN:
        raise HTTPException(status_code=403, detail="Only superadmin can update system settings.")
    current = _get_or_create_system_setting(db)
    manual_enabled = current["manual_file_entry_enabled"] if payload.manual_file_entry_enabled is None else payload.manual_file_entry_enabled
    server_offset = current["server_time_offset_hours"] if payload.server_time_offset_hours is None else payload.server_time_offset_hours
    db.execute(
        text("UPDATE system_settings SET setting_value = :value WHERE setting_key = 'manual_file_entry'"),
        {"value": "yes" if manual_enabled else "no"},
    )
    db.execute(
        text("UPDATE system_settings SET setting_value = :value WHERE setting_key = 'server_time_offset_hours'"),
        {"value": str(int(server_offset))},
    )
    db.commit()
    return {
        "manual_file_entry_enabled": manual_enabled,
        "server_time_offset_hours": int(server_offset),
        "server_now_utc": datetime.now(timezone.utc),
        "updated_at": None,
    }
