import os
import sys

# Add the project root to the python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from backend.app.core.database import engine
from sqlalchemy import text

def patch_db():
    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE curing_rules ADD COLUMN description VARCHAR(1000) NULL"))
            print("Added description column")
        except Exception as e:
            print("Could not add description column:", e)
            
        try:
            conn.execute(text("ALTER TABLE curing_rules ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP"))
            print("Added created_at column")
        except Exception as e:
            print("Could not add created_at column:", e)
            
        try:
            conn.execute(text("ALTER TABLE curing_rules ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"))
            print("Added updated_at column")
        except Exception as e:
            print("Could not add updated_at column:", e)
        
        conn.commit()

if __name__ == "__main__":
    patch_db()
