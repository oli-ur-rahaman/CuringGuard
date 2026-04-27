from backend.app.core.database import engine, Base
from sqlalchemy import text
# Import all models to ensure they are registered with Base.metadata
from backend.app.models.hierarchy import Project, Package, Structure, Drawing
from backend.app.models.users import User
from backend.app.models.curing import GeometryElement, CuringRule
from backend.app.models.settings import SystemSetting

def force_rebuild():
    with engine.connect() as conn:
        conn.execute(text("SET FOREIGN_KEY_CHECKS = 0"))
        
        # Get all tables
        result = conn.execute(text("SHOW TABLES"))
        tables = [row[0] for row in result]
        
        for table in tables:
            print(f"Dropping {table}...")
            conn.execute(text(f"DROP TABLE IF EXISTS {table}"))
        
        conn.execute(text("SET FOREIGN_KEY_CHECKS = 1"))
        conn.commit()
    
    print("Recreating all tables with new schema (CuringRules & Settings)...")
    Base.metadata.create_all(bind=engine)
    print("Success!")

if __name__ == "__main__":
    force_rebuild()
