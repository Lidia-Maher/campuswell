from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import TokenClaims, get_current_user, get_token_claims
from app.database import get_db
from app.models import User
from app.schemas.user import UserOut, UserRegister, UserUpdate

router = APIRouter(prefix="/api/me", tags=["account"])


@router.get("", response_model=UserOut)
def get_me(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> User:
    """Call right after Firebase login. 403 'not_registered' means: show the registration screen."""
    user.last_login_at = datetime.now(timezone.utc)
    db.commit()
    return user


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(
    body: UserRegister,
    claims: TokenClaims = Depends(get_token_claims),
    db: Session = Depends(get_db),
) -> User:
    """First-time registration after Firebase login: name, department and consent."""
    if claims.email is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="email_required")
    if db.scalar(select(User).where(User.firebase_uid == claims.uid)) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="already_registered")
    if db.scalar(select(User).where(User.email == claims.email)) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="email_in_use")

    now = datetime.now(timezone.utc)
    user = User(
        firebase_uid=claims.uid,
        email=claims.email,
        name=body.name.strip(),
        department=body.department,
        consent_accepted_at=now,
        last_login_at=now,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.patch("", response_model=UserOut)
def update_me(
    body: UserUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> User:
    for field, value in body.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(user, field, value.strip() if isinstance(value, str) else value)
    db.commit()
    db.refresh(user)
    return user


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def delete_me(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> Response:
    """Deletes the account and ALL personal data (ON DELETE CASCADE).
    The frontend should then delete the Firebase account with user.delete()."""
    db.delete(user)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
