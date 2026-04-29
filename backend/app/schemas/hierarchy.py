from pydantic import BaseModel
from typing import List, Optional

class ProjectBase(BaseModel):
    name: str
    user_id: int

class ProjectCreate(ProjectBase):
    pass

class ProjectResponse(ProjectBase):
    id: int

    class Config:
        from_attributes = True

class PackageBase(BaseModel):
    name: str
    project_id: int

class PackageCreate(PackageBase):
    pass

class PackageResponse(PackageBase):
    id: int

    class Config:
        from_attributes = True

class StructureBase(BaseModel):
    name: str
    package_id: int
    contractor_id: Optional[int] = None

class StructureCreate(StructureBase):
    pass

class StructureResponse(StructureBase):
    id: int

    class Config:
        from_attributes = True

class DrawingBase(BaseModel):
    name: str
    structure_id: int
    file_path: str

class DrawingCreate(DrawingBase):
    pass

class DrawingResponse(DrawingBase):
    id: int

    class Config:
        from_attributes = True
