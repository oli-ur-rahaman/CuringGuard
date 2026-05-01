from datetime import date, datetime
from pydantic import BaseModel
from typing import List, Optional


class ProgressMediaResponse(BaseModel):
    id: int
    file_path: str
    file_type: str
    mime_type: Optional[str] = None
    duration_seconds: Optional[int] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ProgressEntryResponse(BaseModel):
    id: int
    drawing_element_id: str
    user_id: int
    progress_date: date
    did_cure_today: bool
    remark: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    media: List[ProgressMediaResponse] = []

    class Config:
        from_attributes = True
