from datetime import datetime
from pydantic import BaseModel
from typing import Optional


class SystemSettingResponse(BaseModel):
    manual_file_entry_enabled: bool
    server_time_offset_hours: int
    server_now_utc: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class SystemSettingUpdate(BaseModel):
    manual_file_entry_enabled: Optional[bool] = None
    server_time_offset_hours: Optional[int] = None
