from sqlalchemy import Column, Integer, String, Enum, ForeignKey, DateTime, Text
from sqlalchemy.sql import func
from sqlalchemy.orm import validates
from backend.app.core.database import Base
import enum
import re

class UserRole(enum.Enum):
    SUPERADMIN = "superadmin"
    MONITOR = "monitor"
    CONTRACTOR = "contractor"

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(255), unique=True, index=True, nullable=False)
    email = Column(String(255), unique=True, nullable=True, default="superadmin@curingguard.com")
    hashed_password = Column(String(255), nullable=False)
    role = Column(Enum(UserRole), nullable=False)
    is_active = Column(Integer, default=1) # 1 for active, 0 for suspended
    
    # The crucial 11-digit mobile number for SMS dispatch
    mobile_number = Column(String(11), nullable=False)
    
    full_name = Column(String(255), nullable=True)
    notification_additional_message = Column(Text, nullable=True)
    created_by_monitor_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    @validates("mobile_number")
    def validate_mobile_number(self, key, mobile_number):
        if not re.match(r"^\d{11}$", mobile_number):
            raise ValueError(f"CRITICAL: User mobile number '{mobile_number}' is invalid. It must be exactly 11 digits to ensure Green Heritage IT SMS delivery does not crash.")
        return mobile_number


class PasswordResetOtpSession(Base):
    __tablename__ = "password_reset_otp_sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    mobile_number = Column(String(11), nullable=False, index=True)
    otp_hash = Column(String(255), nullable=False)
    reset_token_hash = Column(String(255), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    verified_at = Column(DateTime(timezone=True), nullable=True)
    consumed_at = Column(DateTime(timezone=True), nullable=True)
    attempts = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
