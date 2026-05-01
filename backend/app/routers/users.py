from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from typing import List

from backend.app.core.auth import get_current_user, get_password_hash
from backend.app.core.database import get_db
from backend.app.models.curing import CustomElement, DefaultElement
from backend.app.models.users import User, UserRole
from backend.app.schemas.users import UserCreate, UserResponse
from backend.app.services.sms_service import SMSService

router = APIRouter(prefix="/api/users", tags=["Users"])


def _is_monitor_owned_contractor(current_user: User, target_user: User) -> bool:
    return (
        current_user.role == UserRole.MONITOR
        and target_user.role == UserRole.CONTRACTOR
        and target_user.created_by_monitor_id == current_user.id
    )


def _assert_can_manage_target(current_user: User, target_user: User) -> None:
    if current_user.role == UserRole.SUPERADMIN:
        return
    if current_user.id == target_user.id:
        return
    if _is_monitor_owned_contractor(current_user, target_user):
        return
    raise HTTPException(status_code=403, detail="Forbidden")


@router.get("/", response_model=List[UserResponse])
def get_users(role: str = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role not in [UserRole.SUPERADMIN, UserRole.MONITOR]:
        raise HTTPException(status_code=403, detail="Unauthorized access to user list.")

    query = db.query(User)

    if current_user.role == UserRole.MONITOR:
        if role and role != UserRole.CONTRACTOR.value:
            raise HTTPException(status_code=403, detail="Monitors can only view contractors.")
        query = query.filter(
            User.role == UserRole.CONTRACTOR,
            User.created_by_monitor_id == current_user.id,
        )
        return query.order_by(User.full_name.asc(), User.id.asc()).all()

    if role:
        query = query.filter(User.role == role)
    return query.order_by(User.id.asc()).all()


@router.get("/check-email")
def check_email_availability(email: str, exclude_user_id: int | None = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    normalized_email = email.strip().lower()
    if not normalized_email:
        raise HTTPException(status_code=400, detail="Email is required.")

    query = db.query(User).filter((User.email == normalized_email) | (User.username == normalized_email))
    if exclude_user_id:
        query = query.filter(User.id != exclude_user_id)
    existing_user = query.first()
    return {"exists": existing_user is not None}


@router.post("/", response_model=UserResponse)
def create_user(user: UserCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role not in [UserRole.SUPERADMIN, UserRole.MONITOR]:
        raise HTTPException(status_code=403, detail="Unauthorized to create users.")

    if current_user.role == UserRole.MONITOR and user.role != UserRole.CONTRACTOR:
        raise HTTPException(status_code=403, detail="Monitors can only create contractor accounts.")

    normalized_email = user.email.strip().lower()
    if not normalized_email:
        raise HTTPException(status_code=400, detail="Email is required.")

    existing_user = db.query(User).filter((User.email == normalized_email) | (User.username == normalized_email)).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="User with this email already exists.")

    db_user = User(
        username=normalized_email,
        email=normalized_email,
        full_name=user.full_name.strip() if user.full_name else None,
        hashed_password=get_password_hash(user.password),
        role=user.role,
        mobile_number=user.mobile_number,
        is_active=1,
        created_by_monitor_id=current_user.id if current_user.role == UserRole.MONITOR and user.role == UserRole.CONTRACTOR else None,
    )

    try:
        db.add(db_user)
        db.flush()
        if user.role == UserRole.MONITOR:
            default_elements = db.query(DefaultElement).order_by(DefaultElement.id.asc()).all()
            for element in default_elements:
                db.add(CustomElement(
                    user_id=db_user.id,
                    element_name=element.element_name,
                    geometry_type=element.geometry_type,
                    required_curing_days=element.required_curing_days,
                    description=element.description,
                    is_active=element.is_active,
                ))
        db.commit()
        db.refresh(db_user)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="A user with this email already exists.")
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"User creation failed: {str(e)}")

    return db_user


@router.patch("/{user_id}", response_model=UserResponse)
def update_user(user_id: int, user_data: dict = Body(...), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    db_user = db.query(User).filter(User.id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")

    _assert_can_manage_target(current_user, db_user)

    next_email = None
    if "email" in user_data and user_data["email"] is not None:
        next_email = str(user_data["email"]).strip().lower()
        if not next_email:
            raise HTTPException(status_code=400, detail="Email cannot be empty.")
        duplicate = db.query(User).filter(User.email == next_email, User.id != user_id).first()
        if duplicate:
            raise HTTPException(status_code=400, detail="User with this email already exists.")

    for key, value in user_data.items():
        if key in ["id", "password", "hashed_password", "created_by_monitor_id", "role"]:
            continue
        if key == "email":
            db_user.email = next_email
            db_user.username = next_email
            continue
        if key == "full_name":
            db_user.full_name = value.strip() if isinstance(value, str) else value
            continue
        if hasattr(db_user, key):
            setattr(db_user, key, value)

    db.commit()
    db.refresh(db_user)
    return db_user


@router.post("/{user_id}/toggle-active")
def toggle_user_active(user_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    _assert_can_manage_target(current_user, user)
    if current_user.role == UserRole.MONITOR and user.role != UserRole.CONTRACTOR:
        raise HTTPException(status_code=403, detail="Monitors can only manage contractors.")
    user.is_active = 0 if user.is_active else 1
    db.commit()
    return {"status": "success", "is_active": user.is_active}


@router.post("/{user_id}/reset-password")
def reset_user_password(user_id: int, new_password: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    _assert_can_manage_target(current_user, user)
    if len(new_password or "") < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")
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
