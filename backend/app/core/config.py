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
    openai_admin_api_key: str | None = Field(None, env="OPENAI_ADMIN_API_KEY")
    openai_organization: str | None = Field(None, env="OPENAI_ORG_ID")
    # Use available models by default; can be overridden via env.
    openai_model: str = Field("gpt-4o-mini", env="OPENAI_MODEL")
    # Optional model override for the swaps engine (defaults to OPENAI_MODEL when unset).
    swaps_model: str | None = Field(None, env="SWAPS_MODEL")
    # Default vision-capable model; can be overridden in .env
    openai_vision_model: str = Field("gpt-4o-2024-11-20", env="OPENAI_VISION_MODEL")
    deepseek_api_key: str | None = Field(None, env="DEEPSEEK_API_KEY")
    # DeepSeek text fallback (no vision support)
    deepseek_base_url: str = Field("https://api.deepseek.com/v1", env="DEEPSEEK_BASE_URL")
    deepseek_model: str = Field("deepseek-chat", env="DEEPSEEK_MODEL")
    deepseek_vision_model: str = Field("deepseek-chat", env="DEEPSEEK_VISION_MODEL")
    gemini_api_key: str | None = Field(None, env="GEMINI_API_KEY")
    gemini_image_model: str = Field("imagen-4.0-generate-001", env="GEMINI_IMAGE_MODEL")
    # Optional Gemini text model for recipe generation fallback (e.g. "gemini-2.5-flash").
    gemini_text_model: str | None = Field(None, env="GEMINI_TEXT_MODEL")
    # Recipe image generation provider ("runware" or "gemini").
    # Defaults to Runware (fast/cheap) for image generation; text recipes can still be OpenAI-only.
    recipe_image_provider: str = Field("runware", env="RECIPE_IMAGE_PROVIDER")
    # Runware (https://runware.ai) image generation (e.g. FLUX Schnell).
    runware_api_key: str | None = Field(None, env="RUNWARE_API_KEY")
    runware_api_url: str = Field("https://api.runware.ai/v1", env="RUNWARE_API_URL")
    runware_image_model: str = Field("runware:100@1", env="RUNWARE_IMAGE_MODEL")
    ai_debug_logging: bool = Field(False, env="AI_DEBUG_LOGGING")
    # When debugging recipe generation failures, allow logging model outputs (truncated) to server logs.
    ai_log_raw_output: bool = Field(False, env="AI_LOG_RAW_OUTPUT")
    # Mobile polls for ~60s; keep "Eat now" flows within that by default, but allow override for debugging.
    ai_eat_now_budget_seconds: float = Field(60.0, env="AI_EAT_NOW_BUDGET_SECONDS")
    # When enabled, do not attempt non-OpenAI providers (DeepSeek/Gemini) for recipe generation.
    # This avoids wasting latency budget on fallbacks when you only want OpenAI.
    ai_openai_only: bool = Field(True, env="AI_OPENAI_ONLY")

    # AI job runner (lightweight server-side queue) - protects the API under bursts.
    ai_job_runner_enabled: bool = Field(True, env="AI_JOB_RUNNER_ENABLED")
    ai_job_runner_poll_seconds: float = Field(0.8, env="AI_JOB_RUNNER_POLL_SECONDS")
    ai_job_runner_text_workers: int = Field(6, env="AI_JOB_RUNNER_TEXT_WORKERS")
    ai_job_runner_vision_workers: int = Field(3, env="AI_JOB_RUNNER_VISION_WORKERS")

    # AI queue backend: "db" (in-process runner) or "redis" (recommended).
    ai_queue_backend: str = Field("db", env="AI_QUEUE_BACKEND")
    ai_queue_redis_stream_text: str = Field("ai:jobs:text", env="AI_QUEUE_REDIS_STREAM_TEXT")
    ai_queue_redis_stream_vision: str = Field("ai:jobs:vision", env="AI_QUEUE_REDIS_STREAM_VISION")
    ai_queue_redis_group: str = Field("glucoforager", env="AI_QUEUE_REDIS_GROUP")
    ai_queue_redis_block_ms: int = Field(5000, env="AI_QUEUE_REDIS_BLOCK_MS")
    ai_queue_redis_claim_idle_ms: int = Field(60000, env="AI_QUEUE_REDIS_CLAIM_IDLE_MS")
    redis_url: str | None = Field(None, env="REDIS_URL")

    # Work plans scheduler: delivers scheduled tasks at show_at time (in-app notification + email).
    work_plans_scheduler_enabled: bool = Field(True, env="WORK_PLANS_SCHEDULER_ENABLED")
    work_plans_scheduler_poll_seconds: float = Field(30.0, env="WORK_PLANS_SCHEDULER_POLL_SECONDS")
    work_plans_scheduler_batch_size: int = Field(50, env="WORK_PLANS_SCHEDULER_BATCH_SIZE")

    # General API burst limits (requests per minute).
    # These protect the API from accidental client retry loops and basic scraping.
    # AI endpoints have their own per-user limits (see ai_rate_limit_*).
    api_rate_limit_anonymous_per_min: int = Field(120, env="API_RATE_LIMIT_ANON_PER_MIN")
    api_rate_limit_authenticated_per_min: int = Field(240, env="API_RATE_LIMIT_AUTH_PER_MIN")
    api_rate_limit_mobile_logs_per_min: int = Field(600, env="API_RATE_LIMIT_MOBILE_LOGS_PER_MIN")
    api_rate_limit_push_tokens_per_min: int = Field(60, env="API_RATE_LIMIT_PUSH_TOKENS_PER_MIN")

    # Admin/staff portal burst limits (requests per minute).
    admin_rate_limit_per_min: int = Field(180, env="ADMIN_RATE_LIMIT_PER_MIN")
    admin_login_rate_limit_per_min: int = Field(20, env="ADMIN_LOGIN_RATE_LIMIT_PER_MIN")
    admin_password_reset_rate_limit_per_min: int = Field(10, env="ADMIN_PASSWORD_RESET_RATE_LIMIT_PER_MIN")
    admin_mfa_rate_limit_per_min: int = Field(20, env="ADMIN_MFA_RATE_LIMIT_PER_MIN")

    # Per-user burst rate limits for AI endpoints (protects cost + latency under abuse).
    # Limits are "requests per minute" per user.
    ai_rate_limit_free_text_per_min: int = Field(4, env="AI_RATE_LIMIT_FREE_TEXT_PER_MIN")
    ai_rate_limit_free_vision_per_min: int = Field(2, env="AI_RATE_LIMIT_FREE_VISION_PER_MIN")
    ai_rate_limit_premium_text_per_min: int = Field(12, env="AI_RATE_LIMIT_PREMIUM_TEXT_PER_MIN")
    ai_rate_limit_premium_vision_per_min: int = Field(6, env="AI_RATE_LIMIT_PREMIUM_VISION_PER_MIN")
    revenuecat_webhook_secret: str | None = Field(None, env="REVENUECAT_WEBHOOK_SECRET")
    revenuecat_secret_api_key: str | None = Field(None, env="REVENUECAT_SECRET_API_KEY")
    revenuecat_project_id: str | None = Field(None, env="REVENUECAT_PROJECT_ID")
    revenuecat_currency: str = Field("USD", env="REVENUECAT_CURRENCY")
    admin_bootstrap_token: str | None = Field(None, env="ADMIN_BOOTSTRAP_TOKEN")
    site_url: str = Field("https://www.glucoforager.com", env="SITE_URL")
    staff_portal_url: str | None = Field(None, env="STAFF_PORTAL_URL")

    # Push notifications (Expo push gateway)
    expo_push_access_token: str | None = Field(None, env="EXPO_PUSH_ACCESS_TOKEN")
    expo_push_endpoint: str = Field("https://exp.host/--/api/v2/push/send", env="EXPO_PUSH_ENDPOINT")

    # Staff library file storage
    # - local: store on backend disk under UPLOADS_DIR (default, dev-friendly)
    # - ftp: upload to shared hosting via (FTPS) and store public URL (recommended for your shared hosting setup)
    library_storage_backend: str = Field("local", env="LIBRARY_STORAGE_BACKEND")
    library_remote_base_url: str | None = Field(None, env="LIBRARY_REMOTE_BASE_URL")

    library_ftp_host: str | None = Field(None, env="LIBRARY_FTP_HOST")
    library_ftp_port: int = Field(21, env="LIBRARY_FTP_PORT")
    library_ftp_username: str | None = Field(None, env="LIBRARY_FTP_USERNAME")
    library_ftp_password: str | None = Field(None, env="LIBRARY_FTP_PASSWORD")
    # Remote base directory that contains the "images/pdfs/videos" folders (POSIX style).
    library_ftp_base_dir: str = Field("/glucoforager.com/library", env="LIBRARY_FTP_BASE_DIR")
    library_ftp_tls: bool = Field(True, env="LIBRARY_FTP_TLS")
    library_ftp_timeout_seconds: float = Field(30.0, env="LIBRARY_FTP_TIMEOUT_SECONDS")

    # Default upload limits (bytes). Can be tuned per environment.
    library_max_image_bytes: int = Field(1_048_576, env="LIBRARY_MAX_IMAGE_BYTES")  # 1 MB
    library_max_pdf_bytes: int = Field(921_600, env="LIBRARY_MAX_PDF_BYTES")  # 900 KB
    library_max_excel_bytes: int = Field(2_097_152, env="LIBRARY_MAX_EXCEL_BYTES")  # 2 MB
    library_max_video_bytes: int = Field(25 * 1024 * 1024, env="LIBRARY_MAX_VIDEO_BYTES")  # 25 MB

    # Staff inbox attachments (shared hosting via FTP recommended)
    inbox_file_storage_backend: str = Field("local", env="INBOX_FILE_STORAGE_BACKEND")
    inbox_file_remote_base_url: str | None = Field(None, env="INBOX_FILE_REMOTE_BASE_URL")
    # Remote base directory that contains inbox attachments (POSIX style).
    inbox_file_ftp_base_dir: str = Field("/public_html/glucoforager.com/inbox-file", env="INBOX_FILE_FTP_BASE_DIR")
    inbox_file_max_image_bytes: int = Field(2_097_152, env="INBOX_FILE_MAX_IMAGE_BYTES")  # 2 MB
    inbox_file_max_pdf_bytes: int = Field(2_097_152, env="INBOX_FILE_MAX_PDF_BYTES")  # 2 MB
    inbox_file_max_video_bytes: int = Field(25 * 1024 * 1024, env="INBOX_FILE_MAX_VIDEO_BYTES")  # 25 MB

    # Staff requests attachments (leave/training requests)
    # Uses shared hosting via FTP (recommended) or local uploads.
    requests_file_storage_backend: str = Field("local", env="REQUESTS_FILE_STORAGE_BACKEND")
    requests_file_remote_base_url: str | None = Field(None, env="REQUESTS_FILE_REMOTE_BASE_URL")
    requests_file_ftp_base_dir: str = Field("/public_html/glucoforager.com/requests-file", env="REQUESTS_FILE_FTP_BASE_DIR")
    requests_file_max_image_bytes: int = Field(2_097_152, env="REQUESTS_FILE_MAX_IMAGE_BYTES")  # 2 MB
    requests_file_max_pdf_bytes: int = Field(2_097_152, env="REQUESTS_FILE_MAX_PDF_BYTES")  # 2 MB
    requests_file_max_video_bytes: int = Field(25 * 1024 * 1024, env="REQUESTS_FILE_MAX_VIDEO_BYTES")  # 25 MB

    # Staff private drive (MyDrive / StaffDrive)
    # Stored on shared hosting via FTP (recommended).
    drive_storage_backend: str = Field("ftp", env="DRIVE_STORAGE_BACKEND")
    drive_ftp_base_dir: str = Field("/public_html/glucoforager.com/private-drive", env="DRIVE_FTP_BASE_DIR")
    drive_max_image_bytes: int = Field(1_048_576, env="DRIVE_MAX_IMAGE_BYTES")  # 1 MB
    drive_max_pdf_bytes: int = Field(2_097_152, env="DRIVE_MAX_PDF_BYTES")  # 2 MB
    drive_max_excel_bytes: int = Field(2_097_152, env="DRIVE_MAX_EXCEL_BYTES")  # 2 MB
    drive_max_video_bytes: int = Field(25 * 1024 * 1024, env="DRIVE_MAX_VIDEO_BYTES")  # 25 MB

    # Recipe image upload storage (used by /api/admin/uploads)
    # - local: store on backend disk under UPLOADS_DIR (served from /uploads)
    # - ftp: upload to shared hosting under RECIPE_FTP_BASE_DIR and store public RECIPE_REMOTE_BASE_URL
    recipe_upload_storage_backend: str = Field("local", env="RECIPE_UPLOAD_STORAGE_BACKEND")
    recipe_remote_base_url: str | None = Field(None, env="RECIPE_REMOTE_BASE_URL")
    recipe_ftp_base_dir: str = Field("/glucoforager.com/recipes", env="RECIPE_FTP_BASE_DIR")
    recipe_max_image_bytes: int = Field(2_097_152, env="RECIPE_MAX_IMAGE_BYTES")  # 2 MB

    # Payroll / payslip branding
    payroll_company_name: str = Field("GlucoForager", env="PAYROLL_COMPANY_NAME")
    payroll_holding_name: str = Field("Bhoyee Global Enterprise", env="PAYROLL_HOLDING_NAME")
    payroll_brand_name: str = Field("GlucoForager", env="PAYROLL_BRAND_NAME")
    payroll_brand_website: str = Field("https://glucoforager.com", env="PAYROLL_BRAND_WEBSITE")
    payroll_header_logo_path: str | None = Field(None, env="PAYROLL_HEADER_LOGO_PATH")
    payroll_logo_path: str | None = Field(None, env="PAYROLL_LOGO_PATH")
    payroll_company_address: str | None = Field(None, env="PAYROLL_COMPANY_ADDRESS")
    payroll_company_email: str | None = Field(None, env="PAYROLL_COMPANY_EMAIL")
    payroll_company_phone: str | None = Field(None, env="PAYROLL_COMPANY_PHONE")
    payroll_company_reg_no: str | None = Field(None, env="PAYROLL_COMPANY_REG_NO")

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
