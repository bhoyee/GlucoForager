from typing import Any, Optional


class StripeHandler:
    """Placeholder Stripe/ReveneueCat bridge."""

    def __init__(self, api_key: Optional[str] = None) -> None:
        self.api_key = api_key

    def create_checkout_session(self, user_id: int) -> dict[str, Any]:
        # TODO: Integrate with Stripe or RevenueCat.
        return {"url": f"https://billing.example.com/checkout?user={user_id}", "status": "mock"}

    def verify_webhook(self, payload: bytes, signature: str) -> bool:
        # Accept everything in mock mode.
        return True

    def sync_subscription_status(self, user_id: int) -> dict[str, Any]:
        return {"user_id": user_id, "plan": "premium", "status": "active"}
