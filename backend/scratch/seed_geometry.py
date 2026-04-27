import os
import sys
import json
import enum

# Ensure the app module can be found (pointing to the root directory)
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.app.core.database import SessionLocal
from backend.app.models.hierarchy import Tenant, Project, Package, Structure, Drawing
from backend.app.models.curing import GeometryElement, ElementType
from backend.app.services.geometry_service import GeometryService

def run_dwg_parse_and_seed():
    db = SessionLocal()
    
    try:
        # 1. Ensure basic hierarchy exists so we have a Drawing ID to attach to
        tenant = db.query(Tenant).first()
        if not tenant:
            tenant = Tenant(name="Default Tenant", subdomain="default")
            db.add(tenant)
            db.commit()
            
        project = db.query(Project).filter_by(tenant_id=tenant.id).first()
        if not project:
            project = Project(name="Boy's Hostel Mugda", tenant_id=tenant.id)
            db.add(project)
            db.commit()
            
        package = db.query(Package).filter_by(project_id=project.id).first()
        if not package:
            package = Package(name="Phase 1", project_id=project.id)
            db.add(package)
            db.commit()
            
        structure = db.query(Structure).filter_by(package_id=package.id).first()
        if not structure:
            structure = Structure(name="Main Building", package_id=package.id)
            db.add(structure)
            db.commit()
            
        drawing = db.query(Drawing).filter_by(structure_id=structure.id).first()
        if not drawing:
            drawing = Drawing(
                name="(1-17) ARCHITECTURAL PLAN", 
                structure_id=structure.id,
                file_path="d:\\CuringGuard\\Sample\\temp_dxf\\(1-17) ARCHITECTURAL PLAN BOY'S HOSTEL MUGDA 26.01.25.dxf"
            )
            db.add(drawing)
            db.commit()
            
        print(f"Hierarchy ready. Target Drawing ID: {drawing.id}")

        # 2. Extract Elements using GeometryService
        dxf_path = drawing.file_path
        print(f"Starting Geometry Extraction for: {dxf_path}")
        
        elements = GeometryService.extract_elements(dxf_path)
        print(f"Extracted {len(elements)} raw elements from DXF.")
        
        # 3. Map and Insert into GeometryElement Table
        inserted_count = 0
        
        for el in elements:
            # Map DXF Layer to Enum Type
            raw_type = el.get("element_type", "").upper()
            if "WALL" in raw_type:
                mapped_type = ElementType.WALL
            elif "COLUMN" in raw_type:
                mapped_type = ElementType.COLUMN
            elif "STAIR" in raw_type or "SLAB" in raw_type:
                mapped_type = ElementType.SLAB
            else:
                continue # Skip unknown types
                
            # Serialize vertices to JSON string
            coordinates_json = json.dumps(el.get("vertices", []))
            
            # Create GeometryElement
            element_id = el.get("element_id", f"gen_{inserted_count}")
            
            # Check if exists (using composite or simple heuristic)
            existing = db.query(GeometryElement).filter_by(element_id=element_id, drawing_id=drawing.id).first()
            if not existing:
                geom = GeometryElement(
                    element_id=element_id,
                    drawing_id=drawing.id,
                    element_type=mapped_type,
                    coordinates_json=coordinates_json
                )
                db.add(geom)
                inserted_count += 1
                
        db.commit()
        print(f"Successfully inserted {inserted_count} NEW geometry vectors into the database.")
        
    except Exception as e:
        db.rollback()
        print(f"Error during seeding: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    run_dwg_parse_and_seed()
