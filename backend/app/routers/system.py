from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text

from backend.app.core.auth import get_current_user
from backend.app.core.database import get_db
from backend.app.models.users import User, UserRole
from backend.app.schemas.system import SystemSettingResponse, SystemSettingUpdate

router = APIRouter(prefix="/api/system", tags=["System"])


def _get_or_create_system_setting(db: Session) -> dict:
    row = db.execute(
        text("""
            SELECT id, setting_value
            FROM system_settings
            WHERE setting_key = 'manual_file_entry'
            ORDER BY id ASC
            LIMIT 1
        """)
    ).mappings().first()
    if row:
        return {
            "manual_file_entry_enabled": str(row["setting_value"]).lower() != "no",
            "updated_at": None,
        }

    db.execute(
        text("""
            INSERT INTO system_settings (setting_key, setting_value, category, description)
            VALUES ('manual_file_entry', 'yes', 'progress', 'Allow manual photo and video upload in curing progress')
        """)
    )
    db.commit()
    return {
        "manual_file_entry_enabled": True,
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
    _get_or_create_system_setting(db)
    db.execute(
        text("UPDATE system_settings SET setting_value = :value WHERE setting_key = 'manual_file_entry'"),
        {"value": "yes" if payload.manual_file_entry_enabled else "no"},
    )
    db.commit()
    return {
        "manual_file_entry_enabled": payload.manual_file_entry_enabled,
        "updated_at": None,
    }
