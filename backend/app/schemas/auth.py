from pydantic import BaseModel, Field
from typing import Optional

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: Optional[str] = None


class ForgotPasswordStartRequest(BaseModel):
    username: str = Field(..., min_length=3)
    mobile_number: str = Field(..., pattern=r"^\d{11}$")


class ForgotPasswordStartResponse(BaseModel):
    request_id: int
    message: str


class ForgotPasswordVerifyRequest(BaseModel):
    request_id: int
    mobile_number: str = Field(..., pattern=r"^\d{11}$")
    otp: str = Field(..., pattern=r"^\d{6}$")


class ForgotPasswordVerifyResponse(BaseModel):
    reset_token: str
    message: str


class ForgotPasswordResetRequest(BaseModel):
    request_id: int
    mobile_number: str = Field(..., pattern=r"^\d{11}$")
    reset_token: str = Field(..., min_length=16)
    new_password: str = Field(..., min_length=6)
