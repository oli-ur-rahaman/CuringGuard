from fastapi import APIRouter, Depends, HTTPException, File, UploadFile, Form, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List
import os
import shutil
import glob
import uuid
from collections import Counter
from datetime import date, datetime, timedelta
from backend.app.core.database import get_db
from backend.app.core.auth import get_current_user, get_password_hash
from backend.app.models.users import User, UserRole
from backend.app.models.hierarchy import Project, Package, Structure, Drawing, DrawingPage
from backend.app.models.curing import GeometryElement, ElementType, DrawingElement, CustomElement, DefaultElement
from backend.app.services.geometry_service import GeometryService
from backend.app.services.pdf_service import PdfService
from backend.app.schemas.hierarchy import (
    ProjectResponse, ProjectCreate,
    PackageResponse, PackageCreate,
    StructureResponse, StructureCreate,
    DrawingResponse, DrawingCreate,
    ProjectUpdate, PackageUpdate, StructureUpdate, DrawingUpdate,
)
import json

router = APIRouter(prefix="/api/hierarchy", tags=["Hierarchy"])


def _scope_project_query(db: Session, current_user: User):
    query = db.query(Project)
    if current_user.role == UserRole.MONITOR:
        return query.filter(Project.user_id == current_user.id)
    if current_user.role == UserRole.CONTRACTOR:
        return query.join(Package, Package.project_id == Project.id).join(Structure, Structure.package_id == Package.id).filter(
            Structure.contractor_id == current_user.id
        )
    return query


def _scope_package_query(db: Session, current_user: User):
    query = db.query(Package).join(Project, Package.project_id == Project.id)
    if current_user.role == UserRole.MONITOR:
        return query.filter(Project.user_id == current_user.id)
    if current_user.role == UserRole.CONTRACTOR:
        return query.join(Structure, Structure.package_id == Package.id).filter(Structure.contractor_id == current_user.id)
    return query


def _scope_structure_query(db: Session, current_user: User):
    query = db.query(Structure).join(Package, Structure.package_id == Package.id).join(Project, Package.project_id == Project.id)
    if current_user.role == UserRole.MONITOR:
        return query.filter(Project.user_id == current_user.id)
    if current_user.role == UserRole.CONTRACTOR:
        return query.filter(Structure.contractor_id == current_user.id)
    return query


def _scope_drawing_query(db: Session, current_user: User):
    query = db.query(Drawing).join(Structure, Drawing.structure_id == Structure.id).join(Package, Structure.package_id == Package.id).join(Project, Package.project_id == Project.id)
    if current_user.role == UserRole.MONITOR:
        return query.filter(Project.user_id == current_user.id)
    if current_user.role == UserRole.CONTRACTOR:
        return query.filter(Structure.contractor_id == current_user.id)
    return query


