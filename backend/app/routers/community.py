from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import exists, func, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.auth import get_current_user, require_role
from app.database import get_db
from app.models import Post, PostLike, PostReport, User
from app.schemas.community import (
    ModerationPostOut,
    MyPostOut,
    PostCreate,
    PostOut,
    PostReview,
    ReportCreate,
    ReportOut,
    ReportResolve,
)
from app.utils import local_day, local_today

router = APIRouter(prefix="/api", tags=["community"])

# stops one account from flooding the moderation queue
MAX_POSTS_PER_DAY = 10

like_count = (
    select(func.count()).where(PostLike.post_id == Post.post_id).correlate(Post).scalar_subquery()
)
open_reports = (
    select(func.count())
    .where(PostReport.post_id == Post.post_id, PostReport.status == "open")
    .correlate(Post)
    .scalar_subquery()
)


def _approved_post_or_404(db: Session, post_id: int) -> Post:
    """Likes and reports are only possible on posts visible in the feed."""
    post = db.get(Post, post_id)
    if post is None or post.status != "approved":
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="not_found")
    return post


@router.post("/posts", response_model=MyPostOut, status_code=status.HTTP_201_CREATED)
def create_post(
    body: PostCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> MyPostOut:
    """FR-08: new posts wait for admin approval before they appear in the feed.
    429 'post_limit_reached' after 10 posts in one day (Amman time)."""
    posted_today = db.scalar(
        select(func.count()).where(
            Post.user_id == user.user_id, local_day(Post.created_at) == local_today()
        )
    )
    if posted_today >= MAX_POSTS_PER_DAY:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, detail="post_limit_reached")
    post = Post(user_id=user.user_id, content=body.content)
    db.add(post)
    db.commit()
    db.refresh(post)
    return MyPostOut(post_id=post.post_id, content=post.content, status=post.status,
                     rejection_reason=None, created_at=post.created_at, like_count=0)


