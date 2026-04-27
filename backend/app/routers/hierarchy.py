from fastapi import APIRouter, Depends, HTTPException, File, UploadFile
from sqlalchemy.orm import Session
from typing import List
import os
import shutil

from backend.app.core.database import get_db
from backend.app.core.auth import get_current_user, get_password_hash
from backend.app.models.users import User, UserRole
from backend.app.models.hierarchy import Tenant, Project, Package, Structure, Drawing
from backend.app.models.curing import GeometryElement
from backend.app.services.geometry_service import GeometryService
from backend.app.schemas.hierarchy import (
    TenantResponse, TenantCreate,
    ProjectResponse, ProjectCreate,
    PackageResponse, PackageCreate,
    StructureResponse, StructureCreate,
    DrawingResponse, DrawingCreate
)
import json

router = APIRouter(prefix="/api/hierarchy", tags=["Hierarchy"])

# Tenant endpoints
@router.get("/tenants", response_model=List[TenantResponse])
def get_tenants(db: Session = Depends(get_db)):
    return db.query(Tenant).all()

@router.post("/tenants", response_model=TenantResponse)
def create_tenant(tenant: TenantCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != UserRole.SUPERADMIN:
        raise HTTPException(status_code=403, detail="Only Superadmin can deploy tenants.")
    db_tenant = Tenant(**tenant.model_dump())
    db.add(db_tenant)
    db.commit()
    db.refresh(db_tenant)
    return db_tenant

@router.post("/tenants/{tenant_id}/toggle-active")
def toggle_tenant_active(tenant_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != UserRole.SUPERADMIN:
        raise HTTPException(status_code=403, detail="Forbidden")
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    tenant.is_active = not tenant.is_active
    db.commit()
    return {"status": "success", "is_active": tenant.is_active}

@router.post("/tenants/{tenant_id}/reset-password")
def reset_tenant_password(tenant_id: int, new_password: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != UserRole.SUPERADMIN:
        raise HTTPException(status_code=403, detail="Forbidden")
    admin_user = db.query(User).filter(User.tenant_id == tenant_id, User.role == UserRole.MONITOR).first()
    if not admin_user:
        raise HTTPException(status_code=404, detail="Monitor account not found for this tenant")
    admin_user.hashed_password = get_password_hash(new_password)
    db.commit()
    return {"status": "success", "message": f"Password reset for {admin_user.username}"}

@router.delete("/tenants/{tenant_id}")
def delete_tenant(tenant_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != UserRole.SUPERADMIN:
        raise HTTPException(status_code=403, detail="Forbidden")
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    db.delete(tenant)
    db.commit()
    return {"status": "success"}

# Project endpoints
@router.get("/tenants/{tenant_id}/projects", response_model=List[ProjectResponse])
def get_projects(tenant_id: int, db: Session = Depends(get_db)):
    return db.query(Project).filter(Project.tenant_id == tenant_id).all()

@router.post("/projects", response_model=ProjectResponse)
def create_project(project: ProjectCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    db_project = Project(**project.model_dump())
    db.add(db_project)
    db.commit()
    db.refresh(db_project)
    return db_project

# Package endpoints
@router.get("/projects/{project_id}/packages", response_model=List[PackageResponse])
def get_packages(project_id: int, db: Session = Depends(get_db)):
    return db.query(Package).filter(Package.project_id == project_id).all()

@router.post("/packages", response_model=PackageResponse)
def create_package(package: PackageCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    db_package = Package(**package.model_dump())
    db.add(db_package)
    db.commit()
    db.refresh(db_package)
    return db_package

# Structure endpoints
@router.get("/packages/{package_id}/structures", response_model=List[StructureResponse])
def get_structures(package_id: int, db: Session = Depends(get_db)):
    return db.query(Structure).filter(Structure.package_id == package_id).all()

@router.post("/structures", response_model=StructureResponse)
def create_structure(structure: StructureCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    db_structure = Structure(**structure.model_dump())
    db.add(db_structure)
    db.commit()
    db.refresh(db_structure)
    return db_structure

# Drawing endpoints
@router.get("/structures/{structure_id}/drawings", response_model=List[DrawingResponse])
def get_drawings(structure_id: int, db: Session = Depends(get_db)):
    return db.query(Drawing).filter(Drawing.structure_id == structure_id).all()

@router.post("/drawings", response_model=DrawingResponse)
def create_drawing(drawing: DrawingCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    db_drawing = Drawing(**drawing.model_dump())
    db.add(db_drawing)
    db.commit()
    db.refresh(db_drawing)
    return db_drawing

@router.post("/drawings/upload")
async def upload_drawing(
    structure_id: int, 
    name: str,
    file: UploadFile = File(...), 
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    upload_dir = "uploads"
    if not os.path.exists(upload_dir):
        os.makedirs(upload_dir)
        
    file_path = os.path.join(upload_dir, file.filename)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    # Create the Drawing record
    db_drawing = Drawing(
        name=name,
        file_path=file_path,
        structure_id=structure_id
    )
    db.add(db_drawing)
    db.commit()
    db.refresh(db_drawing)
    
    # Automatically trigger parsing
    try:
        # If it's a DWG, GeometryService.parse_file will convert it to DXF first
        result = GeometryService.parse_file(file_path)
        # For simplicity in this demo, we use the active_path from the result or the original if already DXF
        active_dxf = file_path if file_path.endswith(".dxf") else GeometryService.convert_dwg_to_dxf(file_path)
        
        elements = GeometryService.extract_elements(active_dxf)
        
        for el in elements:
            db_el = GeometryElement(
                element_id=el["element_id"],
                element_type=el["element_type"],
                coordinates_json=json.dumps(el["vertices"]),
                drawing_id=db_drawing.id,
                tenant_id=current_user.tenant_id
            )
            db.add(db_el)
        
        db.commit()
        return {"status": "success", "drawing_id": db_drawing.id, "elements_count": len(elements)}
    except Exception as e:
        return {"status": "partial_success", "drawing_id": db_drawing.id, "error": f"Upload succeeded but parsing failed: {str(e)}"}

@router.post("/drawings/{drawing_id}/parse")
def parse_drawing(drawing_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    drawing = db.query(Drawing).filter(Drawing.id == drawing_id).first()
    if not drawing:
        raise HTTPException(status_code=404, detail="Drawing not found")
    
    # Path to the DXF file (assuming it's stored in a standard location)
    # For now, we use the sample path as a placeholder if file_path is not set
    dxf_path = drawing.file_path if drawing.file_path else r"d:\CuringGuard\Sample\temp_dxf\(1-17) ARCHITECTURAL PLAN BOY'S HOSTEL MUGDA 26.01.25.dxf"
    
    if not dxf_path or not os.path.exists(dxf_path):
        raise HTTPException(status_code=400, detail="DXF file not found on server.")

    elements = GeometryService.extract_elements(dxf_path)
    
    # Clear existing elements for this drawing if any
    db.query(GeometryElement).filter(GeometryElement.drawing_id == drawing_id).delete()
    
    # Insert new elements
    for el in elements:
        db_el = GeometryElement(
            element_id=el["element_id"],
            element_type=el["element_type"],
            coordinates_json=json.dumps(el["vertices"]),
            drawing_id=drawing_id,
            tenant_id=current_user.tenant_id
        )
        db.add(db_el)
    
    db.commit()
    return {"status": "success", "count": len(elements)}
