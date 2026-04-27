from backend.app.core.database import engine
from sqlalchemy import text

def check_schema():
    with engine.connect() as conn:
        res = conn.execute(text("DESCRIBE users")).fetchall()
        for col in res:
            print(col)

if __name__ == "__main__":
    check_schema()
