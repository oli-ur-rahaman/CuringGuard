from pydantic import BaseModel
from typing import List, Optional

class TenantBase(BaseModel):
    name: str
    subdomain: Optional[str] = None

class TenantCreate(TenantBase):
    pass

class TenantResponse(TenantBase):
    id: int
    is_active: bool

    class Config:
        from_attributes = True

class ProjectBase(BaseModel):
    name: str
    tenant_id: int

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