def _get_project_or_404(db: Session, current_user: User, project_id: int) -> Project:
    project = _scope_project_query(db, current_user).filter(
        Project.id == project_id,
        Project.is_deleted == False,
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


def _get_package_or_404(db: Session, current_user: User, package_id: int) -> Package:
    package = _scope_package_query(db, current_user).filter(
        Package.id == package_id,
        Package.is_deleted == False,
        Project.is_deleted == False,
    ).first()
    if not package:
        raise HTTPException(status_code=404, detail="Package not found")
    return package


def _get_structure_or_404(db: Session, current_user: User, structure_id: int) -> Structure:
    structure = _scope_structure_query(db, current_user).filter(
        Structure.id == structure_id,
        Structure.is_deleted == False,
        Package.is_deleted == False,
        Project.is_deleted == False,
    ).first()
    if not structure:
        raise HTTPException(status_code=404, detail="Structure not found")
    return structure


def _get_drawing_or_404(db: Session, current_user: User, drawing_id: int) -> Drawing:
    drawing = _scope_drawing_query(db, current_user).filter(Drawing.id == drawing_id).first()
    if not drawing:
        raise HTTPException(status_code=404, detail="Drawing not found")
    return drawing


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


def _page_payload(page: DrawingPage, db: Session | None = None) -> dict:
    payload = {
        "id": page.page_ref,
        "name": page.name,
        "kind": page.kind,
    }
    if page.source_page_number is not None:
        payload["page_number"] = page.source_page_number
    calibrations: list[dict] = []
    if page.calibrations_json:
        try:
            parsed = json.loads(page.calibrations_json)
            if isinstance(parsed, list):
                calibrations = parsed
        except json.JSONDecodeError:
            calibrations = []
    payload["calibrations"] = calibrations
    return payload


def _build_initial_drawing_pages(drawing: Drawing) -> list[DrawingPage]:
    asset_kind = drawing.asset_kind or ("blank" if not drawing.file_path else "pdf")
    pages: list[DrawingPage] = []

    if asset_kind == "blank" or not drawing.file_path:
        pages.append(
            DrawingPage(
                drawing_id=drawing.id,
                page_ref=f"blank:{drawing.id}:1",
                name="Sheet 1",
                kind="blank",
                sort_order=1,
            )
        )
    elif PdfService.is_pdf(drawing.file_path):
        page_count = PdfService.get_page_count(drawing.file_path)
        for page_number in range(1, page_count + 1):
            pages.append(
                DrawingPage(
                    drawing_id=drawing.id,
                    page_ref=f"pdf:{page_number}",
                    name=f"Page {page_number}",
                    kind="pdf",
                    source_page_number=page_number,
                    sort_order=page_number,
                )
            )
    elif PdfService.is_image(drawing.file_path):
        pages.append(
            DrawingPage(
                drawing_id=drawing.id,
                page_ref="image:1",
                name=drawing.name,
                kind="image",
                source_page_number=1,
                sort_order=1,
            )
        )

    return pages


def _ensure_drawing_pages(db: Session, drawing: Drawing) -> list[DrawingPage]:
    existing_pages = db.query(DrawingPage).filter(DrawingPage.drawing_id == drawing.id).all()
    if existing_pages:
        return sorted(existing_pages, key=lambda page: page.sort_order)
    new_pages = _build_initial_drawing_pages(drawing)

    if new_pages:
        db.add_all(new_pages)
        db.commit()

    return sorted(
        db.query(DrawingPage).filter(DrawingPage.drawing_id == drawing.id).all(),
        key=lambda page: page.sort_order,
    )


def _active_drawing_pages(db: Session, drawing_id: int) -> list[DrawingPage]:
    return db.query(DrawingPage).filter(
        DrawingPage.drawing_id == drawing_id,
        DrawingPage.is_deleted == False,
    ).order_by(DrawingPage.sort_order.asc(), DrawingPage.id.asc()).all()


def _get_page_or_404(db: Session, drawing_id: int, page_ref: str) -> DrawingPage:
    page = db.query(DrawingPage).filter(
        DrawingPage.drawing_id == drawing_id,
        DrawingPage.page_ref == page_ref,
        DrawingPage.is_deleted == False,
    ).first()
    if not page:
        raise HTTPException(status_code=404, detail="Drawing page not found")
    return page


def _resolve_curing_duration_days(db: Session, element_type: str, user_id: int | None = None) -> int | None:
    normalized = (element_type or "").strip().lower()
    if not normalized:
        return None

    if user_id:
        rules = db.query(CustomElement).filter(
            CustomElement.user_id == user_id,
            CustomElement.is_active == True,
        ).all()
    else:
        rules = db.query(DefaultElement).filter(DefaultElement.is_active == True).all()
    for rule in rules:
        if (rule.element_name or "").strip().lower() == normalized:
            return rule.required_curing_days
    for rule in rules:
        if (rule.geometry_type or "").strip().lower() == normalized:
            return rule.required_curing_days
    return None


def _coerce_optional_date(value) -> date | None:
    if value in (None, "", "null"):
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, str):
        try:
            return date.fromisoformat(value[:10])
        except ValueError:
            return None
    return None


