from sqlalchemy import Column, Integer, String, Boolean, DateTime
from backend.app.core.database import Base
from datetime import datetime

class Gateway(Base):
    __tablename__ = "gateways"

    id = Column(Integer, primary_key=True, index=True)
    serial_number = Column(String(100), unique=True, index=True, nullable=False)
    location = Column(String(255), nullable=True)
    is_online = Column(Boolean, default=False)
    last_ping = Column(DateTime, default=datetime.utcnow)
    firmware_version = Column(String(50), nullable=True)
    is_active = Column(Boolean, default=True)
