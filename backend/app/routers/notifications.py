from datetime import datetime
import re

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.app.core.auth import get_current_user
from backend.app.core.database import get_db
from backend.app.models.notifications import (
    StructureNotificationScheduleSlot,
    StructureNotificationSetting,
    WebNotification,
)
from backend.app.models.users import User, UserRole
from backend.app.schemas.notifications import (
    CustomNotificationCreate,
    StructureNotificationScheduleSlotCreate,
    StructureNotificationScheduleSlotResponse,
    StructureNotificationScheduleSlotUpdate,
    StructureNotificationSettingResponse,
    StructureNotificationSettingUpdate,
    WebNotificationResponse,
)
from backend.app.services.notification_service import (
    build_structure_message_draft,
    create_web_notification,
    ensure_structure_notification_defaults,
    get_sms_sender_id,
    get_system_setting_map,
    is_sms_result_failed,
    is_whatsapp_result_failed,
)
from backend.app.services.sms_service import SMSService
from backend.app.services.whatsapp_service import WhatsAppService

router = APIRouter(prefix="/api/notifications", tags=["Notifications"])

TIME_RE = re.compile(r"^(?:[01]\d|2[0-3]):[0-5]\d$")


def _validate_slot_time(value: str) -> str:
    normalized = (value or "").strip()
    if not TIME_RE.match(normalized):
        raise HTTPException(status_code=400, detail="Notification time must use HH:MM format.")
    return normalized


def _ensure_owned_structure(db: Session, structure_id: int, monitor_id: int):
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
        {"structure_id": structure_id, "monitor_id": monitor_id},
    ).mappings().first()
    if not owned_structure:
        raise HTTPException(status_code=404, detail="Structure not found")


def _slot_response(slot: StructureNotificationScheduleSlot) -> StructureNotificationScheduleSlotResponse:
    return StructureNotificationScheduleSlotResponse(
        id=slot.id,
        notification_time=slot.notification_time,
        is_enabled=slot.is_enabled,
    )


def _settings_response(setting: StructureNotificationSetting, slots: list[StructureNotificationScheduleSlot]) -> StructureNotificationSettingResponse:
    return StructureNotificationSettingResponse(
        structure_id=setting.structure_id,
        auto_sms_enabled=setting.auto_sms_enabled,
        auto_web_enabled=setting.auto_web_enabled,
        auto_whatsapp_enabled=setting.auto_whatsapp_enabled,
        slots=[_slot_response(slot) for slot in slots],
    )


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

    structure_rows = db.execute(
        text(
            """
        SELECT s.id AS structure_id
        FROM structures s
        JOIN packages p ON p.id = s.package_id
        JOIN projects pr ON pr.id = p.project_id
        WHERE pr.user_id = :monitor_id AND pr.is_deleted = 0 AND p.is_deleted = 0 AND s.is_deleted = 0
        ORDER BY s.id ASC
        """
        ),
        {"monitor_id": current_user.id},
    ).mappings().all()

    response: list[StructureNotificationSettingResponse] = []
    for row in structure_rows:
        setting, slots = ensure_structure_notification_defaults(db, row["structure_id"])
        response.append(_settings_response(setting, slots))
    db.commit()
    return response


