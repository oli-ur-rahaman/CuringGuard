from sqlalchemy import Column, Integer, String, Enum, DateTime, ForeignKey, Boolean
from sqlalchemy.sql import func
from backend.app.core.database import Base
import enum

class CuringRule(Base):
    __tablename__ = "curing_rules"

    id = Column(Integer, primary_key=True, index=True)
    element_name = Column(String(255), unique=True, index=True, nullable=False)
    geometry_type = Column(String(255), nullable=False)
    required_curing_days = Column(Integer, nullable=False)
    description = Column(String(1000), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

class ElementType(enum.Enum):
    SLAB = "slab"
    COLUMN = "column"
    WALL = "wall"

class GeometryElement(Base):
    __tablename__ = "geometry_elements"

    element_id = Column(String(255), primary_key=True, index=True) # Could be a generated hash or DXF handle
    drawing_id = Column(Integer, ForeignKey("drawings.id"), nullable=False)
    
    element_type = Column(Enum(ElementType), nullable=False)
    coordinates_json = Column(String(10000), nullable=False) # Stores stringified array of x,y coordinates
    
    contractor_id = Column(Integer, ForeignKey("users.id"), nullable=True) # Assigned to pour this
    
    poured_date = Column(DateTime(timezone=True), nullable=True)
    curing_end_date = Column(DateTime(timezone=True), nullable=True)
    sms_sent = Column(Boolean, default=False)
