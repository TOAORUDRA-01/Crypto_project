"""
Utility Functions

Helper functions for authentication, validation, and token management.
"""

import re
import secrets
import string
from datetime import datetime, timedelta
import jwt
from functools import wraps
from flask import request, jsonify


# ═══════════════════════════════════════════════════════════════════════════
# ─── VALIDATION FUNCTIONS ──────────────────────────────────────────────────
# ═══════════════════════════════════════════════════════════════════════════

def validate_email(email: str) -> bool:
    """
    Validate email format.
    """
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return re.match(pattern, email) is not None


def validate_password(password: str) -> bool:
    """
    Validate password strength.
    Requirements:
    - At least 8 characters
    - At least one uppercase letter
    - At least one lowercase letter
    - At least one digit
    """
    if len(password) < 8:
        return False
    
    has_upper = any(c.isupper() for c in password)
    has_lower = any(c.islower() for c in password)
    has_digit = any(c.isdigit() for c in password)
    
    return has_upper and has_lower and has_digit


def validate_filename(filename: str, max_length: int = 255) -> bool:
    """
    Validate filename.
    """
    if not filename or len(filename) > max_length:
        return False
    
    # Disallow special characters that could cause issues
    forbidden_chars = r'[<>:"/\\|?*]'
    return re.search(forbidden_chars, filename) is None


# ═══════════════════════════════════════════════════════════════════════════
# ─── PASSWORD FUNCTIONS ─────────────────────────────────────────────────
# ═══════════════════════════════════════════════════════════════════════════

def hash_password(password: str) -> str:
    """
    Hash password using bcrypt.
    (Note: Using werkzeug in models.py for actual hashing)
    """
    from werkzeug.security import generate_password_hash
    return generate_password_hash(password, method='pbkdf2:sha256')


def verify_password(password: str, password_hash: str) -> bool:
    """
    Verify password against hash.
    (Note: Using werkzeug in models.py for actual verification)
    """
    from werkzeug.security import check_password_hash
    return check_password_hash(password_hash, password)


def generate_secure_token(length: int = 32) -> str:
    """
    Generate a cryptographically secure random token.
    """
    alphabet = string.ascii_letters + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(length))


# ═══════════════════════════════════════════════════════════════════════════
# ─── TOKEN FUNCTIONS ───────────────────────────────────────────────────────
# ═══════════════════════════════════════════════════════════════════════════

def generate_token(user_email: str, expires_in_hours: int = 24, secret: str = None) -> str:
    """
    Generate JWT token.
    """
    if secret is None:
        from config import Config
        secret = Config.JWT_SECRET_KEY
    
    payload = {
        'email': user_email,
        'iat': datetime.utcnow(),
        'exp': datetime.utcnow() + timedelta(hours=expires_in_hours)
    }
    
    return jwt.encode(payload, secret, algorithm='HS256')


def verify_token(token: str, secret: str = None) -> dict:
    """
    Verify and decode JWT token.
    
    Returns:
        Dictionary with token payload if valid
        None if invalid or expired
    """
    if secret is None:
        from config import Config
        secret = Config.JWT_SECRET_KEY
    
    try:
        payload = jwt.decode(token, secret, algorithms=['HS256'])
        return payload
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None


# ═══════════════════════════════════════════════════════════════════════════
# ─── RESPONSE HELPERS ───────────────────────────────────────────────────────
# ═══════════════════════════════════════════════════════════════════════════

def success_response(message: str, data: dict = None, status_code: int = 200):
    """
    Generate standardized success response.
    """
    response = {
        'status': 'success',
        'message': message
    }
    if data:
        response.update(data)
    return jsonify(response), status_code


def error_response(message: str, error: str = None, status_code: int = 400):
    """
    Generate standardized error response.
    """
    response = {
        'status': 'error',
        'message': message
    }
    if error:
        response['error'] = error
    return jsonify(response), status_code


# ═══════════════════════════════════════════════════════════════════════════
# ─── FILE FUNCTIONS ────────────────────────────────────────────────────────
# ═══════════════════════════════════════════════════════════════════════════

def allowed_file(filename: str, allowed_extensions: set = None) -> bool:
    """
    Check if file extension is allowed.
    """
    if allowed_extensions is None:
        allowed_extensions = {'.enc', 'enc'}
    
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in allowed_extensions


def get_file_size_mb(size_bytes: int) -> float:
    """
    Convert bytes to megabytes.
    """
    return round(size_bytes / (1024 * 1024), 2)


def get_file_size_gb(size_bytes: int) -> float:
    """
    Convert bytes to gigabytes.
    """
    return round(size_bytes / (1024 * 1024 * 1024), 2)


# ═══════════════════════════════════════════════════════════════════════════
# ─── DECORATORS ────────────────────────────────────────────────────────────
# ═══════════════════════════════════════════════════════════════════════════

def require_api_key(f):
    """
    Decorator to require API key authentication.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        api_key = request.headers.get('X-API-Key')
        
        if not api_key or not verify_api_key(api_key):
            return error_response('Invalid or missing API key', status_code=401)
        
        return f(*args, **kwargs)
    
    return decorated_function


def verify_api_key(api_key: str) -> bool:
    """
    Verify API key (implement as needed).
    """
    # This should be implemented based on your API key management
    # For now, just a placeholder
    return api_key == 'your-api-key'


def rate_limit(max_requests: int = 100, window_seconds: int = 3600):
    """
    Simple rate limiting decorator.
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            # Implement rate limiting logic here
            # For now, just pass through
            return f(*args, **kwargs)
        return decorated_function
    return decorator