def _apply_curing_fields(db: Session, drawing_element: DrawingElement, payload: dict, user_id: int | None = None):
    next_type = (payload.get("elementType") or drawing_element.element_type or "Other").strip() or "Other"
    requested_duration = payload.get("curingDurationDays")
    resolved_duration = requested_duration if isinstance(requested_duration, int) else _resolve_curing_duration_days(db, next_type, user_id)
    start_date = _coerce_optional_date(payload.get("curingStartDate"))

    drawing_element.element_type = next_type
    drawing_element.curing_duration_days = resolved_duration
    drawing_element.curing_start_date = start_date
    drawing_element.curing_end_date = (
        start_date + timedelta(days=max(resolved_duration - 1, 0))
        if start_date and isinstance(resolved_duration, int) and resolved_duration > 0
        else None
    )


def _serialize_drawing_element(element: DrawingElement) -> dict:
    return {
        "id": element.id,
        "type": element.annotation_type,
        "elementType": element.element_type,
        "memberName": element.member_name or "",
        "color": element.color,
        "pointShape": element.point_shape or "circle",
        "isHidden": bool(element.is_hidden),
        "points": json.loads(element.coordinates_json),
        "curingDurationDays": element.curing_duration_days,
        "curingStartDate": element.curing_start_date.isoformat() if element.curing_start_date else "",
        "curingEndDate": element.curing_end_date.isoformat() if element.curing_end_date else "",
    }

