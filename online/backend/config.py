"""
Server configuration and startup validation helpers.
"""

import os
import secrets
from typing import List
from dotenv import load_dotenv
from pathlib import Path

# Load environment variables from .env file (in the backend directory)
backend_dir = Path(__file__).parent
env_file = backend_dir / '.env'
load_dotenv(env_file)


def _to_bool(value, default=False):
    if value is None:
        return default
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def _parse_origins(value: str, env: str = "development") -> List[str]:
    """Parse and validate CORS origins.

    In production, rejects 'null', bare IP addresses, and plain HTTP origins.
    """
    import re
    raw = [origin.strip() for origin in value.split(",") if origin.strip()]

    _bare_ip = re.compile(r"^https?://\d{1,3}(\.\d{1,3}){3}(:\d+)?$")

    if env == "production":
        cleaned = []
        for origin in raw:
            if origin == "null":
                continue  # never allow null origin in production
            if _bare_ip.match(origin):
                continue  # never allow bare IP origins in production
            if not origin.startswith("https://"):
                continue  # only HTTPS origins in production
            cleaned.append(origin)
        return cleaned or []

    # Development: allow any origin except the literal string 'null'
    return [o for o in raw if o != "null"] or ["http://localhost:3000"]


class Config:
    APP_ENV = os.getenv("APP_ENV", "development")
    DEBUG = False
    TESTING = False
    HOST = os.getenv("HOST", "0.0.0.0")
    PORT = int(os.getenv("PORT", 5000))

    SECRET_KEY = os.getenv("SECRET_KEY")
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY")
    JWT_ISSUER = os.getenv("JWT_ISSUER", "crypto-project-backend")
    JWT_AUDIENCE = os.getenv("JWT_AUDIENCE", "crypto-project-clients")
    ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "15"))   # 15 min; was 1440
    REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "7"))

    # How many upstream proxies to trust for X-Forwarded-* headers.
    # Set to 1 when behind exactly one reverse proxy (nginx, Caddy, ALB).
    # Set to 0 (default) when uvicorn is directly internet-facing.
    TRUSTED_PROXY_COUNT = int(os.getenv("TRUSTED_PROXY_COUNT", "0"))

    TLS_CERT_FILE = os.getenv("TLS_CERT_FILE")
    TLS_KEY_FILE = os.getenv("TLS_KEY_FILE")
    FORCE_HTTPS = _to_bool(os.getenv("FORCE_HTTPS"), default=False)
    REQUIRE_TLS_FOR_AUTH = _to_bool(os.getenv("REQUIRE_TLS_FOR_AUTH"), default=True)
    ENABLE_HTTP3_HINT = _to_bool(os.getenv("ENABLE_HTTP3_HINT"), default=True)

    MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/crypto_project")
    MONGO_DB_NAME = os.getenv("MONGO_DB_NAME", "crypto_project")

    MAX_CONTENT_LENGTH = int(os.getenv("MAX_FILE_SIZE", str(50 * 1024 * 1024)))
    ALLOWED_EXTENSIONS = {"enc"}
    ALLOWED_ALGORITHMS = {"AES-256-GCM", "AES-128-CTR", "ChaCha20-Poly1305"}

    MAX_LOGIN_ATTEMPTS = int(os.getenv("MAX_LOGIN_ATTEMPTS", "5"))
    LOCKOUT_MINUTES = int(os.getenv("LOCKOUT_MINUTES", "15"))
    RATE_LIMIT_LOGIN = int(os.getenv("RATE_LIMIT_LOGIN", "10"))
    RATE_LIMIT_SIGNUP = int(os.getenv("RATE_LIMIT_SIGNUP", "5"))
    RATE_LIMIT_UPLOAD = int(os.getenv("RATE_LIMIT_UPLOAD", "20"))
    RATE_LIMIT_WINDOW_SECONDS = int(os.getenv("RATE_LIMIT_WINDOW_SECONDS", "60"))

    CORS_ORIGINS = _parse_origins(
        os.getenv("CORS_ORIGINS", "http://localhost:3000"),
        env=os.getenv("APP_ENV", "development"),
    )
    CORS_ALLOW_CREDENTIALS = _to_bool(os.getenv("CORS_ALLOW_CREDENTIALS"), default=True)

    # Google Drive OAuth
    GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
    GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
    GOOGLE_REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:5000/api/google/callback")
    GOOGLE_DRIVE_FOLDER_NAME = os.getenv("GOOGLE_DRIVE_FOLDER_NAME", "Crypto Cloud Files")


    @classmethod
    def validate(cls):
        if cls.CORS_ALLOW_CREDENTIALS and "*" in cls.CORS_ORIGINS:
            raise RuntimeError("CORS_ORIGINS cannot contain '*' when credentials are enabled")

        if cls.APP_ENV == "production":
            missing = [
                name
                for name, value in (
                    ("SECRET_KEY", cls.SECRET_KEY),
                    ("JWT_SECRET_KEY", cls.JWT_SECRET_KEY),
                    ("MONGO_URI", cls.MONGO_URI),
                )
                if not value
            ]
            if missing:
                raise RuntimeError(
                    "Missing required production settings: " + ", ".join(sorted(missing))
                )

        if not cls.SECRET_KEY:
            cls.SECRET_KEY = secrets.token_urlsafe(32)
        if not cls.JWT_SECRET_KEY:
            cls.JWT_SECRET_KEY = secrets.token_urlsafe(48)


class DevelopmentConfig(Config):
    DEBUG = True
    TESTING = False


class TestingConfig(Config):
    DEBUG = True
    TESTING = True
    MONGO_DB_NAME = "crypto_project_test"
    ACCESS_TOKEN_EXPIRE_MINUTES = 60


class ProductionConfig(Config):
    DEBUG = False
    TESTING = False
    MONGO_URI = os.getenv("MONGO_URI")


config = {
    "development": DevelopmentConfig,
    "testing": TestingConfig,
    "production": ProductionConfig,
    "default": DevelopmentConfig,
}


def get_config(env=None):
    selected_env = env or os.getenv("APP_ENV", "development")
    config_class = config.get(selected_env, config["default"])
    config_class.validate()
    return config_class