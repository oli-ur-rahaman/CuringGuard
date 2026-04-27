from backend.app.core.database import engine
from sqlalchemy import text

with engine.connect() as conn:
    print("Attempting to add missing columns...")
    try:
        conn.execute(text("ALTER TABLE users ADD COLUMN tenant_id INTEGER NULL"))
        print("Added tenant_id to users table.")
    except Exception as e:
        print(f"tenant_id might already exist or error: {e}")
        
    try:
        conn.execute(text("ALTER TABLE users ADD CONSTRAINT fk_user_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)"))
        print("Added foreign key constraint.")
    except Exception as e:
        print(f"Constraint error: {e}")
        
    conn.commit()
    print("Done!")
