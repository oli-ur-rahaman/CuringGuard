from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from backend.app.core.database import get_db
from backend.app.models.hardware import Gateway
from backend.app.schemas.gateways import GatewayCreate, GatewayResponse

router = APIRouter(prefix="/api/gateways", tags=["Gateways"])

@router.get("/", response_model=List[GatewayResponse])
def get_gateways(db: Session = Depends(get_db)):
    return db.query(Gateway).all()

@router.post("/", response_model=GatewayResponse)
def create_gateway(gateway: GatewayCreate, db: Session = Depends(get_db)):
    db_gateway = Gateway(**gateway.model_dump())
    db.add(db_gateway)
    db.commit()
    db.refresh(db_gateway)
    return db_gateway

@router.patch("/{gateway_id}", response_model=GatewayResponse)
def update_gateway(gateway_id: int, gateway_data: dict, db: Session = Depends(get_db)):
    db_gateway = db.query(Gateway).filter(Gateway.id == gateway_id).first()
    if not db_gateway:
        raise HTTPException(status_code=404, detail="Gateway not found")
    for key, value in gateway_data.items():
        if hasattr(db_gateway, key):
            setattr(db_gateway, key, value)
    db.commit()
    db.refresh(db_gateway)
    return db_gateway

@router.delete("/{gateway_id}")
def delete_gateway(gateway_id: int, db: Session = Depends(get_db)):
    db_gateway = db.query(Gateway).filter(Gateway.id == gateway_id).first()
    if not db_gateway:
        raise HTTPException(status_code=404, detail="Gateway not found")
    db.delete(db_gateway)
    db.commit()
    return {"status": "success"}
