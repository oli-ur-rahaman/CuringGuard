from pydantic import BaseModel
from typing import Optional

class CuringRuleBase(BaseModel):
    element_name: str
    geometry_type: str
    required_curing_days: int
    is_active: bool = True

class CuringRuleCreate(CuringRuleBase):
    pass

class CuringRuleResponse(CuringRuleBase):
    id: int

    class Config:
        from_attributes = True
