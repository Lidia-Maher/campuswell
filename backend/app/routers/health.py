from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_db

router = APIRouter(tags=["health"])


@router.get("/health")
def health(db: Session = Depends(get_db)) -> dict:
    """Used by Render's health check, and to wake the server before a demo."""
    db.execute(text("SELECT 1"))
    return {"status": "ok", "database": "ok"}
