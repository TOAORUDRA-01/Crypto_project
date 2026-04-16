"""
MongoDB models for users, sessions, files, and decryption history.
"""

from datetime import datetime, timedelta, timezone
from typing import Optional

from mongoengine import (
    BooleanField,
    DateTimeField,
    Document,
    EmailField,
    FileField,
    IntField,
    ReferenceField,
    StringField,
)
from werkzeug.security import check_password_hash, generate_password_hash


CASCADE = 2


class User(Document):
    email = EmailField(required=True, unique=True)
    name = StringField(required=True, max_length=120)
    password_hash = StringField(required=True)

    created_at = DateTimeField(default=lambda: datetime.now(timezone.utc))
    last_login = DateTimeField()
    is_active = BooleanField(default=True)

    default_algorithm = StringField(default="AES-256-GCM")
    total_encrypted_files = IntField(default=0)
    total_storage_used = IntField(default=0)

    failed_login_attempts = IntField(default=0)
    account_locked = BooleanField(default=False)
    locked_until = DateTimeField()
    token_version = IntField(default=0)
    google_drive_token = StringField()
    google_drive_folder_id = StringField()


    meta = {
        "collection": "users",
        "indexes": ["email", "created_at", "-last_login"],
    }

    def set_password(self, password: str):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password: str) -> bool:
        return check_password_hash(self.password_hash, password)

    def is_locked(self) -> bool:
        if not self.account_locked:
            return False
        locked_until = self.locked_until
        if locked_until and locked_until.tzinfo is None:
            locked_until = locked_until.replace(tzinfo=timezone.utc)
        if locked_until and locked_until > datetime.now(timezone.utc):
            return True
        self.account_locked = False
        self.locked_until = None
        self.failed_login_attempts = 0
        self.save()
        return False

    def register_failed_login(self, max_attempts: int, lockout_minutes: int):
        self.failed_login_attempts += 1
        if self.failed_login_attempts >= max_attempts:
            self.account_locked = True
            self.locked_until = datetime.now(timezone.utc) + timedelta(minutes=lockout_minutes)
        self.save()

    def reset_login_failures(self):
        self.failed_login_attempts = 0
        self.account_locked = False
        self.locked_until = None
        self.save()

    def to_dict(self):
        return {
            "email": self.email,
            "name": self.name,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "last_login": self.last_login.isoformat() if self.last_login else None,
            "is_active": self.is_active,
            "default_algorithm": self.default_algorithm,
            "total_encrypted_files": self.total_encrypted_files,
            "total_storage_used": self.total_storage_used,
            "total_storage_used_mb": round(self.total_storage_used / (1024 * 1024), 2),
            "account_locked": self.account_locked,
            "locked_until": self.locked_until.isoformat() if self.locked_until else None,
        }

    def __repr__(self):
        return f"<User {self.email}>"


class EncryptedFile(Document):
    user = ReferenceField(User, required=True, reverse_delete_rule=CASCADE)
    file_id = StringField(required=True, unique=True)
    original_name = StringField(required=True, max_length=255)
    algorithm = StringField(required=True)
    file_size = IntField(required=True)
    uploaded_at = DateTimeField(default=lambda: datetime.now(timezone.utc))
    encrypted_data = FileField(required=True)

    meta = {
        "collection": "encrypted_files",
        "indexes": ["file_id", "user", "-uploaded_at"],
    }

    def delete(self, *args, **kwargs):
        if self.encrypted_data:
            self.encrypted_data.delete()
        return super().delete(*args, **kwargs)


class DecryptionHistory(Document):
    user = ReferenceField(User, required=True, reverse_delete_rule=CASCADE)
    history_id = StringField(required=True, unique=True)
    encrypted_file_id = StringField(required=True)
    encrypted_file_name = StringField(required=True)
    decrypted_at = DateTimeField(default=lambda: datetime.now(timezone.utc))
    original_filename = StringField()
    file_size = IntField()

    meta = {
        "collection": "decryption_history",
        "indexes": ["history_id", "user", "-decrypted_at"],
    }


class ServerSession(Document):
    user = ReferenceField(User, required=True, reverse_delete_rule=CASCADE)
    token_hash = StringField(required=True, unique=True)
    created_at = DateTimeField(default=lambda: datetime.now(timezone.utc))
    expires_at = DateTimeField(required=True)
    ip_address = StringField()
    user_agent = StringField()
    is_active = BooleanField(default=True)

    meta = {
        "collection": "sessions",
        "indexes": [
            "token_hash",
            "user",
            {"fields": ["expires_at"], "expireAfterSeconds": 0},
        ],
    }

    @classmethod
    def active_for_token_hash(cls, token_hash: str) -> Optional["ServerSession"]:
        return cls.objects(
            token_hash=token_hash,
            is_active=True,
            expires_at__gt=datetime.now(timezone.utc),
        ).first()

    def __repr__(self):
        return f"<Session {self.user.email}>"