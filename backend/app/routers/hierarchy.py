from fastapi import APIRouter, Depends, HTTPException, File, UploadFile, Form
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List
import os
import shutil
import glob
from collections import Counter
from backend.app.core.database import get_db
from backend.app.core.auth import get_current_user, get_password_hash
from backend.app.models.users import User, UserRole
from backend.app.models.hierarchy import Project, Package, Structure, Drawing
from backend.app.models.curing import GeometryElement, ElementType
from backend.app.services.geometry_service import GeometryService
from backend.app.services.pdf_service import PdfService
from backend.app.schemas.hierarchy import (
    ProjectResponse, ProjectCreate,
    PackageResponse, PackageCreate,
    StructureResponse, StructureCreate,
    DrawingResponse, DrawingCreate
)
import json

router = APIRouter(prefix="/api/hierarchy", tags=["Hierarchy"])


def _normalize_element_type(raw_type: str) -> ElementType | None:
    normalized = (raw_type or "").strip().lower()
    mapping = {
        "wall": ElementType.WALL,
        "column": ElementType.COLUMN,
        "slab": ElementType.SLAB,
    }
    return mapping.get(normalized)


def _persist_geometry_elements(db: Session, drawing_id: int, elements: list[dict]) -> int:
    existing_ids = {
        row[0] for row in db.query(GeometryElement.element_id).all()
    }
    seen_ids: Counter[str] = Counter()
    inserted_count = 0

    for el in elements:
        normalized_type = _normalize_element_type(el.get("element_type", ""))
        if normalized_type is None:
            continue

        base_id = (el.get("element_id") or normalized_type.value).strip() or normalized_type.value
        candidate_id = base_id
        seen_ids[base_id] += 1
        if seen_ids[base_id] > 1:
            candidate_id = f"{base_id}-{seen_ids[base_id]}"

        while candidate_id in existing_ids:
            seen_ids[base_id] += 1
            candidate_id = f"{base_id}-{seen_ids[base_id]}"

        db.add(
            GeometryElement(
                element_id=candidate_id,
                element_type=normalized_type,
                coordinates_json=json.dumps(el["vertices"]),
                drawing_id=drawing_id,
            )
        )
        existing_ids.add(candidate_id)
        inserted_count += 1

    return inserted_count


def _resolve_drawing_dxf_path(drawing: Drawing) -> str:
    source_path = drawing.file_path
    if source_path.lower().endswith(".dwg"):
        converted_dxf_path = os.path.join(
            os.path.dirname(source_path),
            "temp_dxf",
            f"{os.path.splitext(os.path.basename(source_path))[0]}.dxf",
        )
        if os.path.exists(converted_dxf_path):
            return converted_dxf_path
        return GeometryService.convert_dwg_to_dxf(source_path)
    return source_path


def _resolve_drawing_pdf_path(drawing: Drawing) -> str:
    return drawing.file_path

# Project endpoints
@router.get("/monitors/{user_id}/projects", response_model=List[ProjectResponse])
def get_projects(user_id: int, db: Session = Depends(get_db)):
    return db.query(Project).filter(Project.user_id == user_id).all()

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

