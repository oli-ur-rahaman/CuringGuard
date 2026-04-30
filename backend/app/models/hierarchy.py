from sqlalchemy import Boolean, Column, Integer, String, ForeignKey, Text
from backend.app.core.database import Base



class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String(255), nullable=False)
    is_deleted = Column(Boolean, nullable=False, default=False)

class Package(Base):
    __tablename__ = "packages"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    name = Column(String(255), nullable=False)
    is_deleted = Column(Boolean, nullable=False, default=False)

class Structure(Base):
    __tablename__ = "structures"

    id = Column(Integer, primary_key=True, index=True)
    package_id = Column(Integer, ForeignKey("packages.id"), nullable=False)
    name = Column(String(255), nullable=False)
    contractor_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    is_deleted = Column(Boolean, nullable=False, default=False)

class Drawing(Base):
    __tablename__ = "drawings"

    id = Column(Integer, primary_key=True, index=True)
    structure_id = Column(Integer, ForeignKey("structures.id"), nullable=False)
    name = Column(String(255), nullable=False)
    file_path = Column(String(255), nullable=False) # e.g. /Sample/PLAN.dxf
    asset_kind = Column(String(50), nullable=False, default="pdf")


class DrawingPage(Base):
    __tablename__ = "drawing_pages"

    id = Column(Integer, primary_key=True, index=True)
    drawing_id = Column(Integer, ForeignKey("drawings.id"), nullable=False, index=True)
    page_ref = Column(String(255), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    kind = Column(String(50), nullable=False)
    source_page_number = Column(Integer, nullable=True)
    sort_order = Column(Integer, nullable=False, default=0)
    calibrations_json = Column(Text, nullable=True)
    is_deleted = Column(Boolean, nullable=False, default=False)
