from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from backend.app.core.auth import get_current_user
from backend.app.core.database import get_db
from backend.app.models.curing import CustomElement, DefaultElement
from backend.app.models.users import User, UserRole
from backend.app.schemas.library import CuringRuleCreate, CuringRuleResponse

router = APIRouter(prefix="/api/library", tags=["Library"])

@router.get("/", response_model=List[CuringRuleResponse])
def get_rules(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role == UserRole.MONITOR:
        return db.query(CustomElement).filter(
            CustomElement.user_id == current_user.id,
            CustomElement.is_active == True,
        ).order_by(CustomElement.id.asc()).all()
    return db.query(DefaultElement).order_by(DefaultElement.id.asc()).all()

@router.post("/", response_model=CuringRuleResponse)
def create_rule(rule: CuringRuleCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role == UserRole.MONITOR:
        db_rule = CustomElement(user_id=current_user.id, **rule.model_dump())
    elif current_user.role == UserRole.SUPERADMIN:
        db_rule = DefaultElement(**rule.model_dump())
    else:
        raise HTTPException(status_code=403, detail="Forbidden")
    db.add(db_rule)
    db.commit()
    db.refresh(db_rule)
    return db_rule

@router.patch("/{rule_id}", response_model=CuringRuleResponse)
def update_rule(rule_id: int, rule_data: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role == UserRole.MONITOR:
        db_rule = db.query(CustomElement).filter(
            CustomElement.id == rule_id,
            CustomElement.user_id == current_user.id,
        ).first()
    elif current_user.role == UserRole.SUPERADMIN:
        db_rule = db.query(DefaultElement).filter(DefaultElement.id == rule_id).first()
    else:
        raise HTTPException(status_code=403, detail="Forbidden")
    if not db_rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    for key, value in rule_data.items():
        if key == "user_id":
            continue
        if hasattr(db_rule, key):
            setattr(db_rule, key, value)
    db.commit()
    db.refresh(db_rule)
    return db_rule

@router.delete("/{rule_id}")
def delete_rule(rule_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role == UserRole.MONITOR:
        db_rule = db.query(CustomElement).filter(
            CustomElement.id == rule_id,
            CustomElement.user_id == current_user.id,
        ).first()
        if not db_rule:
            raise HTTPException(status_code=404, detail="Rule not found")
        db_rule.is_active = False
        db.commit()
        return {"status": "success"}
    if current_user.role == UserRole.SUPERADMIN:
        db_rule = db.query(DefaultElement).filter(DefaultElement.id == rule_id).first()
    else:
        raise HTTPException(status_code=403, detail="Forbidden")
    if not db_rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    db.delete(db_rule)
    db.commit()
    return {"status": "success"}
