from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class GatewayBase(BaseModel):
    serial_number: str
    location: Optional[str] = None
    firmware_version: Optional[str] = None
    is_active: bool = True

class GatewayCreate(GatewayBase):
    pass

class GatewayResponse(GatewayBase):
    id: int
    is_online: bool
    last_ping: Optional[datetime]

    class Config:
        from_attributes = True