@router.get("/posts", response_model=list[PostOut])
def feed(
    before_id: int | None = Query(default=None, description="for paging: ids below this one"),
    limit: int = Query(default=20, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[PostOut]:
    """Approved posts, newest first. For the next page, pass the last post_id as before_id."""
    liked = exists().where(PostLike.post_id == Post.post_id, PostLike.user_id == user.user_id)
    query = (
        select(Post, User.name, like_count, liked)
        .join(User, User.user_id == Post.user_id)
        .where(Post.status == "approved")
    )
    if before_id is not None:
        query = query.where(Post.post_id < before_id)
    rows = db.execute(query.order_by(Post.post_id.desc()).limit(limit)).all()
    return [
        PostOut(post_id=p.post_id, content=p.content, author_name=name, created_at=p.created_at,
                like_count=likes, liked_by_me=is_liked, is_mine=p.user_id == user.user_id)
        for p, name, likes, is_liked in rows
    ]


@router.get("/posts/mine", response_model=list[MyPostOut])
def my_posts(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[MyPostOut]:
    """The user's own posts, including pending and rejected ones (with the reason)."""
    rows = db.execute(
        select(Post, like_count).where(Post.user_id == user.user_id).order_by(Post.post_id.desc())
    ).all()
    return [
        MyPostOut(post_id=p.post_id, content=p.content, status=p.status,
                  rejection_reason=p.rejection_reason, created_at=p.created_at, like_count=likes)
        for p, likes in rows
    ]


@router.delete("/posts/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_post(
    post_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> Response:
    """Authors can delete their own posts; admins can delete any post."""
    post = db.get(Post, post_id)
    if post is None or (post.user_id != user.user_id and user.role != "admin"):
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="not_found")
    db.delete(post)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put("/posts/{post_id}/like", status_code=status.HTTP_204_NO_CONTENT)
def like_post(
    post_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> Response:
    """Liking twice is harmless."""
    _approved_post_or_404(db, post_id)
    db.execute(
        insert(PostLike).values(post_id=post_id, user_id=user.user_id).on_conflict_do_nothing()
    )
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/posts/{post_id}/like", status_code=status.HTTP_204_NO_CONTENT)
def unlike_post(
    post_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> Response:
    like = db.get(PostLike, (post_id, user.user_id))
    if like is not None:
        db.delete(like)
        db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/posts/{post_id}/report", status_code=status.HTTP_201_CREATED)
def report_post(
    post_id: int,
    body: ReportCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Each user can report a post once."""
    post = _approved_post_or_404(db, post_id)
    if post.user_id == user.user_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="cannot_report_own_post")
    already = db.scalar(
        select(PostReport).where(PostReport.post_id == post_id, PostReport.reporter_id == user.user_id)
    )
    if already is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="already_reported")
    report = PostReport(post_id=post_id, reporter_id=user.user_id, reason=body.reason.strip())
    db.add(report)
    db.commit()
    return {"report_id": report.report_id}


# ---- admin: moderation ----

@router.get("/admin/posts", response_model=list[ModerationPostOut], tags=["community moderation"])
def moderation_queue(
    status_filter: Literal["pending", "approved", "rejected"] = Query(default="pending", alias="status"),
    reported_only: bool = False,
    limit: int = Query(default=50, ge=1, le=200),
    admin: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
) -> list[ModerationPostOut]:
    """Posts waiting for review, oldest first (so nothing waits too long)."""
    query = (
        select(Post, User.name, open_reports)
        .join(User, User.user_id == Post.user_id)
        .where(Post.status == status_filter)
    )
    if reported_only:
        query = query.where(open_reports > 0)
    rows = db.execute(query.order_by(Post.created_at).limit(limit)).all()
    return [
        ModerationPostOut(
            post_id=p.post_id, content=p.content, status=p.status, author_id=p.user_id,
            author_name=name, created_at=p.created_at, reviewed_at=p.reviewed_at,
            rejection_reason=p.rejection_reason, open_reports=reports,
        )
        for p, name, reports in rows
    ]


@router.post("/admin/posts/{post_id}/review", response_model=MyPostOut, tags=["community moderation"])
def review_post(
    post_id: int,
    body: PostReview,
    admin: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
) -> MyPostOut:
    """Approve or reject a post. An approved post can later be rejected (e.g. after reports)."""
    post = db.get(Post, post_id)
    if post is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="not_found")
    post.status = "approved" if body.decision == "approve" else "rejected"
    post.rejection_reason = body.rejection_reason.strip() if body.rejection_reason else None
    post.reviewed_by = admin.user_id
    post.reviewed_at = datetime.now(timezone.utc)
    db.commit()
    likes = db.scalar(select(func.count()).where(PostLike.post_id == post_id))
    return MyPostOut(post_id=post.post_id, content=post.content, status=post.status,
                     rejection_reason=post.rejection_reason, created_at=post.created_at,
                     like_count=likes)


@router.get("/admin/reports", response_model=list[ReportOut], tags=["community moderation"])
def list_reports(
    status_filter: Literal["open", "action_taken", "dismissed"] = Query(default="open", alias="status"),
    limit: int = Query(default=50, ge=1, le=200),
    admin: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
) -> list[ReportOut]:
    rows = db.execute(
        select(PostReport, Post.content, Post.status)
        .join(Post, Post.post_id == PostReport.post_id)
        .where(PostReport.status == status_filter)
        .order_by(PostReport.created_at)
        .limit(limit)
    ).all()
    return [
        ReportOut(
            report_id=r.report_id, post_id=r.post_id, post_content=content, post_status=post_status,
            reporter_id=r.reporter_id, reason=r.reason, status=r.status,
            created_at=r.created_at, reviewed_at=r.reviewed_at,
        )
        for r, content, post_status in rows
    ]


@router.post("/admin/reports/{report_id}/resolve", status_code=status.HTTP_204_NO_CONTENT,
             tags=["community moderation"])
def resolve_report(
    report_id: int,
    body: ReportResolve,
    admin: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
) -> Response:
    report = db.get(PostReport, report_id)
    if report is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="not_found")
    if report.status != "open":
        raise HTTPException(status.HTTP_409_CONFLICT, detail="already_resolved")
    now = datetime.now(timezone.utc)

    if body.resolution == "dismissed":
        report.status, report.reviewed_by, report.reviewed_at = "dismissed", admin.user_id, now
    else:
        post = db.get(Post, report.post_id)
        post.status = "rejected"
        post.rejection_reason = f"Removed after a report: {report.reason}"[:255]
        post.reviewed_by, post.reviewed_at = admin.user_id, now
        db.execute(
            update(PostReport)
            .where(PostReport.post_id == report.post_id, PostReport.status == "open")
            .values(status="action_taken", reviewed_by=admin.user_id, reviewed_at=now)
        )
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
