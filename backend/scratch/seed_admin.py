from sqlalchemy.orm import Session
from backend.app.core.database import SessionLocal, engine
from backend.app.models.users import User, UserRole
from backend.app.models.hierarchy import Tenant
from backend.app.core.auth import get_password_hash

def seed():
    db = SessionLocal()
    try:
        # Create a Demo Tenant if not exists
        tenant = db.query(Tenant).filter(Tenant.name == "Bureau of Engineering").first()
        if not tenant:
            tenant = Tenant(name="Bureau of Engineering", subdomain="boe")
            db.add(tenant)
            db.commit()
            db.refresh(tenant)
            print(f"Created Tenant: {tenant.name}")

        # Create a Superadmin User
        admin = db.query(User).filter(User.username == "admin").first()
        if not admin:
            admin = User(
                username="admin",
                hashed_password=get_password_hash("admin123"),
                role=UserRole.MONITOR,
                mobile_number="01711223344",
                tenant_id=tenant.id
            )
            db.add(admin)
            db.commit()
            print("Created Admin User: admin / admin123")
        else:
            print("Admin user already exists.")

    except Exception as e:
        print(f"Error seeding: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    seed()
