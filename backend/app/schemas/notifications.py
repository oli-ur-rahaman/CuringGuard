from datetime import date, datetime
from pydantic import BaseModel
from typing import Optional


class StructureNotificationScheduleSlotResponse(BaseModel):
    id: int
    notification_time: str
    is_enabled: bool


class StructureNotificationSettingResponse(BaseModel):
    structure_id: int
    auto_sms_enabled: bool
    auto_web_enabled: bool
    auto_whatsapp_enabled: bool
    slots: list[StructureNotificationScheduleSlotResponse]


class StructureNotificationSettingUpdate(BaseModel):
    auto_sms_enabled: Optional[bool] = None
    auto_web_enabled: Optional[bool] = None
    auto_whatsapp_enabled: Optional[bool] = None


class StructureNotificationScheduleSlotCreate(BaseModel):
    notification_time: str


class StructureNotificationScheduleSlotUpdate(BaseModel):
    notification_time: Optional[str] = None
    is_enabled: Optional[bool] = None


class CustomNotificationCreate(BaseModel):
    contractor_id: int
    message: str
    structure_id: Optional[int] = None
    channel: Optional[str] = "sms"


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
