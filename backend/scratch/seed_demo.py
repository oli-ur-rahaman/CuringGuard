from backend.app.core.database import SessionLocal
from backend.app.models.hierarchy import Project, Package, Structure
from backend.app.models.users import User, UserRole
from backend.app.models.curing import CuringRule
from backend.app.core.auth import get_password_hash

def seed():
    db = SessionLocal()
    
    # 1. Create Superadmin
    super_user = db.query(User).filter_by(username="super").first()
    if not super_user:
        super_user = User(
            username="super",
            email="superadmin@curingguard.com",
            full_name="Platform Superadmin",
            hashed_password=get_password_hash("super123"),
            role=UserRole.SUPERADMIN,
            mobile_number="01000000000"
        )
        db.add(super_user)
        db.flush()
    
    # 2. Create Monitor
    admin_user = db.query(User).filter_by(username="admin").first()
    if not admin_user:
        admin_user = User(
            username="admin",
            email="admin@site.com",
            full_name="Mugda Site Manager",
            hashed_password=get_password_hash("admin123"),
            role=UserRole.MONITOR,
            mobile_number="01700000000"
        )
        db.add(admin_user)
        db.flush()
    
    # 3. Create Project Structure
    project = Project(name="Mugda Hostel", monitor_id=admin_user.id)
    db.add(project)
    db.flush()
    
    pkg = Package(name="Phase 1", project_id=project.id)
    db.add(pkg)
    db.flush()
    
    structure = Structure(name="Block A", package_id=pkg.id)
    db.add(structure)

    # 4. Global Curing Rules
    if db.query(CuringRule).count() == 0:
        rules = [
            CuringRule(element_name="Wall", geometry_type="Line / Area", required_curing_days=7),
            CuringRule(element_name="Column", geometry_type="Point / Area", required_curing_days=7),
            CuringRule(element_name="Slab", geometry_type="Area", required_curing_days=10),
            CuringRule(element_name="Footing", geometry_type="Area", required_curing_days=14)
        ]
        db.add_all(rules)
    
    db.commit()
    print("Seeded Final Simplified Schema Successfully!")

if __name__ == "__main__":
    seed()
