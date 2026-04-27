from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import List

from backend.app.core.database import get_db
from backend.app.models.curing import GeometryElement, ElementType
from backend.app.schemas.curing import CuringLogCreate, GeometryElementResponse

router = APIRouter(prefix="/api/curing", tags=["Curing Fields"])

@router.get("/elements", response_model=List[GeometryElementResponse])
def get_all_elements(db: Session = Depends(get_db)):
    """
    Returns all structurally parsed vectors so the Canvas can render them.
    """
    elements = db.query(GeometryElement).all()
    return elements

@router.post("/log", response_model=GeometryElementResponse)
def log_curing_start(payload: CuringLogCreate, db: Session = Depends(get_db)):
    """
    The Contractor taps an element on screen.
    This sets poured_date to NOW() and calculates the curing_end_date automatically.
    """
    element = db.query(GeometryElement).filter(GeometryElement.element_id == payload.element_id).first()
    
    if not element:
        raise HTTPException(status_code=404, detail="Geometry Element not found")

    # Set timestamps
    now = datetime.now()
    element.poured_date = now
    
    # Mathematical logic for curing duration
    if element.element_type == ElementType.SLAB:
        element.curing_end_date = now + timedelta(days=14)
    elif element.element_type == ElementType.COLUMN:
        element.curing_end_date = now + timedelta(days=7)
    elif element.element_type == ElementType.WALL:
        element.curing_end_date = now + timedelta(days=7)
    else:
        # Fallback default
        element.curing_end_date = now + timedelta(days=10)

    # Assign to contractor
    element.contractor_id = payload.contractor_id
    element.sms_sent = False

    db.commit()
    db.refresh(element)
    
    return element
