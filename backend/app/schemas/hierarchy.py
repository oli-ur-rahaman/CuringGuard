from pydantic import BaseModel
from typing import List, Optional

class ProjectBase(BaseModel):
    name: str
    user_id: int

class ProjectCreate(ProjectBase):
    pass

class ProjectUpdate(BaseModel):
    name: str

class ProjectResponse(ProjectBase):
    id: int

    class Config:
        from_attributes = True

class PackageBase(BaseModel):
    name: str
    project_id: int

class PackageCreate(PackageBase):
    pass

class PackageUpdate(BaseModel):
    name: str

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

class StructureUpdate(BaseModel):
    name: str

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

class DrawingUpdate(BaseModel):
    name: str

class DrawingResponse(DrawingBase):
    id: int

    class Config:
        from_attributes = True
