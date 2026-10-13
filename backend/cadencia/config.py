"""Runtime configuration.

Every value comes from ``CADENCIA_*`` environment variables, an optional ``.env`` file, or a
secret file mounted in ``/run/secrets`` (file named after the variable, e.g.
``/run/secrets/cadencia_jira_api_token``). Credentials never live in the repository.
"""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_SECRETS_DIR = os.environ.get("CADENCIA_SECRETS_DIR", "/run/secrets")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="CADENCIA_",
        env_file=".env",
        extra="ignore",
        secrets_dir=_SECRETS_DIR if Path(_SECRETS_DIR).is_dir() else None,
    )

    # Jira connection (API token + basic auth; the application is read-only).
    jira_base_url: str = ""
    jira_email: str = ""
    jira_api_token: SecretStr = SecretStr("")
    jira_max_concurrency: int = 8
    jira_max_retries: int = 6
    jira_timeout_seconds: float = 30.0

    # Storage.
    database_url: str = "sqlite:///./cadencia.db"
    data_dir: Path = Path("./data")
    template_max_mb: int = Field(50, ge=1)  # nginx's client_max_body_size is 50m too

    # Defaults for board profiles (each board can override them, RF-05).
    timezone: str = "America/Sao_Paulo"
    checkpoint_weekday: int = Field(4, ge=0, le=6)  # 0 = segunda-feira ... 4 = sexta-feira
    checkpoint_hour: int = Field(18, ge=0, le=23)
    default_sprint_weeks: int = Field(2, ge=1, le=8)

    # Collection scope.
    history_sprints: int = 6
    history_days: int = 120
    collect_interval_minutes: int = 60
    incremental_overlap_minutes: int = 15

    # Outbound messages (RF-71, RF-73). public_url is where the web app is reached, for links.
    public_url: str = ""
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: SecretStr = SecretStr("")
    smtp_from: str = ""
    smtp_starttls: bool = True

    # #7: a narrative paragraph drafted by Claude from a board's numbers. Off unless enabled on
    # purpose: turning it on sends those numbers to Anthropic's API. An empty key falls back to the
    # SDK's own credentials (ANTHROPIC_API_KEY, an `ant auth login` profile).
    ai_enabled: bool = False
    anthropic_api_key: SecretStr = SecretStr("")
    ai_model: str = "claude-opus-5"
    ai_timeout_seconds: float = 60.0

    # API / logging. An empty token leaves the API open (local development); see README.
    api_token: SecretStr = SecretStr("")
    cors_origins: list[str] = ["http://localhost:5173"]
    log_level: str = "INFO"
    log_json: bool = True

    @field_validator("timezone")
    @classmethod
    def _known_timezone(cls, value: str) -> str:
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError):
            raise ValueError(f"fuso horário desconhecido: {value!r}") from None
        return value

    @property
    def templates_dir(self) -> Path:
        return self.data_dir / "templates"

    @property
    def decks_dir(self) -> Path:
        return self.data_dir / "decks"

    def jira_configured(self) -> bool:
        return bool(self.jira_base_url and self.jira_email and self.jira_api_token.get_secret_value())


@lru_cache
def get_settings() -> Settings:
    return Settings()
