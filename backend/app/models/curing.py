from sqlalchemy import Column, Integer, String, Enum, DateTime, ForeignKey, Boolean, Date
from sqlalchemy.sql import func
from backend.app.core.database import Base
import enum

class DefaultElement(Base):
    __tablename__ = "default_elements"

    id = Column(Integer, primary_key=True, index=True)
    element_name = Column(String(255), unique=True, index=True, nullable=False)
    geometry_type = Column(String(255), nullable=False)
    required_curing_days = Column(Integer, nullable=False)
    description = Column(String(1000), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())


class CustomElement(Base):
    __tablename__ = "custom_elements"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    element_name = Column(String(255), nullable=False, index=True)
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


class DrawingElement(Base):
    __tablename__ = "drawing_elements"

    id = Column(String(255), primary_key=True, index=True)
    drawing_id = Column(Integer, ForeignKey("drawings.id"), nullable=False, index=True)
    drawing_page_id = Column(Integer, ForeignKey("drawing_pages.id"), nullable=False, index=True)
    annotation_type = Column(String(50), nullable=False)
    element_type = Column(String(255), nullable=False)
    member_name = Column(String(255), nullable=True)
    color = Column(String(32), nullable=False)
    point_shape = Column(String(32), nullable=True)
    is_hidden = Column(Boolean, nullable=False, default=False)
    curing_duration_days = Column(Integer, nullable=True)
    curing_start_date = Column(Date, nullable=True)
    curing_end_date = Column(Date, nullable=True)
    coordinates_json = Column(String(10000), nullable=False)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())


class CuringProgressEntry(Base):
    __tablename__ = "curing_progress_entries"

    id = Column(Integer, primary_key=True, index=True)
    drawing_element_id = Column(String(255), ForeignKey("drawing_elements.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    progress_date = Column(Date, nullable=False, index=True)
    did_cure_today = Column(Boolean, nullable=False)
    remark = Column(String(2000), nullable=True)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())


class CuringProgressMedia(Base):
    __tablename__ = "curing_progress_media"

    id = Column(Integer, primary_key=True, index=True)
    progress_entry_id = Column(Integer, ForeignKey("curing_progress_entries.id"), nullable=False, index=True)
    file_path = Column(String(500), nullable=False)
    file_type = Column(String(32), nullable=False)
    mime_type = Column(String(255), nullable=True)
    duration_seconds = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=func.now())
