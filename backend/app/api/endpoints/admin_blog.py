import re
from datetime import datetime, timezone
from pathlib import Path
import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile, File, status
from pydantic import BaseModel, Field
from sqlalchemy import desc, or_
from sqlalchemy.orm import Session

from ..admin_dependencies import get_current_admin
from ...core.config import settings
from ...database import get_db
from ...database import SessionLocal
from ...models.admin_user import AdminUser
from ...models.blog_comment import BlogComment
from ...models.blog_post import BlogPost
from ...models.newsletter_signup import NewsletterSignup
from ...services.cache_service import CacheService
from ...services.email_service import send_blog_post_newsletter_email
from ...services.newsletter_tokens import make_unsubscribe_token

router = APIRouter(prefix="/admin/blog", tags=["admin-blog"])
cache = CacheService()


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _slugify(value: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9\\s-]", "", value or "").strip().lower()
    cleaned = re.sub(r"\\s+", "-", cleaned)
    cleaned = re.sub(r"-{2,}", "-", cleaned)
    return cleaned[:80].strip("-")


class BlogPostPayload(BaseModel):
    title: str = Field(..., min_length=4, max_length=160)
    slug: str | None = Field(None, max_length=80)
    excerpt: str | None = Field(None, max_length=280)
    image_url: str | None = Field(None, max_length=600)
    # Blog posts can be long (especially with formatting). Keep a generous cap to avoid
    # accidental huge payloads, while not blocking real-world posts.
    content: str = Field(..., min_length=10, max_length=200000)
    status: str = Field("draft", max_length=20)
    author_name: str | None = Field(None, max_length=80)
    published_at: datetime | None = None


class BlogPostUpsertPayload(BlogPostPayload):
    notify_newsletter: bool = False


class BlogPostAdminItem(BaseModel):
    id: int
    slug: str
    title: str
    status: str
    published_at: datetime | None = None
    created_at: datetime | None = None


class BlogPostsAdminResponse(BaseModel):
    items: list[BlogPostAdminItem]
    page: int
    page_size: int
    total: int


class BlogCommentAdminItem(BaseModel):
    id: int
    post_id: int
    name: str
    email: str | None = None
    content: str
    status: str
    created_at: datetime | None = None


class BlogCommentsAdminResponse(BaseModel):
    items: list[BlogCommentAdminItem]
    page: int
    page_size: int
    total: int


def _post_url(slug: str) -> str:
    base = (settings.site_url or "https://www.glucoforager.com").rstrip("/")
    return f"{base}/blog/{slug}"


def _unsubscribe_url(subscriber_id: int, email: str) -> str:
    base = (settings.site_url or "https://www.glucoforager.com").rstrip("/")
    token = make_unsubscribe_token(subscriber_id, email)
    return f"{base}/unsubscribe?token={token}"


def _send_post_to_newsletter_task(post_id: int) -> None:
    db = SessionLocal()
    try:
        post = db.query(BlogPost).filter(BlogPost.id == post_id).first()
        if not post or post.status != "published":
            return

        recipients = (
            db.query(NewsletterSignup)
            .filter(NewsletterSignup.status == "subscribed")
            .order_by(NewsletterSignup.id.asc())
            .limit(2000)
            .all()
        )
        if not recipients:
            post.newsletter_sent_at = _utcnow()
            db.commit()
            return

        post_url = _post_url(post.slug)
        for recipient in recipients:
            try:
                send_blog_post_newsletter_email(
                    to_email=recipient.email,
                    post_title=post.title,
                    post_excerpt=post.excerpt,
                    post_url=post_url,
                    image_url=post.image_url,
                    unsubscribe_url=_unsubscribe_url(recipient.id, recipient.email),
                )
            except Exception:
                continue

        post.newsletter_sent_at = _utcnow()
        db.commit()
    finally:
        db.close()


