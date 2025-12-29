class OCRService:
    """Mock OCR service; swap with Google Vision or OCR.space implementation."""

    def __init__(self, enabled: bool = True) -> None:
        self.enabled = enabled

    def extract_ingredients(self, image_bytes: bytes) -> list[str]:
        if not self.enabled:
            return []
        # Placeholder output. Replace with real OCR parsing.
        return ["chicken breast", "spinach", "olive oil", "garlic"]
