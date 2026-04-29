from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from typing import List, Optional

from backend.app.core.database import get_db
from backend.app.core.auth import get_current_user, get_password_hash
from backend.app.models.users import User, UserRole
from backend.app.schemas.users import UserResponse, UserCreate
from backend.app.services.sms_service import SMSService

router = APIRouter(prefix="/api/users", tags=["Users"])

@router.get("/", response_model=List[UserResponse])
def get_users(role: str = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role not in [UserRole.SUPERADMIN, UserRole.MONITOR]:
        raise HTTPException(status_code=403, detail="Unauthorized access to user list.")
    query = db.query(User)
    if role:
        query = query.filter(User.role == role)
    
    # If monitor, maybe restrict them to only see contractors or monitors
    # But for now, returning filtered query is fine since it's an internal admin tool
    return query.all()

@router.post("/", response_model=UserResponse)
def create_user(user: UserCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != UserRole.SUPERADMIN:
        raise HTTPException(status_code=403, detail="Unauthorized to create users.")
    existing_user = db.query(User).filter(User.email == user.email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="User with this email already exists.")

    db_user = User(
        username=user.username,
        email=user.email,
        full_name=user.full_name,
        hashed_password=get_password_hash(user.password),
        role=user.role,
        mobile_number=user.mobile_number,
        is_active=1
    )
    db.add(db_user)
    try:
        db.commit()
        db.refresh(db_user)
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail="A user with this email already exists.")
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"User creation failed: {str(e)}")
    return db_user

from fastapi import Body

@router.patch("/{user_id}", response_model=UserResponse)
def update_user(user_id: int, user_data: dict = Body(...), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != UserRole.SUPERADMIN and current_user.id != user_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    
    db_user = db.query(User).filter(User.id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    for key, value in user_data.items():
        if key in ["id", "password", "hashed_password"]:
            continue
        if hasattr(db_user, key):
            setattr(db_user, key, value)
    
    db.commit()
    db.refresh(db_user)
    return db_user

@router.post("/{user_id}/toggle-active")
def toggle_user_active(user_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != UserRole.SUPERADMIN:
        raise HTTPException(status_code=403, detail="Forbidden")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_active = not user.is_active
    db.commit()
    return {"status": "success", "is_active": user.is_active}

@router.post("/{user_id}/reset-password")
def reset_user_password(user_id: int, new_password: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != UserRole.SUPERADMIN:
        raise HTTPException(status_code=403, detail="Forbidden")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.hashed_password = get_password_hash(new_password)
    db.commit()
    return {"status": "success"}

@router.delete("/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != UserRole.SUPERADMIN:
        raise HTTPException(status_code=403, detail="Forbidden")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    db.delete(user)
    db.commit()
    return {"status": "success"}

@router.post("/{user_id}/ping")
def ping_user(user_id: int, message: str = Query(...), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    result = SMSService.send_sms(recipients=[user.mobile_number], sender_id="CURING", message=message)
    return result
