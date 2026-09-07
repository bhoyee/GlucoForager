import base64

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ...database import get_db
from ...models.user import User
from ...services.user_email_tokens import verify_dunning_unsubscribe_token

router = APIRouter(prefix="/dunning", tags=["dunning"])


@router.get("/unsubscribe", status_code=200)
def unsubscribe(token: str, db: Session = Depends(get_db)):
    token = (token or "").strip()
    if not token:
        raise HTTPException(status_code=400, detail="Invalid unsubscribe link")

    # Token format: base64url("{user_id}:{sig}"). Decode the id to look the user up,
    # then verify the signature against their current email before trusting it.
    try:
        padded = token + "=" * (-len(token) % 4)
        raw = base64.urlsafe_b64decode(padded.encode("utf-8")).decode("utf-8")
        user_id = int(raw.split(":", 1)[0])
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid unsubscribe link") from None

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=400, detail="Invalid unsubscribe link")

    if not verify_dunning_unsubscribe_token(token, user.id, user.email):
        raise HTTPException(status_code=400, detail="Invalid unsubscribe link")

    if not user.dunning_opt_out:
        user.dunning_opt_out = True
        db.add(user)
        db.commit()
        return {"ok": True, "unsubscribed": True}

    return {"ok": True, "unsubscribed": False, "already": True}
