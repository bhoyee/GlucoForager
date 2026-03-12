import json

import json

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    project_name: str = "GlucoForager API"
    database_url: str = Field(..., env="DATABASE_URL")
    secret_key: str = Field(..., env="SECRET_KEY")
    algorithm: str = "HS256"
    access_token_expire_minutes: int = Field(60, env="ACCESS_TOKEN_EXPIRE_MINUTES")
    refresh_token_expire_days: int = Field(30, env="REFRESH_TOKEN_EXPIRE_DAYS")
    stripe_secret_key: str | None = Field(None, env="STRIPE_SECRET_KEY")
    cors_origins: list[str] = Field(default_factory=lambda: ["*"], env="CORS_ORIGINS")
    smtp_host: str | None = Field(None, env="SMTP_HOST")
    smtp_port: int | None = Field(None, env="SMTP_PORT")
    smtp_username: str | None = Field(None, env="SMTP_USERNAME")
    smtp_password: str | None = Field(None, env="SMTP_PASSWORD")
    smtp_from_address: str | None = Field(None, env="SMTP_FROM_ADDRESS")
    smtp_from_name: str | None = Field(None, env="SMTP_FROM_NAME")
    smtp_encryption: str | None = Field("ssl", env="SMTP_ENCRYPTION")
    password_reset_code_ttl_minutes: int = Field(15, env="PASSWORD_RESET_CODE_TTL_MINUTES")
    password_reset_code_max_attempts: int = Field(5, env="PASSWORD_RESET_CODE_MAX_ATTEMPTS")
    resend_api_key: str | None = Field(None, env="RESEND_API_KEY")
    uploads_dir: str = Field("uploads", env="UPLOADS_DIR")
    openai_api_key: str | None = Field(None, env="OPENAI_API_KEY")
    openai_organization: str | None = Field(None, env="OPENAI_ORG_ID")
    # Use available models by default; can be overridden via env.
    openai_model: str = Field("gpt-4o-mini", env="OPENAI_MODEL")
    # Default vision-capable model; can be overridden in .env
    openai_vision_model: str = Field("gpt-4o-2024-11-20", env="OPENAI_VISION_MODEL")
    deepseek_api_key: str | None = Field(None, env="DEEPSEEK_API_KEY")
    # DeepSeek text fallback (no vision support)
    deepseek_base_url: str = Field("https://api.deepseek.com/v1", env="DEEPSEEK_BASE_URL")
    deepseek_model: str = Field("deepseek-chat", env="DEEPSEEK_MODEL")
    deepseek_vision_model: str = Field("deepseek-chat", env="DEEPSEEK_VISION_MODEL")
    gemini_api_key: str | None = Field(None, env="GEMINI_API_KEY")
    gemini_image_model: str = Field("imagen-4.0-generate-001", env="GEMINI_IMAGE_MODEL")
    ai_disable_emergency_fallback: bool = Field(False, env="AI_DISABLE_EMERGENCY_FALLBACK")
    redis_url: str | None = Field(None, env="REDIS_URL")
    revenuecat_webhook_secret: str | None = Field(None, env="REVENUECAT_WEBHOOK_SECRET")
    revenuecat_secret_api_key: str | None = Field(None, env="REVENUECAT_SECRET_API_KEY")
    revenuecat_project_id: str | None = Field(None, env="REVENUECAT_PROJECT_ID")
    revenuecat_currency: str = Field("USD", env="REVENUECAT_CURRENCY")
    admin_bootstrap_token: str | None = Field(None, env="ADMIN_BOOTSTRAP_TOKEN")
    site_url: str = Field("https://www.glucoforager.com", env="SITE_URL")

    model_config = SettingsConfigDict(env_file=".env", case_sensitive=False, extra="ignore")

    @field_validator("cors_origins", mode="before")
    def assemble_cors_origins(cls, v):  # noqa: N805
        if isinstance(v, str):
            value = v.strip()
            if not value:
                return ["*"]
            if value.startswith("["):
                try:
                    return json.loads(value)
                except json.JSONDecodeError:
                    return ["*"]
            return [item.strip() for item in value.split(",") if item.strip()]
        return v

    @field_validator("deepseek_base_url", mode="before")
    def normalize_deepseek_base_url(cls, v):  # noqa: N805
        if not isinstance(v, str):
            return v
        value = v.strip().rstrip("/")
        # DeepSeek OpenAI-compatible endpoints live under /v1.
        if value == "https://api.deepseek.com":
            return "https://api.deepseek.com/v1"
        return value


settings = Settings()
