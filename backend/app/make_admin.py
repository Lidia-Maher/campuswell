"""Give a registered user the admin or counsellor role from the command line.
Needed once on a fresh database, because only an admin can change roles in the API.

    python -m app.make_admin someone@psut.edu.jo
    python -m app.make_admin someone@psut.edu.jo --role counsellor

The person must have logged in to the app and registered first.
On Render, run it from the service's Shell tab.
"""

import argparse
import sys

from sqlalchemy import func, select

from app.database import SessionLocal
from app.models import User


def set_role(email: str, role: str) -> User:
    with SessionLocal() as db:
        user = db.scalar(select(User).where(func.lower(User.email) == email.strip().lower()))
        if user is None:
            raise LookupError(email)
        user.role = role
        user.is_active = True
        db.commit()
        return user


def main() -> None:
    parser = argparse.ArgumentParser(description="Give a registered user a staff role")
    parser.add_argument("email")
    parser.add_argument("--role", choices=["admin", "counsellor"], default="admin")
    args = parser.parse_args()
    try:
        user = set_role(args.email, args.role)
    except LookupError:
        sys.exit(f"No registered user with email {args.email}. They must log in to the app and register first.")
    print(f"{user.name} <{user.email}> is now {user.role}.")


if __name__ == "__main__":
    main()
