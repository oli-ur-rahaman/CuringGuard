from sqlalchemy import Column, Integer, String, Text
from backend.app.core.database import Base

class SystemSetting(Base):
    __tablename__ = "system_settings"

    id = Column(Integer, primary_key=True, index=True)
    setting_key = Column(String(100), unique=True, nullable=False, index=True)
    setting_value = Column(Text, nullable=True)
    category = Column(String(50), nullable=False) # e.g., "SMS", "WhatsApp", "General"
    description = Column(String(255))
