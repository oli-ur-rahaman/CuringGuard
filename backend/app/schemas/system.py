from datetime import datetime
from pydantic import BaseModel
from typing import Optional


class SystemSettingResponse(BaseModel):
    manual_file_entry_enabled: bool
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class SystemSettingUpdate(BaseModel):
    manual_file_entry_enabled: bool
