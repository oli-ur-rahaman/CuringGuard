from sqlalchemy import Column, Integer, String, Enum, ForeignKey
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
    email = Column(String(255), nullable=True, default="superadmin@curingguard.com")
    hashed_password = Column(String(255), nullable=False)
    role = Column(Enum(UserRole), nullable=False)
    is_active = Column(Integer, default=1) # 1 for active, 0 for suspended
    
    # The crucial 11-digit mobile number for SMS dispatch
    mobile_number = Column(String(11), unique=True, nullable=False)
    
    # Belongs to a Tenant silo (Contractors and Monitors both map here)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=True)

    @validates("mobile_number")
    def validate_mobile_number(self, key, mobile_number):
        if not re.match(r"^\d{11}$", mobile_number):
            raise ValueError(f"CRITICAL: User mobile number '{mobile_number}' is invalid. It must be exactly 11 digits to ensure Green Heritage IT SMS delivery does not crash.")
        return mobile_number
