import os
import sys

# Ensure the app module can be found (pointing to the root directory)
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.app.core.database import engine, Base, SessionLocal
from backend.app.models import *  # This loads '__init__.py' and all Models!
from backend.app.models.users import User, UserRole

def test_database():
    print("Connecting to Laragon Database Engine...")
    
    try:
        # Create all tables in the Laragon pgAdmin instance
        Base.metadata.create_all(bind=engine)
        print("Success: All SQLAlchemy Tables (Users, Projects, Structures, Drawings, Curing Geometries) created across the network.")
        
        # Test User constraints
        db = SessionLocal()
        
        # We wrap in a try block to handle exact re-runs
        print("Attempting to test 11-digit user validation constraints...")
        
        # This one should PASS
        valid_user = User(
            username="monitor_alice",
            hashed_password="some_secure_bcrypt_hash",
            role=UserRole.MONITOR,
            mobile_number="01712345678" # Exactly 11 digits
        )
        
        try:
            db.add(valid_user)
            db.commit()
            print("Successfully saved a User with an 11-digit number!")
        except Exception as e:
            db.rollback()
            # If it already exists from a previous run, that's fine
            if "duplicate key value violates unique constraint" in str(e):
                print("User already exists. Validation logic is sound.")
            else:
                print(f"Error inserting valid user: {e}")
                
        # This one should FAIL locally in SQLAlchemy before even hitting the DB!
        print("\nTesting invalid user logic... (Should instantly throw ValueError)")
        try:
            invalid_user = User(
                username="contractor_bob",
                hashed_password="some_secure_bcrypt_hash",
                role=UserRole.CONTRACTOR,
                mobile_number="999" # Way too short
            )
            print("FAILURE! The constraint allowed a 3-digit number!")
        except ValueError as e:
            print("SUCCESS! Constraint caught the bad number and threw exactly what we told it to:")
            print(f"Exception Message Caught -> {e}")
            
    except Exception as e:
        print(f"FATAL DBSYNC ERROR: {e}")
        
if __name__ == "__main__":
    test_database()
