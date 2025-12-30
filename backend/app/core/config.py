from pydantic import BaseSettings, Field


class Settings(BaseSettings):
    project_name: str = "GlucoForager API"
    database_url: str = Field(..., env="DATABASE_URL")
    secret_key: str = Field(..., env="SECRET_KEY")
    algorithm: str = "HS256"
    access_token_expire_minutes: int = Field(60, env="ACCESS_TOKEN_EXPIRE_MINUTES")
    stripe_secret_key: str | None = Field(None, env="STRIPE_SECRET_KEY")
    cors_origins: list[str] = Field(default_factory=lambda: ["*"])

    class Config:
        env_file = ".env"
        case_sensitive = False


settings = Settings()
