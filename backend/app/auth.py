"""Authentication: the frontend signs in with Firebase and sends the Firebase ID token
as "Authorization: Bearer <token>". The backend verifies it with the Firebase Admin SDK.
No passwords or custom JWTs are stored or issued here."""

import json
from dataclasses import dataclass
from functools import lru_cache

import firebase_admin
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from firebase_admin import auth as firebase_auth
from firebase_admin import credentials
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.models import User

bearer_scheme = HTTPBearer(auto_error=False)


@dataclass
class TokenClaims:
    uid: str
    email: str | None
    email_verified: bool = False
    is_dev: bool = False  # dev-mode token: skips the email checks


@lru_cache
def _firebase_app() -> firebase_admin.App:
    settings = get_settings()
    if settings.firebase_credentials_json:
        cred = credentials.Certificate(json.loads(settings.firebase_credentials_json))
    elif settings.firebase_credentials_path:
        cred = credentials.Certificate(settings.firebase_credentials_path)
    else:
        raise RuntimeError("Set FIREBASE_CREDENTIALS_PATH or FIREBASE_CREDENTIALS_JSON")
    return firebase_admin.initialize_app(cred)


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(
        status.HTTP_401_UNAUTHORIZED, detail=detail, headers={"WWW-Authenticate": "Bearer"}
    )


def get_token_claims(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> TokenClaims:
    """Checks the Firebase ID token. Does not require the user to be registered yet."""
    if creds is None:
        raise _unauthorized("missing_token")
    token = creds.credentials

    # Local testing only: "Bearer dev:<name>" (refused in production, see config.py)
    if get_settings().auth_dev_mode and token.startswith("dev:"):
        name = token[4:] or "student"
        return TokenClaims(uid=f"dev-{name}", email=f"{name}@dev.campuswell.local",
                           email_verified=True, is_dev=True)

    try:
        decoded = firebase_auth.verify_id_token(token, app=_firebase_app())
    except firebase_auth.ExpiredIdTokenError:
        raise _unauthorized("token_expired")
    except (firebase_auth.InvalidIdTokenError, ValueError):
        raise _unauthorized("invalid_token")
    return TokenClaims(
        uid=decoded["uid"],
        email=decoded.get("email"),
        email_verified=bool(decoded.get("email_verified", False)),
    )


def check_email_allowed(claims: TokenClaims) -> None:
    """Registration rule: a verified university email. Firebase lets anyone sign up with any
    address, so without this check someone could register with an email they do not own."""
    if claims.is_dev:
        return
    if not claims.email_verified:
        # frontend: ask the user to click the link in the verification email, then call
        # user.getIdToken(true) to get a fresh token and try again
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="email_not_verified")
    allowed = get_settings().allowed_email_domain_list
    domain = (claims.email or "").rsplit("@", 1)[-1].lower()
    if allowed and domain not in allowed:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="email_domain_not_allowed")


def get_current_user(
    claims: TokenClaims = Depends(get_token_claims), db: Session = Depends(get_db)
) -> User:
    """Use this in every endpoint that needs a logged-in, registered user."""
    user = db.scalar(select(User).where(User.firebase_uid == claims.uid))
    if user is None:
        # frontend should send the user to the registration / consent screen
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="not_registered")
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="account_deactivated")
    return user


def require_role(*roles: str):
    """Example: user: User = Depends(require_role("admin"))"""

    def checker(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="forbidden")
        return user

    return checker
