from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class CuringRuleBase(BaseModel):
    element_name: str
    geometry_type: str
    required_curing_days: int
    description: Optional[str] = None
    is_active: bool = True

class CuringRuleCreate(CuringRuleBase):
    pass

class CuringRuleResponse(CuringRuleBase):
    id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
