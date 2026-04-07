"""
Utility functions for validation, token management, and rate limiting.
"""

import hashlib
import re
import secrets
import string
import threading
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from functools import wraps
from typing import Callable, Deque, Dict, Optional, Tuple
from uuid import uuid4

import jwt

from .config import get_config


CONFIG = get_config()


def validate_email(email: str) -> bool:
    pattern = r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"
    return re.match(pattern, email) is not None


def validate_password(password: str) -> bool:
    if len(password) < 8:
        return False
    has_upper = any(char.isupper() for char in password)
    has_lower = any(char.islower() for char in password)
    has_digit = any(char.isdigit() for char in password)
    return has_upper and has_lower and has_digit


def sanitize_filename(filename: str, max_length: int = 255) -> str:
    cleaned = re.sub(r"[\r\n\t]+", "", filename or "").strip()
    cleaned = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", cleaned)
    cleaned = cleaned.rstrip(". ")
    return (cleaned or "encrypted_file")[:max_length]


def validate_filename(filename: str, max_length: int = 255) -> bool:
    return sanitize_filename(filename, max_length=max_length) == filename


def generate_secure_token(length: int = 32) -> str:
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def generate_token(user_email: str, token_version: int = 0, expires_in_minutes: Optional[int] = None) -> str:
    expires_after = expires_in_minutes or CONFIG.ACCESS_TOKEN_EXPIRE_MINUTES
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_email,
        "email": user_email,
        "jti": str(uuid4()),
        "token_version": token_version,
        "iss": CONFIG.JWT_ISSUER,
        "aud": CONFIG.JWT_AUDIENCE,
        "iat": now,
        "exp": now + timedelta(minutes=expires_after),
    }
    return jwt.encode(payload, CONFIG.JWT_SECRET_KEY, algorithm="HS256")


def verify_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(
            token,
            CONFIG.JWT_SECRET_KEY,
            algorithms=["HS256"],
            issuer=CONFIG.JWT_ISSUER,
            audience=CONFIG.JWT_AUDIENCE,
        )
        email = payload.get("email")
        if not email or not validate_email(email):
            return None
        return payload
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return None


def success_response(message: str, data: Optional[dict] = None, status_code: int = 200) -> Tuple[dict, int]:
    response = {"status": "success", "message": message}
    if data:
        response.update(data)
    return response, status_code


def error_response(message: str, error: Optional[str] = None, status_code: int = 400) -> Tuple[dict, int]:
    response = {"status": "error", "message": message}
    if error:
        response["error"] = error
    return response, status_code


def allowed_file(filename: str, allowed_extensions: Optional[set] = None) -> bool:
    extensions = allowed_extensions or CONFIG.ALLOWED_EXTENSIONS
    if "." not in filename:
        return False
    return filename.rsplit(".", 1)[1].lower() in {ext.lower().lstrip(".") for ext in extensions}


def get_file_size_mb(size_bytes: int) -> float:
    return round(size_bytes / (1024 * 1024), 2)


def get_file_size_gb(size_bytes: int) -> float:
    return round(size_bytes / (1024 * 1024 * 1024), 2)


def verify_api_key(api_key: str, expected_api_key: Optional[str] = None) -> bool:
    configured_key = expected_api_key or getattr(CONFIG, "API_KEY", None)
    if not configured_key:
        return False
    return secrets.compare_digest(api_key, configured_key)


def require_api_key(f=None, api_key_getter: Optional[Callable] = None):
    if f is None:
        return lambda wrapped: require_api_key(wrapped, api_key_getter=api_key_getter)

    @wraps(f)
    def decorated_function(*args, **kwargs):
        if api_key_getter is None:
            raise RuntimeError("api_key_getter is required for require_api_key")
        api_key = api_key_getter(*args, **kwargs)
        if not api_key or not verify_api_key(api_key):
            return error_response("Invalid or missing API key", status_code=401)
        return f(*args, **kwargs)

    return decorated_function


_rate_limit_store: Dict[str, Deque[float]] = defaultdict(deque)
_rate_limit_lock = threading.Lock()


def consume_rate_limit(key: str, max_requests: int, window_seconds: int) -> bool:
    now = datetime.now(timezone.utc).timestamp()
    with _rate_limit_lock:
        timestamps = _rate_limit_store[key]
        while timestamps and now - timestamps[0] > window_seconds:
            timestamps.popleft()
        if len(timestamps) >= max_requests:
            return False
        timestamps.append(now)
        return True


def rate_limit(key_builder: Callable, max_requests: int = 100, window_seconds: int = 3600):
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            key = key_builder(*args, **kwargs)
            if not consume_rate_limit(key, max_requests=max_requests, window_seconds=window_seconds):
                return error_response("Rate limit exceeded", status_code=429)
            return f(*args, **kwargs)

        return decorated_function

    return decorator