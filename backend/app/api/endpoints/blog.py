import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import desc
from sqlalchemy.orm import Session

from ...database import get_db
from ...models.blog_comment import BlogComment
from ...models.blog_post import BlogPost

router = APIRouter(prefix="/blog", tags=["blog"])


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class BlogPostListItem(BaseModel):
    id: int
    slug: str
    title: str
    excerpt: str | None = None
    image_url: str | None = None
    author_name: str | None = None
    published_at: datetime | None = None


class BlogPostDetail(BaseModel):
    id: int
    slug: str
    title: str
    excerpt: str | None = None
    image_url: str | None = None
    seo_title: str | None = None
    seo_description: str | None = None
    focus_keyword: str | None = None
    content: str
    author_name: str | None = None
    published_at: datetime | None = None


class BlogPostsResponse(BaseModel):
    items: list[BlogPostListItem]
    page: int
    page_size: int
    total: int


class CommentCreatePayload(BaseModel):
    name: str = Field(..., min_length=2, max_length=80)
    email: EmailStr | None = None
    content: str = Field(..., min_length=2, max_length=2000)


class CommentPublic(BaseModel):
    id: int
    name: str
    content: str
    created_at: datetime | None = None


@router.get("/posts", response_model=BlogPostsResponse)
def list_posts(page: int = 1, page_size: int = 10, db: Session = Depends(get_db)):
    page = max(1, page)
    page_size = min(max(1, page_size), 50)

    base = db.query(BlogPost).filter(BlogPost.status == "published")
    total = base.count()
    items = (
        base.order_by(desc(BlogPost.published_at), desc(BlogPost.created_at))
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return BlogPostsResponse(
        items=[
            BlogPostListItem(
                id=post.id,
                slug=post.slug,
                title=post.title,
                excerpt=post.excerpt,
                image_url=post.image_url,
                author_name=post.author_name,
                published_at=post.published_at,
            )
            for post in items
        ],
        page=page,
        page_size=page_size,
        total=total,
    )


@router.get("/posts/{slug}", response_model=BlogPostDetail)
def get_post(slug: str, db: Session = Depends(get_db)):
    post = (
        db.query(BlogPost)
        .filter(BlogPost.slug == slug.strip().lower(), BlogPost.status == "published")
        .first()
    )
    if not post:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
    return BlogPostDetail(
        id=post.id,
        slug=post.slug,
        title=post.title,
        excerpt=post.excerpt,
        image_url=post.image_url,
        seo_title=getattr(post, "seo_title", None),
        seo_description=getattr(post, "seo_description", None),
        focus_keyword=getattr(post, "focus_keyword", None),
        content=post.content,
        author_name=post.author_name,
        published_at=post.published_at,
    )


@router.get("/posts/{slug}/comments", response_model=list[CommentPublic])
def list_comments(slug: str, db: Session = Depends(get_db)):
    post = (
        db.query(BlogPost)
        .filter(BlogPost.slug == slug.strip().lower(), BlogPost.status == "published")
        .first()
    )
    if not post:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
    items = (
        db.query(BlogComment)
        .filter(BlogComment.post_id == post.id, BlogComment.status == "approved")
        .order_by(BlogComment.created_at.asc(), BlogComment.id.asc())
        .limit(200)
        .all()
    )
    return [
        CommentPublic(id=c.id, name=c.name, content=c.content, created_at=c.created_at) for c in items
    ]


@router.post("/posts/{slug}/comments", status_code=201)
def create_comment(slug: str, payload: CommentCreatePayload, request: Request, db: Session = Depends(get_db)):
    post = (
        db.query(BlogPost)
        .filter(BlogPost.slug == slug.strip().lower(), BlogPost.status == "published")
        .first()
    )
    if not post:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")

    content = payload.content.strip()
    # Basic spam guard: reject repeated links.
    if len(re.findall(r"https?://", content, flags=re.IGNORECASE)) > 2:
        raise HTTPException(status_code=400, detail="Comment rejected")

    comment = BlogComment(
        post_id=post.id,
        name=payload.name.strip(),
        email=str(payload.email).lower() if payload.email else None,
        content=content,
        status="pending",
        created_at=_utcnow(),
    )
    db.add(comment)
    db.commit()
    return {"ok": True}
