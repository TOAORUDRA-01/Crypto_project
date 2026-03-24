"""
Server Configuration

Environment-based configuration for the backend API and MongoDB.
"""

import os
from datetime import timedelta


def _to_bool(value, default=False):
    if value is None:
        return default
    return str(value).strip().lower() in {'1', 'true', 'yes', 'on'}


class Config:
    """Base configuration"""
    # App runtime
    APP_ENV = os.getenv('APP_ENV') or os.getenv('FLASK_ENV', 'development')
    DEBUG = False
    TESTING = False
    HOST = os.getenv('HOST', '0.0.0.0')
    PORT = int(os.getenv('PORT', 5000))
    SECRET_KEY = os.getenv('SECRET_KEY', 'your-secret-key-change-in-production')

    # TLS / QUIC transport security
    TLS_CERT_FILE = os.getenv('TLS_CERT_FILE')
    TLS_KEY_FILE = os.getenv('TLS_KEY_FILE')
    FORCE_HTTPS = _to_bool(os.getenv('FORCE_HTTPS'), default=False)
    REQUIRE_TLS_FOR_AUTH = _to_bool(os.getenv('REQUIRE_TLS_FOR_AUTH'), default=True)
    ENABLE_HTTP3_HINT = _to_bool(os.getenv('ENABLE_HTTP3_HINT'), default=True)
    
    # MongoDB
    MONGO_URI = os.getenv('MONGO_URI', 'mongodb://localhost:27017')
    MONGO_DB_NAME = os.getenv('MONGO_DB_NAME', 'crypto_project')
    
    # JWT
    JWT_SECRET_KEY = os.getenv('JWT_SECRET_KEY', 'jwt-secret-key-change-in-production')
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(days=1)
    
    # File upload
    MAX_CONTENT_LENGTH = int(os.getenv('MAX_FILE_SIZE', 500 * 1024 * 1024))  # 500 MB default
    UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), 'uploads')
    ALLOWED_EXTENSIONS = {'enc'}
    
    # CORS
    CORS_ORIGINS = os.getenv('CORS_ORIGINS', '*').split(',')


class DevelopmentConfig(Config):
    """Development configuration"""
    DEBUG = True
    TESTING = False


class TestingConfig(Config):
    """Testing configuration"""
    DEBUG = True
    TESTING = True
    MONGO_DB_NAME = 'crypto_project_test'
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=1)


class ProductionConfig(Config):
    """Production configuration"""
    DEBUG = False
    TESTING = False
    # In production, ensure these are set via environment variables
    SECRET_KEY = os.getenv('SECRET_KEY')
    JWT_SECRET_KEY = os.getenv('JWT_SECRET_KEY')
    MONGO_URI = os.getenv('MONGO_URI')


# Configuration selection
config = {
    'development': DevelopmentConfig,
    'testing': TestingConfig,
    'production': ProductionConfig,
    'default': DevelopmentConfig
}

def get_config(env=None):
    """Get configuration based on environment"""
    if env is None:
        env = os.getenv('APP_ENV') or os.getenv('FLASK_ENV', 'development')
    return config.get(env, config['default'])