# Project endpoints
@router.get("/monitors/{user_id}/projects", response_model=List[ProjectResponse])
def get_projects(user_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role == UserRole.CONTRACTOR:
        return _scope_project_query(db, current_user).filter(
            Project.is_deleted == False,
        ).distinct().order_by(Project.id.asc()).all()
    if current_user.role == UserRole.MONITOR and user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Forbidden")
    return _scope_project_query(db, current_user).filter(
        Project.user_id == user_id,
        Project.is_deleted == False,
    ).order_by(Project.id.asc()).all()

@router.post("/projects", response_model=ProjectResponse)
def create_project(project: ProjectCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role == UserRole.CONTRACTOR:
        raise HTTPException(status_code=403, detail="Contractors cannot create projects.")
    project_owner_id = current_user.id if current_user.role == UserRole.MONITOR else project.user_id
    db_project = Project(name=project.name, user_id=project_owner_id)
    db.add(db_project)
    db.commit()
    db.refresh(db_project)
    return db_project

@router.patch("/projects/{project_id}", response_model=ProjectResponse)
def update_project(project_id: int, payload: ProjectUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role == UserRole.CONTRACTOR:
        raise HTTPException(status_code=403, detail="Contractors cannot edit projects.")
    project = _get_project_or_404(db, current_user, project_id)
    project.name = payload.name.strip()
    db.commit()
    db.refresh(project)
    return project

@router.delete("/projects/{project_id}")
def delete_project(project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role == UserRole.CONTRACTOR:
        raise HTTPException(status_code=403, detail="Contractors cannot delete projects.")
    project = _get_project_or_404(db, current_user, project_id)
    project.is_deleted = True
    db.commit()
    return {"status": "success", "project_id": project_id}

# Package endpoints
@router.get("/projects/{project_id}/packages", response_model=List[PackageResponse])
def get_packages(project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    try:
        _get_project_or_404(db, current_user, project_id)
    except HTTPException as exc:
        if exc.status_code != 404:
            raise
        return []
    return _scope_package_query(db, current_user).filter(
        Package.project_id == project_id,
        Package.is_deleted == False,
        Project.is_deleted == False,
    ).order_by(Package.id.asc()).all()

@router.post("/packages", response_model=PackageResponse)
def create_package(package: PackageCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role == UserRole.CONTRACTOR:
        raise HTTPException(status_code=403, detail="Contractors cannot create packages.")
    _get_project_or_404(db, current_user, package.project_id)
    db_package = Package(**package.model_dump())
    db.add(db_package)
    db.commit()
    db.refresh(db_package)
    return db_package

@router.patch("/packages/{package_id}", response_model=PackageResponse)
def update_package(package_id: int, payload: PackageUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role == UserRole.CONTRACTOR:
        raise HTTPException(status_code=403, detail="Contractors cannot edit packages.")
    package = _get_package_or_404(db, current_user, package_id)
    package.name = payload.name.strip()
    db.commit()
    db.refresh(package)
    return package

@router.delete("/packages/{package_id}")
def delete_package(package_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role == UserRole.CONTRACTOR:
        raise HTTPException(status_code=403, detail="Contractors cannot delete packages.")
    package = _get_package_or_404(db, current_user, package_id)
    package.is_deleted = True
    db.commit()
    return {"status": "success", "package_id": package_id}

# Structure endpoints
@router.get("/packages/{package_id}/structures", response_model=List[StructureResponse])
def get_structures(package_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    try:
        _get_package_or_404(db, current_user, package_id)
    except HTTPException as exc:
        if exc.status_code != 404:
            raise
        return []
    return _scope_structure_query(db, current_user).filter(
        Structure.package_id == package_id,
        Structure.is_deleted == False,
        Package.is_deleted == False,
        Project.is_deleted == False,
    ).order_by(Structure.id.asc()).all()

@router.post("/structures", response_model=StructureResponse)
def create_structure(structure: StructureCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role == UserRole.CONTRACTOR:
        raise HTTPException(status_code=403, detail="Contractors cannot create structures.")
    _get_package_or_404(db, current_user, structure.package_id)
    db_structure = Structure(**structure.model_dump())
    db.add(db_structure)
    db.commit()
    db.refresh(db_structure)
    return db_structure

@router.patch("/structures/{structure_id}", response_model=StructureResponse)
def update_structure(structure_id: int, payload: StructureUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role == UserRole.CONTRACTOR:
        raise HTTPException(status_code=403, detail="Contractors cannot edit structures.")
    structure = _get_structure_or_404(db, current_user, structure_id)
    structure.name = payload.name.strip()
    db.commit()
    db.refresh(structure)
    return structure

@router.delete("/structures/{structure_id}")
def delete_structure(structure_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role == UserRole.CONTRACTOR:
        raise HTTPException(status_code=403, detail="Contractors cannot delete structures.")
    structure = _get_structure_or_404(db, current_user, structure_id)
    structure.is_deleted = True
    db.commit()
    return {"status": "success", "structure_id": structure_id}

@router.put("/structures/{structure_id}/assign")
def assign_contractor(structure_id: int, contractor_id: int | None = Query(None), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role == UserRole.CONTRACTOR:
        raise HTTPException(status_code=403, detail="Contractors cannot manage structure assignments.")
    db_structure = _get_structure_or_404(db, current_user, structure_id)
    
    db_structure.contractor_id = contractor_id
    db.commit()
    db.refresh(db_structure)
    return db_structure

# Drawing endpoints
@router.get("/structures/{structure_id}/drawings", response_model=List[DrawingResponse])
def get_drawings(structure_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _get_structure_or_404(db, current_user, structure_id)
    return _scope_drawing_query(db, current_user).filter(Drawing.structure_id == structure_id).order_by(Drawing.id.asc()).all()

@router.post("/drawings", response_model=DrawingResponse)
def create_drawing(drawing: DrawingCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _get_structure_or_404(db, current_user, drawing.structure_id)
    db_drawing = Drawing(**drawing.model_dump())
    db.add(db_drawing)
    db.commit()
    db.refresh(db_drawing)
    return db_drawing


@router.patch("/drawings/{drawing_id}", response_model=DrawingResponse)
def update_drawing(drawing_id: int, payload: DrawingUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    drawing = _get_drawing_or_404(db, current_user, drawing_id)

    drawing.name = payload.name.strip()
    db.commit()
    db.refresh(drawing)
    return drawing


@router.delete("/drawings/{drawing_id}")
def delete_drawing(drawing_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    drawing = _get_drawing_or_404(db, current_user, drawing_id)

    file_path = drawing.file_path
    converted_dxf_path = None
    if file_path.lower().endswith(".dwg"):
        converted_dxf_path = os.path.join(
            os.path.dirname(file_path),
            "temp_dxf",
            f"{os.path.splitext(os.path.basename(file_path))[0]}.dxf",
        )
    base_cache_path = converted_dxf_path or file_path
    page_store_path = f"{base_cache_path}.pages.json" if base_cache_path else None
    cache_glob = f"{base_cache_path}.canvas_cache.*.json" if base_cache_path else None

    page_ids = [
        page_id for (page_id,) in db.query(DrawingPage.id).filter(DrawingPage.drawing_id == drawing_id).all()
    ]
    if page_ids:
        db.query(DrawingElement).filter(DrawingElement.drawing_page_id.in_(page_ids)).delete(synchronize_session=False)
    db.query(DrawingPage).filter(DrawingPage.drawing_id == drawing_id).delete(synchronize_session=False)
    db.query(GeometryElement).filter(GeometryElement.drawing_id == drawing_id).delete()
    db.delete(drawing)
    db.commit()

    legacy_cache_paths = glob.glob(cache_glob) if cache_glob else []
    for cache_path in [page_store_path, *legacy_cache_paths]:
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
    drawing = _get_drawing_or_404(db, current_user, drawing_id)

    if drawing.file_path and not os.path.exists(drawing.file_path):
        raise HTTPException(status_code=400, detail="Drawing file not found on server.")

    _ensure_drawing_pages(db, drawing)
    pages = [_page_payload(page, db) for page in _active_drawing_pages(db, drawing.id)]
    return {
        "drawing_id": drawing.id,
        "drawing_name": drawing.name,
        "structure_id": drawing.structure_id,
        "asset_kind": drawing.asset_kind,
        "has_source_file": bool(drawing.file_path),
        "pages": pages,
    }


@router.post("/drawings/{drawing_id}/pages/blank")
def create_blank_drawing_page(
    drawing_id: int,
    name: str = Form(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    drawing = _get_drawing_or_404(db, current_user, drawing_id)

    if drawing.file_path and not os.path.exists(drawing.file_path):
        raise HTTPException(status_code=400, detail="Drawing file not found on server.")

    _ensure_drawing_pages(db, drawing)
    next_order = (db.query(DrawingPage)
        .filter(DrawingPage.drawing_id == drawing.id)
        .order_by(DrawingPage.sort_order.desc(), DrawingPage.id.desc())
        .first())
    page_name = name.strip()
    if not page_name:
        raise HTTPException(status_code=400, detail="Blank page name is required.")
    page = DrawingPage(
        drawing_id=drawing.id,
        page_ref=f"blank:{uuid.uuid4().hex[:12]}",
        name=page_name,
        kind="blank",
        sort_order=(next_order.sort_order if next_order else 0) + 1,
    )
    db.add(page)
    db.commit()
    db.refresh(page)
    return {
        "drawing_id": drawing.id,
        "drawing_name": drawing.name,
        "structure_id": drawing.structure_id,
        "page": _page_payload(page, db),
    }


@router.patch("/drawings/{drawing_id}/pages/{page_ref:path}")
def update_drawing_page(
    drawing_id: int,
    page_ref: str,
    name: str = Form(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_drawing_or_404(db, current_user, drawing_id)
    page = _get_page_or_404(db, drawing_id, page_ref)
    page_name = name.strip()
    if not page_name:
        raise HTTPException(status_code=400, detail="Page name is required.")
    page.name = page_name
    db.commit()
    db.refresh(page)
    return {
        "status": "success",
        "drawing_id": drawing_id,
        "page": _page_payload(page, db),
    }


@router.post("/drawings/{drawing_id}/pages/{page_ref:path}/calibrations")
def create_page_calibration(
    drawing_id: int,
    page_ref: str,
    value: float = Form(...),
    unit: str = Form(...),
    x1: float = Form(...),
    y1: float = Form(...),
    x2: float = Form(...),
    y2: float = Form(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    drawing = _get_drawing_or_404(db, current_user, drawing_id)

    page = _get_page_or_404(db, drawing_id, page_ref)
    normalized_unit = unit.strip().lower()
    if normalized_unit not in {"ft", "in", "m", "mm"}:
        raise HTTPException(status_code=400, detail="Invalid calibration unit.")
    if value <= 0:
        raise HTTPException(status_code=400, detail="Calibration value must be greater than zero.")

    calibrations: list[dict] = []
    if page.calibrations_json:
        try:
            parsed = json.loads(page.calibrations_json)
            if isinstance(parsed, list):
                calibrations = parsed
        except json.JSONDecodeError:
            calibrations = []

    calibration = {
        "id": (max((int(item.get("id", 0)) for item in calibrations), default=0) + 1),
        "points": [
            {"x": x1, "y": y1},
            {"x": x2, "y": y2},
        ],
        "value": value,
        "unit": normalized_unit,
    }
    calibrations.append(calibration)
    page.calibrations_json = json.dumps(calibrations)
    db.commit()
    db.refresh(page)

    return {
        "status": "success",
        "drawing_id": drawing_id,
        "page_id": page_ref,
        "calibration": calibration,
        "page": _page_payload(page, db),
    }


@router.get("/drawings/{drawing_id}/canvas-data")
def get_drawing_canvas_data(drawing_id: int, page_id: str | None = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    drawing = _get_drawing_or_404(db, current_user, drawing_id)

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
    drawing = _get_drawing_or_404(db, current_user, drawing_id)
    if not drawing.file_path:
        raise HTTPException(status_code=400, detail="This drawing does not have a source file.")

    file_path = _resolve_drawing_pdf_path(drawing)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=400, detail="Drawing file not found on server.")

    return FileResponse(
        path=file_path,
        filename=os.path.basename(file_path),
        media_type=PdfService.get_media_type(file_path),
    )


@router.post("/structures/{structure_id}/drawings/blank")
def create_blank_drawing(
    structure_id: int,
    name: str = Form(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    structure = _get_structure_or_404(db, current_user, structure_id)

    drawing_name = name.strip()
    if not drawing_name:
        raise HTTPException(status_code=400, detail="Blank drawing name is required.")

    db_drawing = Drawing(
        name=drawing_name,
        file_path="",
        structure_id=structure_id,
        asset_kind="blank",
    )
    db.add(db_drawing)
    db.commit()
    db.refresh(db_drawing)

    first_page = DrawingPage(
        drawing_id=db_drawing.id,
        page_ref=f"blank:{db_drawing.id}:1",
        name="Sheet 1",
        kind="blank",
        sort_order=1,
    )
    db.add(first_page)
    db.commit()

    return {
        "status": "success",
        "drawing_id": db_drawing.id,
        "drawing_name": db_drawing.name,
        "structure_id": db_drawing.structure_id,
        "asset_kind": db_drawing.asset_kind,
        "page": _page_payload(first_page, db),
    }


@router.delete("/drawings/{drawing_id}/pages/{page_ref:path}")
def delete_drawing_page(
    drawing_id: int,
    page_ref: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    drawing = _get_drawing_or_404(db, current_user, drawing_id)

    page = _get_page_or_404(db, drawing_id, page_ref)

    db.query(DrawingElement).filter(DrawingElement.drawing_page_id == page.id).delete(synchronize_session=False)
    page.is_deleted = True
    db.commit()
    return {"status": "success", "drawing_id": drawing_id, "page_id": page_ref}


@router.get("/drawings/{drawing_id}/annotations")
def get_drawing_annotations(
    drawing_id: int,
    page_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    drawing = _get_drawing_or_404(db, current_user, drawing_id)

    page = _get_page_or_404(db, drawing_id, page_id)
    elements = db.query(DrawingElement).filter(
        DrawingElement.drawing_id == drawing_id,
        DrawingElement.drawing_page_id == page.id,
    ).order_by(DrawingElement.created_at.asc(), DrawingElement.id.asc()).all()

    return {
        "drawing_id": drawing.id,
        "page_id": page_id,
        "annotations": [_serialize_drawing_element(element) for element in elements],
    }


@router.post("/drawings/{drawing_id}/annotations")
def save_drawing_annotations(
    drawing_id: int,
    page_id: str = Form(...),
    annotations: str = Form(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    drawing = _get_drawing_or_404(db, current_user, drawing_id)
    page = _get_page_or_404(db, drawing_id, page_id)

    try:
        parsed_annotations = json.loads(annotations)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid annotations payload: {str(exc)}")

    if not isinstance(parsed_annotations, list):
        raise HTTPException(status_code=400, detail="Annotations payload must be a list.")

    db.query(DrawingElement).filter(
        DrawingElement.drawing_id == drawing_id,
        DrawingElement.drawing_page_id == page.id,
    ).delete(synchronize_session=False)
    for annotation in parsed_annotations:
        points = annotation.get("points", [])
        if not isinstance(points, list):
            continue
        drawing_element = DrawingElement(
            id=(annotation.get("id") or uuid.uuid4().hex),
            drawing_id=drawing_id,
            drawing_page_id=page.id,
            annotation_type=(annotation.get("type") or "rect"),
            member_name=annotation.get("memberName") or "",
            color=(annotation.get("color") or "#3b82f6"),
            point_shape=(annotation.get("pointShape") or "circle") if (annotation.get("type") or "rect") == "point" else None,
            is_hidden=bool(annotation.get("isHidden", False)),
            coordinates_json=json.dumps(points),
        )
        _apply_curing_fields(db, drawing_element, annotation, current_user.id if current_user.role == UserRole.MONITOR else None)
        db.add(drawing_element)
    db.commit()
    elements = db.query(DrawingElement).filter(
        DrawingElement.drawing_id == drawing_id,
        DrawingElement.drawing_page_id == page.id,
    ).order_by(DrawingElement.created_at.asc(), DrawingElement.id.asc()).all()
    return {
        "drawing_id": drawing.id,
        "page_id": page_id,
        "count": len(parsed_annotations),
        "status": "success",
        "annotations": [_serialize_drawing_element(element) for element in elements],
    }


@router.patch("/drawings/{drawing_id}/annotations/{element_id}")
def update_drawing_annotation(
    drawing_id: int,
    element_id: str,
    page_id: str = Form(...),
    member_name: str | None = Form(None),
    color: str | None = Form(None),
    element_type: str | None = Form(None),
    curing_start_date: str | None = Form(None),
    is_hidden: str | None = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    drawing = _get_drawing_or_404(db, current_user, drawing_id)
    page = _get_page_or_404(db, drawing_id, page_id)
    element = db.query(DrawingElement).filter(
        DrawingElement.id == element_id,
        DrawingElement.drawing_id == drawing_id,
        DrawingElement.drawing_page_id == page.id,
    ).first()
    if not element:
        raise HTTPException(status_code=404, detail="Drawing element not found")

    if member_name is not None:
        element.member_name = member_name
    if color is not None:
        element.color = color
    if is_hidden is not None:
        element.is_hidden = is_hidden.strip().lower() in {"1", "true", "yes", "on"}

    payload = {
        "elementType": element_type if element_type is not None else element.element_type,
        "curingStartDate": curing_start_date if curing_start_date is not None else element.curing_start_date,
    }
    _apply_curing_fields(db, element, payload, current_user.id if current_user.role == UserRole.MONITOR else None)
    db.commit()
    db.refresh(element)
    return {
        "status": "success",
        "drawing_id": drawing_id,
        "page_id": page_id,
        "annotation": _serialize_drawing_element(element),
    }


@router.delete("/drawings/{drawing_id}/annotations")
def delete_drawing_annotations(
    drawing_id: int,
    page_id: str,
    element_ids: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    drawing = _get_drawing_or_404(db, current_user, drawing_id)
    page = _get_page_or_404(db, drawing_id, page_id)

    try:
        parsed_ids = json.loads(element_ids)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid element_ids payload: {str(exc)}")

    if not isinstance(parsed_ids, list) or not all(isinstance(item, str) for item in parsed_ids):
        raise HTTPException(status_code=400, detail="element_ids must be a JSON array of strings.")

    deleted_count = db.query(DrawingElement).filter(
        DrawingElement.drawing_id == drawing_id,
        DrawingElement.drawing_page_id == page.id,
        DrawingElement.id.in_(parsed_ids),
    ).delete(synchronize_session=False)
    db.commit()
    return {"status": "success", "drawing_id": drawing_id, "page_id": page_id, "deleted_count": deleted_count}

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
    if extension not in [".pdf", ".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif"]:
        raise HTTPException(status_code=400, detail="Only PDF and image files are supported.")

    upload_dir = "uploads"
    if not os.path.exists(upload_dir):
        os.makedirs(upload_dir)
        
    file_path = os.path.join(upload_dir, file.filename)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    # Create the Drawing record
    asset_kind = "pdf" if extension == ".pdf" else "image"
    db_drawing = Drawing(
        name=name,
        file_path=file_path,
        structure_id=structure_id,
        asset_kind=asset_kind,
    )
    db.add(db_drawing)
    db.commit()
    db.refresh(db_drawing)
    _ensure_drawing_pages(db, db_drawing)
    
    page_count = PdfService.get_page_count(file_path)
    return {
        "status": "success",
        "drawing_id": db_drawing.id,
        "structure_id": db_drawing.structure_id,
        "page_count": page_count,
        "asset_kind": asset_kind,
    }


@router.post("/drawings/upload-managed")
async def upload_managed_drawing(
    file: UploadFile = File(...),
    name: str = Form(...),
    structure_id: int | None = Form(None),
    create_structure: bool = Form(False),
    project_id: int | None = Form(None),
    package_id: int | None = Form(None),
    structure_name: str | None = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing file name.")

    extension = os.path.splitext(file.filename)[1].lower()
    if extension not in [".pdf", ".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif"]:
        raise HTTPException(status_code=400, detail="Only PDF and image files are supported.")

    resolved_structure_id = structure_id
    if create_structure:
        if current_user.role == UserRole.CONTRACTOR:
            raise HTTPException(status_code=403, detail="Contractors cannot create structures.")
        if not project_id or not package_id or not (structure_name or "").strip():
            raise HTTPException(status_code=400, detail="Project, package, and structure name are required.")

        package = _get_package_or_404(db, current_user, package_id)
        if package.project_id != project_id:
            raise HTTPException(status_code=404, detail="Package not found.")
    else:
        if not resolved_structure_id:
            raise HTTPException(status_code=400, detail="Structure selection is required.")
        _get_structure_or_404(db, current_user, resolved_structure_id)

    upload_dir = "uploads"
    if not os.path.exists(upload_dir):
        os.makedirs(upload_dir)

    safe_file_name = f"{uuid.uuid4().hex}_{os.path.basename(file.filename)}"
    file_path = os.path.join(upload_dir, safe_file_name)

    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        asset_kind = "pdf" if extension == ".pdf" else "image"
        with db.begin():
            if create_structure:
                db_structure = Structure(
                    name=(structure_name or "").strip(),
                    package_id=package_id,
                )
                db.add(db_structure)
                db.flush()
                resolved_structure_id = db_structure.id

            db_drawing = Drawing(
                name=name.strip() or file.filename,
                file_path=file_path,
                structure_id=resolved_structure_id,
                asset_kind=asset_kind,
            )
            db.add(db_drawing)
            db.flush()

            initial_pages = _build_initial_drawing_pages(db_drawing)
            if initial_pages:
                db.add_all(initial_pages)

        page_count = PdfService.get_page_count(file_path)
        return {
            "status": "success",
            "drawing_id": db_drawing.id,
            "structure_id": resolved_structure_id,
            "page_count": page_count,
            "asset_kind": asset_kind,
        }
    except Exception:
        if os.path.exists(file_path):
            os.remove(file_path)
        raise

@router.post("/drawings/{drawing_id}/parse")
def parse_drawing(drawing_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    drawing = _get_drawing_or_404(db, current_user, drawing_id)
    
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