@router.post("/upload", status_code=201, response_model=dict)
async def upload_blog_image(
    file: UploadFile = File(...),
    current_admin: AdminUser = Depends(get_current_admin),  # noqa: ARG001
):
    content_type = (file.content_type or "").lower()
    if not content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image uploads are allowed")

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(data) > 5 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Image too large (max 5MB)")

    original = (file.filename or "").strip()
    suffix = Path(original).suffix.lower()
    if suffix not in {".png", ".jpg", ".jpeg", ".webp", ".gif"}:
        suffix = ".png" if content_type.endswith("png") else ".jpg"

    folder = Path(settings.uploads_dir) / "blog"
    folder.mkdir(parents=True, exist_ok=True)
    name = f"blog_{uuid.uuid4().hex}{suffix}"
    path = folder / name
    path.write_bytes(data)

    return {"ok": True, "url": f"/uploads/blog/{name}"}


@router.get("/posts", response_model=BlogPostsAdminResponse)
def admin_list_posts(
    page: int = 1,
    page_size: int = 20,
    q: str | None = None,
    status_filter: str | None = None,
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),  # noqa: ARG001
):
    page = max(1, page)
    page_size = min(max(1, page_size), 100)

    query = db.query(BlogPost)
    if status_filter:
        query = query.filter(BlogPost.status == status_filter.strip().lower())
    if q:
        term = f"%{q.strip()}%"
        query = query.filter(or_(BlogPost.title.ilike(term), BlogPost.slug.ilike(term)))

    total = query.count()
    items = (
        query.order_by(desc(BlogPost.published_at), desc(BlogPost.created_at))
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return BlogPostsAdminResponse(
        items=[
            BlogPostAdminItem(
                id=p.id,
                slug=p.slug,
                title=p.title,
                status=p.status,
                published_at=p.published_at,
                created_at=p.created_at,
            )
            for p in items
        ],
        page=page,
        page_size=page_size,
        total=total,
    )


@router.post("/posts", status_code=201, response_model=BlogPostAdminItem)
def admin_create_post(
    payload: BlogPostUpsertPayload,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),
):
    normalized_status = (payload.status or "draft").strip().lower()
    if normalized_status not in {"draft", "published"}:
        raise HTTPException(status_code=400, detail="Invalid status")

    slug = (payload.slug or "").strip().lower()
    if not slug:
        slug = _slugify(payload.title)
    else:
        slug = _slugify(slug)
    if not slug:
        raise HTTPException(status_code=400, detail="Invalid slug")

    exists = db.query(BlogPost).filter(BlogPost.slug == slug).first()
    if exists:
        raise HTTPException(status_code=409, detail="Slug already exists")

    published_at = payload.published_at
    if normalized_status == "published" and not published_at:
        published_at = _utcnow()

    post = BlogPost(
        slug=slug,
        title=payload.title.strip(),
        excerpt=payload.excerpt.strip() if payload.excerpt else None,
        image_url=payload.image_url.strip() if payload.image_url else None,
        content=payload.content.strip(),
        status=normalized_status,
        author_name=payload.author_name.strip() if payload.author_name else None,
        published_at=published_at,
        created_at=_utcnow(),
        updated_at=_utcnow(),
    )
    db.add(post)
    db.commit()
    db.refresh(post)

    if payload.notify_newsletter:
        if post.status != "published":
            raise HTTPException(status_code=400, detail="Post must be published to notify newsletter subscribers")
        send_count = cache.incr(f"blog:newsletter:admin:{current_admin.id}", ttl_seconds=60 * 60)
        if send_count > 3:
            raise HTTPException(status_code=429, detail="Too many newsletter sends. Please try again later.")
        if post.newsletter_sent_at is not None:
            raise HTTPException(status_code=409, detail="Newsletter has already been sent for this post")
        background_tasks.add_task(_send_post_to_newsletter_task, post.id)

    return BlogPostAdminItem(
        id=post.id,
        slug=post.slug,
        title=post.title,
        status=post.status,
        published_at=post.published_at,
        created_at=post.created_at,
    )


