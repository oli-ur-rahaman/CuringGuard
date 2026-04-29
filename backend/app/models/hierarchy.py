from sqlalchemy import Column, Integer, String, ForeignKey
from backend.app.core.database import Base



class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String(255), nullable=False)

class Package(Base):
    __tablename__ = "packages"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    name = Column(String(255), nullable=False)

class Structure(Base):
    __tablename__ = "structures"

    id = Column(Integer, primary_key=True, index=True)
    package_id = Column(Integer, ForeignKey("packages.id"), nullable=False)
    name = Column(String(255), nullable=False)
    contractor_id = Column(Integer, ForeignKey("users.id"), nullable=True)

class Drawing(Base):
    __tablename__ = "drawings"

    id = Column(Integer, primary_key=True, index=True)
    structure_id = Column(Integer, ForeignKey("structures.id"), nullable=False)
    name = Column(String(255), nullable=False)
    file_path = Column(String(255), nullable=False) # e.g. /Sample/PLAN.dxf