@router.put("/structures/{structure_id}/assign")
def assign_contractor(structure_id: int, contractor_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    db_structure = db.query(Structure).filter(Structure.id == structure_id).first()
    if not db_structure:
        raise HTTPException(status_code=404, detail="Structure not found")
    
    db_structure.contractor_id = contractor_id
    db.commit()
    db.refresh(db_structure)
    return db_structure

# Drawing endpoints
@router.get("/structures/{structure_id}/drawings", response_model=List[DrawingResponse])
def get_drawings(structure_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(Drawing).filter(Drawing.structure_id == structure_id).all()

@router.post("/drawings", response_model=DrawingResponse)
def create_drawing(drawing: DrawingCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    db_drawing = Drawing(**drawing.model_dump())
    db.add(db_drawing)
    db.commit()
    db.refresh(db_drawing)
    return db_drawing


@router.delete("/drawings/{drawing_id}")
def delete_drawing(drawing_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    drawing = db.query(Drawing).filter(Drawing.id == drawing_id).first()
    if not drawing:
        raise HTTPException(status_code=404, detail="Drawing not found")

    file_path = drawing.file_path
    converted_dxf_path = None
    pdf_page_store_path = None
    if file_path.lower().endswith(".dwg"):
        converted_dxf_path = os.path.join(
            os.path.dirname(file_path),
            "temp_dxf",
            f"{os.path.splitext(os.path.basename(file_path))[0]}.dxf",
        )
    if file_path.lower().endswith(".pdf"):
        pdf_page_store_path = f"{file_path}.pages.json"
    page_store_path = f"{converted_dxf_path or file_path}.pages.json"
    cache_glob = f"{converted_dxf_path or file_path}.canvas_cache.*.json"

    db.query(GeometryElement).filter(GeometryElement.drawing_id == drawing_id).delete()
    db.delete(drawing)
    db.commit()

    for cache_path in [pdf_page_store_path, page_store_path, *glob.glob(cache_glob)]:
        if cache_path and os.path.exists(cache_path):
            os.remove(cache_path)

    for path in [file_path, converted_dxf_path]:
        if path and os.path.exists(path):
            os.remove(path)

    if converted_dxf_path:
        temp_dir = os.path.dirname(converted_dxf_path)
        if os.path.isdir(temp_dir) and not os.listdir(temp_dir):
            os.rmdir(temp_dir)

    return {"status": "success", "drawing_id": drawing_id}


@router.get("/drawings/{drawing_id}/pages")
def get_drawing_pages(drawing_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    drawing = db.query(Drawing).filter(Drawing.id == drawing_id).first()
    if not drawing:
        raise HTTPException(status_code=404, detail="Drawing not found")

    file_path = drawing.file_path
    if not os.path.exists(file_path):
        raise HTTPException(status_code=400, detail="Drawing file not found on server.")

    if file_path.lower().endswith(".pdf"):
        pages = PdfService.list_pages(file_path)
    else:
        active_dxf_path = _resolve_drawing_dxf_path(drawing)
        pages = GeometryService.list_canvas_pages(active_dxf_path)
    return {
        "drawing_id": drawing.id,
        "drawing_name": drawing.name,
        "structure_id": drawing.structure_id,
        "pages": pages,
    }


@router.post("/drawings/{drawing_id}/pages/blank")
def create_blank_drawing_page(drawing_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    drawing = db.query(Drawing).filter(Drawing.id == drawing_id).first()
    if not drawing:
        raise HTTPException(status_code=404, detail="Drawing not found")

    file_path = drawing.file_path
    if not os.path.exists(file_path):
        raise HTTPException(status_code=400, detail="Drawing file not found on server.")

    if file_path.lower().endswith(".pdf"):
        page = PdfService.create_blank_page(file_path)
    else:
        active_dxf_path = _resolve_drawing_dxf_path(drawing)
        page = GeometryService.create_blank_page(active_dxf_path)
    return {
        "drawing_id": drawing.id,
        "drawing_name": drawing.name,
        "structure_id": drawing.structure_id,
        "page": page,
    }


@router.get("/drawings/{drawing_id}/canvas-data")
def get_drawing_canvas_data(drawing_id: int, page_id: str | None = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    drawing = db.query(Drawing).filter(Drawing.id == drawing_id).first()
    if not drawing:
        raise HTTPException(status_code=404, detail="Drawing not found")

    active_dxf_path = _resolve_drawing_dxf_path(drawing)
    if not os.path.exists(active_dxf_path):
        raise HTTPException(status_code=400, detail="Drawing file not found on server.")

    canvas_data = GeometryService.extract_canvas_page_entities(active_dxf_path, page_id)
    return {
        "drawing_id": drawing.id,
        "drawing_name": drawing.name,
        "structure_id": drawing.structure_id,
        "page_id": page_id,
        **canvas_data,
    }


@router.get("/drawings/{drawing_id}/file")
def get_drawing_file(drawing_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    drawing = db.query(Drawing).filter(Drawing.id == drawing_id).first()
    if not drawing:
        raise HTTPException(status_code=404, detail="Drawing not found")

    file_path = _resolve_drawing_pdf_path(drawing)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=400, detail="Drawing file not found on server.")

    return FileResponse(
        path=file_path,
        filename=os.path.basename(file_path),
        media_type="application/pdf" if file_path.lower().endswith(".pdf") else "application/octet-stream",
    )

@router.post("/drawings/upload")
async def upload_drawing(
    structure_id: int = Form(...),
    name: str = Form(...),
    file: UploadFile = File(...), 
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing file name.")

    extension = os.path.splitext(file.filename)[1].lower()
    if extension != ".pdf":
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

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
    
    page_count = PdfService.get_pdf_page_count(file_path)
    return {
        "status": "success",
        "drawing_id": db_drawing.id,
        "page_count": page_count,
    }

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
    inserted_count = _persist_geometry_elements(db, drawing_id, elements)
    
    db.commit()
    return {"status": "success", "count": inserted_count}