@router.get("/posts/{post_id}", response_model=BlogPostPayload)
def admin_get_post(
    post_id: int,
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),  # noqa: ARG001
):
    post = db.query(BlogPost).filter(BlogPost.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    return BlogPostPayload(
        title=post.title,
        slug=post.slug,
        excerpt=post.excerpt,
        image_url=post.image_url,
        content=post.content,
        status=post.status,
        author_name=post.author_name,
        published_at=post.published_at,
    )


@router.put("/posts/{post_id}", response_model=BlogPostAdminItem)
def admin_update_post(
    post_id: int,
    payload: BlogPostUpsertPayload,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),
):
    post = db.query(BlogPost).filter(BlogPost.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    normalized_status = (payload.status or "draft").strip().lower()
    if normalized_status not in {"draft", "published"}:
        raise HTTPException(status_code=400, detail="Invalid status")

    slug = (payload.slug or "").strip().lower()
    slug = _slugify(slug) if slug else _slugify(payload.title)
    if not slug:
        raise HTTPException(status_code=400, detail="Invalid slug")
    if slug != post.slug:
        exists = db.query(BlogPost).filter(BlogPost.slug == slug).first()
        if exists:
            raise HTTPException(status_code=409, detail="Slug already exists")

    post.slug = slug
    post.title = payload.title.strip()
    post.excerpt = payload.excerpt.strip() if payload.excerpt else None
    post.image_url = payload.image_url.strip() if payload.image_url else None
    post.content = payload.content.strip()
    post.status = normalized_status
    post.author_name = payload.author_name.strip() if payload.author_name else None
    if normalized_status == "published" and not post.published_at:
        post.published_at = payload.published_at or _utcnow()
    if normalized_status == "draft":
        post.published_at = payload.published_at
    post.updated_at = _utcnow()

    db.commit()

    if payload.notify_newsletter:
        if post.status != "published":
            raise HTTPException(status_code=400, detail="Post must be published to notify newsletter subscribers")
        send_count = cache.incr(f"blog:newsletter:admin:{current_admin.id}", ttl_seconds=60 * 60)
        if send_count > 3:
            raise HTTPException(status_code=429, detail="Too many newsletter sends. Please try again later.")
        if post.newsletter_sent_at is not None:
            raise HTTPException(status_code=409, detail="Newsletter has already been sent for this post")
        background_tasks.add_task(_send_post_to_newsletter_task, post.id)

    return BlogPostAdminItem(
        id=post.id,
        slug=post.slug,
        title=post.title,
        status=post.status,
        published_at=post.published_at,
        created_at=post.created_at,
    )


@router.delete("/posts/{post_id}", status_code=204)
def admin_delete_post(
    post_id: int,
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),  # noqa: ARG001
):
    post = db.query(BlogPost).filter(BlogPost.id == post_id).first()
    if not post:
        return
    db.delete(post)
    db.commit()
    return


@router.get("/comments", response_model=BlogCommentsAdminResponse)
def admin_list_comments(
    page: int = 1,
    page_size: int = 30,
    post_id: int | None = None,
    status_filter: str | None = None,
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),  # noqa: ARG001
):
    page = max(1, page)
    page_size = min(max(1, page_size), 200)
    query = db.query(BlogComment)
    if post_id:
        query = query.filter(BlogComment.post_id == post_id)
    if status_filter:
        query = query.filter(BlogComment.status == status_filter.strip().lower())
    total = query.count()
    items = (
        query.order_by(desc(BlogComment.created_at), desc(BlogComment.id))
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return BlogCommentsAdminResponse(
        items=[
            BlogCommentAdminItem(
                id=c.id,
                post_id=c.post_id,
                name=c.name,
                email=c.email,
                content=c.content,
                status=c.status,
                created_at=c.created_at,
            )
            for c in items
        ],
        page=page,
        page_size=page_size,
        total=total,
    )


@router.post("/comments/{comment_id}/approve", response_model=dict)
def admin_approve_comment(
    comment_id: int,
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),  # noqa: ARG001
):
    comment = db.query(BlogComment).filter(BlogComment.id == comment_id).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    comment.status = "approved"
    db.commit()
    return {"ok": True}


@router.delete("/comments/{comment_id}", status_code=204)
def admin_delete_comment(
    comment_id: int,
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),  # noqa: ARG001
):
    comment = db.query(BlogComment).filter(BlogComment.id == comment_id).first()
    if not comment:
        return
    db.delete(comment)
    db.commit()
    return