@router.get("/structures/{structure_id}/draft")
def get_structure_notification_draft(
    structure_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != UserRole.MONITOR:
        raise HTTPException(status_code=403, detail="Only monitor admin can view structure notification drafts.")
    try:
        return build_structure_message_draft(db, structure_id=structure_id, current_user=current_user)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.patch("/structures/{structure_id}/settings", response_model=StructureNotificationSettingResponse)
def update_structure_notification_setting(
    structure_id: int,
    payload: StructureNotificationSettingUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != UserRole.MONITOR:
        raise HTTPException(status_code=403, detail="Only monitor admin can update structure notification settings.")

    _ensure_owned_structure(db, structure_id, current_user.id)
    setting, slots = ensure_structure_notification_defaults(db, structure_id)

    if payload.auto_sms_enabled is not None:
        setting.auto_sms_enabled = payload.auto_sms_enabled
    if payload.auto_web_enabled is not None:
        setting.auto_web_enabled = payload.auto_web_enabled
    if payload.auto_whatsapp_enabled is not None:
        setting.auto_whatsapp_enabled = payload.auto_whatsapp_enabled

    db.commit()
    db.refresh(setting)
    return _settings_response(setting, slots)


@router.post("/structures/{structure_id}/slots", response_model=StructureNotificationScheduleSlotResponse)
def create_structure_notification_slot(
    structure_id: int,
    payload: StructureNotificationScheduleSlotCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != UserRole.MONITOR:
        raise HTTPException(status_code=403, detail="Only monitor admin can add structure notification times.")

    _ensure_owned_structure(db, structure_id, current_user.id)
    ensure_structure_notification_defaults(db, structure_id)
    normalized_time = _validate_slot_time(payload.notification_time)

    duplicate = db.query(StructureNotificationScheduleSlot).filter(
        StructureNotificationScheduleSlot.structure_id == structure_id,
        StructureNotificationScheduleSlot.notification_time == normalized_time,
    ).first()
    if duplicate:
        raise HTTPException(status_code=400, detail="This structure already has that notification time.")

    slot = StructureNotificationScheduleSlot(
        structure_id=structure_id,
        notification_time=normalized_time,
        is_enabled=True,
    )
    db.add(slot)
    db.commit()
    db.refresh(slot)
    return _slot_response(slot)


@router.patch("/structures/{structure_id}/slots/{slot_id}", response_model=StructureNotificationScheduleSlotResponse)
def update_structure_notification_slot(
    structure_id: int,
    slot_id: int,
    payload: StructureNotificationScheduleSlotUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != UserRole.MONITOR:
        raise HTTPException(status_code=403, detail="Only monitor admin can update structure notification times.")

    _ensure_owned_structure(db, structure_id, current_user.id)
    slot = db.query(StructureNotificationScheduleSlot).filter(
        StructureNotificationScheduleSlot.id == slot_id,
        StructureNotificationScheduleSlot.structure_id == structure_id,
    ).first()
    if not slot:
        raise HTTPException(status_code=404, detail="Notification time not found.")

    if payload.notification_time is not None:
        normalized_time = _validate_slot_time(payload.notification_time)
        duplicate = db.query(StructureNotificationScheduleSlot).filter(
            StructureNotificationScheduleSlot.structure_id == structure_id,
            StructureNotificationScheduleSlot.notification_time == normalized_time,
            StructureNotificationScheduleSlot.id != slot_id,
        ).first()
        if duplicate:
            raise HTTPException(status_code=400, detail="This structure already has that notification time.")
        slot.notification_time = normalized_time

    if payload.is_enabled is not None:
        slot.is_enabled = payload.is_enabled

    db.commit()
    db.refresh(slot)
    return _slot_response(slot)


@router.delete("/structures/{structure_id}/slots/{slot_id}")
def delete_structure_notification_slot(
    structure_id: int,
    slot_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != UserRole.MONITOR:
        raise HTTPException(status_code=403, detail="Only monitor admin can delete structure notification times.")

    _ensure_owned_structure(db, structure_id, current_user.id)
    slot = db.query(StructureNotificationScheduleSlot).filter(
        StructureNotificationScheduleSlot.id == slot_id,
        StructureNotificationScheduleSlot.structure_id == structure_id,
    ).first()
    if not slot:
        raise HTTPException(status_code=404, detail="Notification time not found.")

    db.delete(slot)
    db.commit()
    return {"status": "success"}


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
    whatsapp_api_key = system_settings.get("whatsapp_api_key", "")

    message = payload.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    channel = (payload.channel or "sms").strip().lower()
    if channel == "sms":
        sms_result = SMSService.send_sms(
            recipients=[contractor.mobile_number],
            sender_id=sms_sender_id,
            message=message,
            api_key=sms_api_key,
        )
        if is_sms_result_failed(sms_result):
            raise HTTPException(status_code=400, detail=f"SMS provider rejected the message: {sms_result.get('message', 'Unknown error')}")
        transport_result = sms_result
    elif channel == "whatsapp":
        whatsapp_result = WhatsAppService.send_text_message(
            api_key=whatsapp_api_key,
            to_number=contractor.mobile_number,
            message=message,
        )
        if is_whatsapp_result_failed(whatsapp_result):
            raise HTTPException(status_code=400, detail=f"WhatsApp provider rejected the message: {whatsapp_result.get('message', 'Unknown error')}")
        transport_result = whatsapp_result
    else:
        raise HTTPException(status_code=400, detail="Unsupported notification channel")

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

    return {"status": "success", "channel": channel, "provider_result": transport_result}
