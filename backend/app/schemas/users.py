from pydantic import BaseModel, Field
from typing import Optional
from backend.app.models.users import UserRole

class UserBase(BaseModel):
    username: str
    email: str
    full_name: Optional[str] = None
    role: UserRole
    mobile_number: str = Field(..., min_length=11, max_length=11, description="Exactly 11 digits")
    is_active: bool = True

class UserCreate(UserBase):
    password: str = Field(..., min_length=6, description="Password must be at least 6 characters")

class UserResponse(UserBase):
    id: int
    created_by_monitor_id: Optional[int] = None
    notification_additional_message: Optional[str] = None

    class Config:
        from_attributes = True
