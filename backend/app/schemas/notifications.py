from datetime import date, datetime
from pydantic import BaseModel
from typing import Optional


class StructureNotificationSettingResponse(BaseModel):
    structure_id: int
    notification_time: Optional[str] = None
    auto_sms_enabled: bool
    auto_web_enabled: bool


class StructureNotificationSettingUpdate(BaseModel):
    notification_time: Optional[str] = None
    auto_sms_enabled: Optional[bool] = None
    auto_web_enabled: Optional[bool] = None


class CustomNotificationCreate(BaseModel):
    contractor_id: int
    message: str
    structure_id: Optional[int] = None


class WebNotificationResponse(BaseModel):
    id: int
    title: str
    message: str
    notification_type: str
    channel: str
    is_read: bool
    structure_id: Optional[int] = None
    dispatch_date: Optional[date] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True
