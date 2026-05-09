from datetime import datetime
from pydantic import BaseModel
from typing import Optional


class SystemSettingResponse(BaseModel):
    manual_file_entry_enabled: bool
    server_time_offset_hours: int
    sms_api_key: str
    sms_sender_id: str
    whatsapp_api_key: str
    automatic_message_format: str
    server_now_utc: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class SystemSettingUpdate(BaseModel):
    manual_file_entry_enabled: Optional[bool] = None
    server_time_offset_hours: Optional[int] = None
    sms_api_key: Optional[str] = None
    sms_sender_id: Optional[str] = None
    whatsapp_api_key: Optional[str] = None
    automatic_message_format: Optional[str] = None
