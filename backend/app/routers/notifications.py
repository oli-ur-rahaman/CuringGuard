from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.app.core.auth import get_current_user
from backend.app.core.database import get_db
from backend.app.models.notifications import StructureNotificationSetting, WebNotification
from backend.app.models.system import SystemSetting
from backend.app.models.users import User, UserRole
from backend.app.schemas.notifications import (
    CustomNotificationCreate,
    StructureNotificationSettingResponse,
    StructureNotificationSettingUpdate,
    WebNotificationResponse,
)
from backend.app.services.notification_service import create_web_notification, get_sms_sender_id, get_system_setting_map, is_sms_result_failed
from backend.app.services.sms_service import SMSService

router = APIRouter(prefix="/api/notifications", tags=["Notifications"])


@router.get("/web", response_model=list[WebNotificationResponse])
def get_web_notifications(
    unread_only: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(WebNotification).filter(WebNotification.user_id == current_user.id)
    if unread_only:
        query = query.filter(WebNotification.is_read == False)
    return query.order_by(WebNotification.created_at.desc(), WebNotification.id.desc()).limit(50).all()


@router.post("/web/{notification_id}/read")
def mark_web_notification_read(notification_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    notification = db.query(WebNotification).filter(
        WebNotification.id == notification_id,
        WebNotification.user_id == current_user.id,
    ).first()
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    notification.is_read = True
    notification.read_at = datetime.utcnow()
    db.commit()
    return {"status": "success"}


@router.get("/structure-settings", response_model=list[StructureNotificationSettingResponse])
def get_structure_notification_settings(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != UserRole.MONITOR:
        raise HTTPException(status_code=403, detail="Only monitor admin can view structure notification settings.")

    rows = db.execute(
        text(
            """
        SELECT s.id AS structure_id, sns.notification_time, sns.auto_sms_enabled, sns.auto_web_enabled
        FROM structures s
        JOIN packages p ON p.id = s.package_id
        JOIN projects pr ON pr.id = p.project_id
        LEFT JOIN structure_notification_settings sns ON sns.structure_id = s.id
        WHERE pr.user_id = :monitor_id AND pr.is_deleted = 0 AND p.is_deleted = 0 AND s.is_deleted = 0
        ORDER BY s.id ASC
        """
        ),
        {"monitor_id": current_user.id},
    ).mappings().all()
    response = []
    for row in rows:
        response.append(
            StructureNotificationSettingResponse(
                structure_id=row["structure_id"],
                notification_time=row["notification_time"] or "08:00",
                auto_sms_enabled=bool(row["auto_sms_enabled"]) if row["auto_sms_enabled"] is not None else False,
                auto_web_enabled=bool(row["auto_web_enabled"]) if row["auto_web_enabled"] is not None else True,
            )
        )
    return response


@router.patch("/structures/{structure_id}/settings", response_model=StructureNotificationSettingResponse)
def update_structure_notification_setting(
    structure_id: int,
    payload: StructureNotificationSettingUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != UserRole.MONITOR:
        raise HTTPException(status_code=403, detail="Only monitor admin can update structure notification settings.")

    owned_structure = db.execute(
        text(
            """
        SELECT s.id
        FROM structures s
        JOIN packages p ON p.id = s.package_id
        JOIN projects pr ON pr.id = p.project_id
        WHERE s.id = :structure_id AND pr.user_id = :monitor_id AND pr.is_deleted = 0 AND p.is_deleted = 0 AND s.is_deleted = 0
        """
        ),
        {"structure_id": structure_id, "monitor_id": current_user.id},
    ).mappings().first()
    if not owned_structure:
        raise HTTPException(status_code=404, detail="Structure not found")

    setting = db.query(StructureNotificationSetting).filter(StructureNotificationSetting.structure_id == structure_id).first()
    if not setting:
        setting = StructureNotificationSetting(
            structure_id=structure_id,
            notification_time="08:00",
            auto_sms_enabled=False,
            auto_web_enabled=True,
        )
        db.add(setting)
        db.flush()

    if payload.notification_time is not None:
        setting.notification_time = payload.notification_time
    if payload.auto_sms_enabled is not None:
        setting.auto_sms_enabled = payload.auto_sms_enabled
    if payload.auto_web_enabled is not None:
        setting.auto_web_enabled = payload.auto_web_enabled

    db.commit()
    db.refresh(setting)
    return StructureNotificationSettingResponse(
        structure_id=setting.structure_id,
        notification_time=setting.notification_time,
        auto_sms_enabled=setting.auto_sms_enabled,
        auto_web_enabled=setting.auto_web_enabled,
    )


@router.post("/custom-message")
def send_custom_notification(
    payload: CustomNotificationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != UserRole.MONITOR:
        raise HTTPException(status_code=403, detail="Only monitor admin can send custom contractor messages.")

    contractor = db.query(User).filter(
        User.id == payload.contractor_id,
        User.role == UserRole.CONTRACTOR,
        User.created_by_monitor_id == current_user.id,
    ).first()
    if not contractor:
        raise HTTPException(status_code=404, detail="Contractor not found")

    system_settings = get_system_setting_map(db)
    sms_api_key = system_settings.get("sms_api_key", "")
    sms_sender_id = get_sms_sender_id(system_settings)

    sender_name = (current_user.full_name or current_user.username or "CuringGuard").strip()
    message = payload.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    sms_result = SMSService.send_sms(
        recipients=[contractor.mobile_number],
        sender_id=sms_sender_id,
        message=message,
        api_key=sms_api_key,
    )
    if is_sms_result_failed(sms_result):
        raise HTTPException(status_code=400, detail=f"SMS provider rejected the message: {sms_result.get('message', 'Unknown error')}")

    create_web_notification(
        db,
        user_id=contractor.id,
        sender_user_id=current_user.id,
        structure_id=payload.structure_id,
        title="Instruction from Monitor Admin",
        message=message,
        notification_type="custom_message",
        channel="web",
    )
    db.commit()

    return {"status": "success", "sms_result": sms_result}
