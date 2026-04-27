from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from backend.app.core.database import get_db
from backend.app.models.curing import CuringRule
from backend.app.schemas.library import CuringRuleCreate, CuringRuleResponse

router = APIRouter(prefix="/api/library", tags=["Library"])

@router.get("/", response_model=List[CuringRuleResponse])
def get_rules(db: Session = Depends(get_db)):
    return db.query(CuringRule).all()

@router.post("/", response_model=CuringRuleResponse)
def create_rule(rule: CuringRuleCreate, db: Session = Depends(get_db)):
    db_rule = CuringRule(**rule.model_dump())
    db.add(db_rule)
    db.commit()
    db.refresh(db_rule)
    return db_rule

@router.patch("/{rule_id}", response_model=CuringRuleResponse)
def update_rule(rule_id: int, rule_data: dict, db: Session = Depends(get_db)):
    db_rule = db.query(CuringRule).filter(CuringRule.id == rule_id).first()
    if not db_rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    for key, value in rule_data.items():
        if hasattr(db_rule, key):
            setattr(db_rule, key, value)
    db.commit()
    db.refresh(db_rule)
    return db_rule

@router.delete("/{rule_id}")
def delete_rule(rule_id: int, db: Session = Depends(get_db)):
    db_rule = db.query(CuringRule).filter(CuringRule.id == rule_id).first()
    if not db_rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    db.delete(db_rule)
    db.commit()
    return {"status": "success"}
