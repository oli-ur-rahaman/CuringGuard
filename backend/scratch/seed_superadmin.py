import os
import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.app.core.database import SessionLocal
from backend.app.models.users import User, UserRole
from backend.app.core.auth import get_password_hash

def seed_superadmin():
    db = SessionLocal()
    try:
        # Create a true Superadmin User
        superadmin = db.query(User).filter(User.username == "superadmin").first()
        if not superadmin:
            superadmin = User(
                username="superadmin",
                email="superadmin_new@curingguard.com",
                hashed_password=get_password_hash("superadmin123"),
                role=UserRole.SUPERADMIN,
                mobile_number="01999888777", # Dummy 11-digit number
                tenant_id=None # Superadmins often don't belong to a single tenant
            )
            db.add(superadmin)
            db.commit()
            print("Successfully created True Superadmin: superadmin / superadmin123")
        else:
            # If it exists but maybe has wrong role/password, fix it
            superadmin.role = UserRole.SUPERADMIN
            superadmin.hashed_password = get_password_hash("superadmin123")
            db.commit()
            print("Superadmin user already existed, but its role and password have been forcefully reset.")

    except Exception as e:
        print(f"Error seeding superadmin: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    seed_superadmin()
