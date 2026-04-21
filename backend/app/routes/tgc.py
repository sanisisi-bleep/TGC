from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.database.connection import get_db
from app.models import User
from app.services.auth_service import require_admin_user
from app.services.tgc_service import TgcService

router = APIRouter(prefix="/tgc", tags=["tgc"])

class TgcCreate(BaseModel):
    name: str
    description: str = None

@router.get("")
def get_tgc(response: Response, db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "public, max-age=300, s-maxage=1800, stale-while-revalidate=86400"
    service = TgcService(db)
    return service.get_all_tgc()

@router.post("")
def create_tgc(
    tgc: TgcCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_user),
):
    service = TgcService(db)
    return service.create_tgc(**tgc.dict())
