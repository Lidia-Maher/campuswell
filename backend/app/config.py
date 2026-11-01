from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: str = "development"
    database_url: str
    cors_origins: str = "http://localhost:5173"
    firebase_credentials_path: str | None = None
    firebase_credentials_json: str | None = None
    auth_dev_mode: bool = False
    timezone: str = "Asia/Amman"
    # who may register: students (std.psut.edu.jo) and staff (psut.edu.jo). Empty = anyone.
    allowed_email_domains: str = "std.psut.edu.jo,psut.edu.jo"

    @property
    def sqlalchemy_url(self) -> str:
        """Neon/Supabase give 'postgresql://' URLs; SQLAlchemy needs the psycopg driver name."""
        url = self.database_url
        for prefix in ("postgres://", "postgresql://"):
            if url.startswith(prefix):
                return "postgresql+psycopg://" + url[len(prefix):]
        return url

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def allowed_email_domain_list(self) -> list[str]:
        return [d.strip().lower() for d in self.allowed_email_domains.split(",") if d.strip()]


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    if settings.auth_dev_mode and settings.environment == "production":
        raise RuntimeError("AUTH_DEV_MODE must never be enabled in production")
    return settings
