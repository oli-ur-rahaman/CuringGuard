from sqlalchemy import Boolean, Column, Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.sql import func

from backend.app.core.database import Base


class StructureNotificationSetting(Base):
    __tablename__ = "structure_notification_settings"

    id = Column(Integer, primary_key=True, index=True)
    structure_id = Column(Integer, ForeignKey("structures.id"), nullable=False, index=True)
    notification_time = Column(String(5), nullable=True)
    auto_sms_enabled = Column(Boolean, nullable=False, default=False)
    auto_web_enabled = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())


class WebNotification(Base):
    __tablename__ = "web_notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    sender_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    structure_id = Column(Integer, ForeignKey("structures.id"), nullable=True, index=True)
    title = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)
    notification_type = Column(String(50), nullable=False, default="custom")
    channel = Column(String(32), nullable=False, default="web")
    is_read = Column(Boolean, nullable=False, default=False)
    dispatch_date = Column(Date, nullable=True, index=True)
    created_at = Column(DateTime, default=func.now())
    read_at = Column(DateTime, nullable=True)


class NotificationDispatchLog(Base):
    __tablename__ = "notification_dispatch_logs"

    id = Column(Integer, primary_key=True, index=True)
    structure_id = Column(Integer, ForeignKey("structures.id"), nullable=False, index=True)
    contractor_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    channel = Column(String(32), nullable=False)
    dispatch_type = Column(String(50), nullable=False)
    dispatch_date = Column(Date, nullable=False, index=True)
    created_at = Column(DateTime, default=func.now())
