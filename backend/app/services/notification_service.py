from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.app.models.curing import DrawingElement
from backend.app.models.hierarchy import Drawing, Package, Project, Structure
from backend.app.models.notifications import (
    NotificationDispatchLog,
    StructureNotificationSetting,
    WebNotification,
)
from backend.app.models.users import User
from backend.app.services.sms_service import SMSService


def get_system_setting_map(db: Session) -> dict[str, str]:
    rows = db.execute(
        text(
            """
            SELECT setting_key, setting_value
            FROM system_settings
            WHERE setting_key IN ('server_time_offset_hours', 'sms_api_key', 'automatic_message_format')
            """
        )
    ).mappings().all()
    setting_map = {row["setting_key"]: row["setting_value"] for row in rows}
    if "server_time_offset_hours" not in setting_map:
        db.execute(
            text(
                """
                INSERT INTO system_settings (setting_key, setting_value, category, description)
                VALUES ('server_time_offset_hours', '0', 'progress', 'Hour offset to apply on top of server UTC time when capture time falls back to server time')
                """
            )
        )
        setting_map["server_time_offset_hours"] = "0"
    if "sms_api_key" not in setting_map:
        db.execute(
            text(
                """
                INSERT INTO system_settings (setting_key, setting_value, category, description)
                VALUES ('sms_api_key', '', 'notifications', 'Green Heritage IT SMS API key')
                """
            )
        )
        setting_map["sms_api_key"] = ""
    if "automatic_message_format" not in setting_map:
        db.execute(
            text(
                """
                INSERT INTO system_settings (setting_key, setting_value, category, description)
                VALUES (
                    'automatic_message_format',
                    'Dear {contractor_name}, please carry out curing for structure {structure_name} today and submit the progress update in CuringGuard.',
                    'notifications',
                    'Automatic message template for scheduled structure reminders'
                )
                """
            )
        )
        setting_map["automatic_message_format"] = "Dear {contractor_name}, please carry out curing for structure {structure_name} today and submit the progress update in CuringGuard."
    db.commit()
    return setting_map


def get_local_now(db: Session) -> datetime:
    setting_map = get_system_setting_map(db)
    offset_hours = int(setting_map.get("server_time_offset_hours") or 0)
    return datetime.now(timezone.utc) + timedelta(hours=offset_hours)


def render_automatic_message(template: str, *, contractor_name: str, monitor_name: str, structure_name: str, active_elements_count: int, current_date: date) -> str:
    return template.format(
        contractor_name=contractor_name,
        monitor_name=monitor_name,
        structure_name=structure_name,
        active_elements_count=active_elements_count,
        date=current_date.isoformat(),
    )


def create_web_notification(
    db: Session,
    *,
    user_id: int,
    sender_user_id: int | None,
    structure_id: int | None,
    title: str,
    message: str,
    notification_type: str,
    channel: str = "web",
    dispatch_date: date | None = None,
) -> WebNotification:
    notification = WebNotification(
        user_id=user_id,
        sender_user_id=sender_user_id,
        structure_id=structure_id,
        title=title,
        message=message,
        notification_type=notification_type,
        channel=channel,
        dispatch_date=dispatch_date,
    )
    db.add(notification)
    db.flush()
    return notification


def _get_active_structure_rows(db: Session, target_date: date):
    rows = (
        db.query(
            Structure.id.label("structure_id"),
            Structure.name.label("structure_name"),
            Structure.contractor_id.label("contractor_id"),
            Project.user_id.label("monitor_user_id"),
            User.full_name.label("contractor_name"),
            User.mobile_number.label("contractor_mobile"),
            DrawingElement.id.label("element_id"),
        )
        .join(Drawing, Drawing.structure_id == Structure.id)
        .join(Package, Package.id == Structure.package_id)
        .join(Project, Project.id == Package.project_id)
        .join(DrawingElement, DrawingElement.drawing_id == Drawing.id)
        .join(User, User.id == Structure.contractor_id)
        .filter(
            Structure.is_deleted == False,
            Package.is_deleted == False,
            Project.is_deleted == False,
            Structure.contractor_id != None,
            DrawingElement.curing_start_date != None,
            DrawingElement.curing_end_date != None,
            DrawingElement.curing_start_date <= target_date,
            DrawingElement.curing_end_date >= target_date,
        )
        .all()
    )
    grouped: dict[int, dict] = defaultdict(lambda: {"active_elements_count": 0})
    for row in rows:
        current = grouped[row.structure_id]
        current.update(
            {
                "structure_id": row.structure_id,
                "structure_name": row.structure_name,
                "contractor_id": row.contractor_id,
                "monitor_user_id": row.monitor_user_id,
                "contractor_name": row.contractor_name,
                "contractor_mobile": row.contractor_mobile,
            }
        )
        current["active_elements_count"] += 1
    return list(grouped.values())


