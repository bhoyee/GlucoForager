from pydantic import BaseSettings, Field


class Settings(BaseSettings):
    project_name: str = "GlucoForager API"
    database_url: str = Field(..., env="DATABASE_URL")
    secret_key: str = Field(..., env="SECRET_KEY")
    algorithm: str = "HS256"
    access_token_expire_minutes: int = Field(60, env="ACCESS_TOKEN_EXPIRE_MINUTES")
    stripe_secret_key: str | None = Field(None, env="STRIPE_SECRET_KEY")
    cors_origins: list[str] = Field(default_factory=lambda: ["*"])
    smtp_host: str | None = Field(None, env="SMTP_HOST")
    smtp_port: int | None = Field(None, env="SMTP_PORT")
    smtp_username: str | None = Field(None, env="SMTP_USERNAME")
    smtp_password: str | None = Field(None, env="SMTP_PASSWORD")
    smtp_from_address: str | None = Field(None, env="SMTP_FROM_ADDRESS")
    smtp_from_name: str | None = Field(None, env="SMTP_FROM_NAME")
    smtp_encryption: str | None = Field("ssl", env="SMTP_ENCRYPTION")
    resend_api_key: str | None = Field(None, env="RESEND_API_KEY")
    openai_api_key: str | None = Field(None, env="OPENAI_API_KEY")
    openai_model: str = Field("gpt-5", env="OPENAI_MODEL")
    openai_vision_model: str = Field("gpt-5-vision", env="OPENAI_VISION_MODEL")
    deepseek_api_key: str | None = Field(None, env="DEEPSEEK_API_KEY")
    deepseek_base_url: str = Field("https://api.deepseek.com/v1", env="DEEPSEEK_BASE_URL")
    deepseek_model: str = Field("gpt-5", env="DEEPSEEK_MODEL")
    deepseek_vision_model: str = Field("gpt-5-vision", env="DEEPSEEK_VISION_MODEL")
    redis_url: str | None = Field(None, env="REDIS_URL")

    class Config:
        env_file = ".env"
        case_sensitive = False


settings = Settings()
