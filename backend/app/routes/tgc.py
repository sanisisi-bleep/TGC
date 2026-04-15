from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.database.connection import get_db
from app.services.tgc_service import TgcService

router = APIRouter(prefix="/tgc", tags=["tgc"])

class TgcCreate(BaseModel):
    name: str
    description: str = None

@router.get("")
def get_tgc(db: Session = Depends(get_db)):
    service = TgcService(db)
    return service.get_all_tgc()

@router.post("")
def create_tgc(tgc: TgcCreate, db: Session = Depends(get_db)):
    service = TgcService(db)
    return service.create_tgc(**tgc.dict())