def process_daily_structure_notifications(db: Session) -> None:
    local_now = get_local_now(db)
    today = local_now.date()
    current_hhmm = local_now.strftime("%H:%M")
    settings = get_system_setting_map(db)
    template = settings.get("automatic_message_format") or ""

    active_structures = _get_active_structure_rows(db, today)
    if not active_structures:
        return

    monitor_ids = {row["monitor_user_id"] for row in active_structures if row["monitor_user_id"]}
    monitor_map = {
        user.id: user
        for user in db.query(User).filter(User.id.in_(monitor_ids)).all()
    } if monitor_ids else {}

    for row in active_structures:
        structure_setting = (
            db.query(StructureNotificationSetting)
            .filter(StructureNotificationSetting.structure_id == row["structure_id"])
            .first()
        )
        if not structure_setting:
            structure_setting = StructureNotificationSetting(
                structure_id=row["structure_id"],
                notification_time="08:00",
                auto_sms_enabled=False,
                auto_web_enabled=True,
            )
            db.add(structure_setting)
            db.flush()

        monitor = monitor_map.get(row["monitor_user_id"])
        monitor_name = monitor.full_name if monitor and monitor.full_name else (monitor.username if monitor else "CuringGuard")
        contractor_name = row["contractor_name"] or "Contractor"
        message = render_automatic_message(
            template,
            contractor_name=contractor_name,
            monitor_name=monitor_name,
            structure_name=row["structure_name"],
            active_elements_count=row["active_elements_count"],
            current_date=today,
        )

        if structure_setting.auto_web_enabled:
            existing_web = (
                db.query(NotificationDispatchLog)
                .filter(
                    NotificationDispatchLog.structure_id == row["structure_id"],
                    NotificationDispatchLog.contractor_id == row["contractor_id"],
                    NotificationDispatchLog.channel == "web",
                    NotificationDispatchLog.dispatch_type == "daily",
                    NotificationDispatchLog.dispatch_date == today,
                )
                .first()
            )
            if not existing_web:
                create_web_notification(
                    db,
                    user_id=row["contractor_id"],
                    sender_user_id=row["monitor_user_id"],
                    structure_id=row["structure_id"],
                    title=f"Curing Reminder: {row['structure_name']}",
                    message=message,
                    notification_type="daily_curing",
                    channel="web",
                    dispatch_date=today,
                )
                db.add(
                    NotificationDispatchLog(
                        structure_id=row["structure_id"],
                        contractor_id=row["contractor_id"],
                        channel="web",
                        dispatch_type="daily",
                        dispatch_date=today,
                    )
                )

        if structure_setting.auto_sms_enabled and structure_setting.notification_time == current_hhmm:
            existing_sms = (
                db.query(NotificationDispatchLog)
                .filter(
                    NotificationDispatchLog.structure_id == row["structure_id"],
                    NotificationDispatchLog.contractor_id == row["contractor_id"],
                    NotificationDispatchLog.channel == "sms",
                    NotificationDispatchLog.dispatch_type == "scheduled",
                    NotificationDispatchLog.dispatch_date == today,
                )
                .first()
            )
            if not existing_sms and row["contractor_mobile"]:
                SMSService.send_sms(
                    recipients=[row["contractor_mobile"]],
                    sender_id=monitor_name,
                    message=message,
                )
                db.add(
                    NotificationDispatchLog(
                        structure_id=row["structure_id"],
                        contractor_id=row["contractor_id"],
                        channel="sms",
                        dispatch_type="scheduled",
                        dispatch_date=today,
                    )
                )

    db.commit()
