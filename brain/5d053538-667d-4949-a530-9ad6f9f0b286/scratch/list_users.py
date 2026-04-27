from backend.app.core.database import SessionLocal
from backend.app.models.users import User

db = SessionLocal()
users = db.query(User).all()
print(f"Found {len(users)} users:")
for u in users:
    print(f"- ID: {u.id}, Username: {u.username}, Role: {u.role.value}")
db.close()
