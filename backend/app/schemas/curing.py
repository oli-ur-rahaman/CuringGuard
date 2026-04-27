from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class CuringLogCreate(BaseModel):
    element_id: str
    contractor_id: int

class GeometryElementResponse(BaseModel):
    element_id: str
    drawing_id: int
    element_type: str
    coordinates_json: str
    contractor_id: Optional[int] = None
    poured_date: Optional[datetime] = None
    curing_end_date: Optional[datetime] = None
    sms_sent: bool

    class Config:
        from_attributes = True
        from_attributes = True # Pydantic V2 compat
