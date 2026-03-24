"""
MongoDB Database Models using MongoEngine

Models for user accounts and encrypted file storage.
"""

from mongoengine import (
    Document, StringField, EmailField, DateTimeField, 
    BooleanField, ListField, EmbeddedDocument, EmbeddedDocumentField,
    FileField, IntField, FloatField
)
from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash


class EncryptedFileMetadata(EmbeddedDocument):
    """Metadata for encrypted file"""
    file_id = StringField(required=True, unique=True)  # UUID
    original_name = StringField(required=True)
    algorithm = StringField(required=True)  # 'AES-256-GCM', 'AES-128-CTR', 'ChaCha20-Poly1305'
    file_size = IntField(required=True)  # Size in bytes
    uploaded_at = DateTimeField(default=datetime.utcnow)
    encrypted_data = FileField()  # Store encrypted file binary


class DecryptionHistory(EmbeddedDocument):
    """Record of decryption operations"""
    history_id = StringField(required=True, unique=True)
    encrypted_file_id = StringField(required=True)
    encrypted_file_name = StringField(required=True)
    decrypted_at = DateTimeField(default=datetime.utcnow)
    original_filename = StringField()
    file_size = IntField()


class User(Document):
    """User account model"""
    email = EmailField(required=True, unique=True)
    name = StringField(required=True)
    password_hash = StringField(required=True)  # Hashed password using bcrypt/werkzeug
    
    # Profile info
    created_at = DateTimeField(default=datetime.utcnow)
    last_login = DateTimeField()
    is_active = BooleanField(default=True)
    
    # Encryption settings
    default_algorithm = StringField(default='AES-256-GCM')
    
    # Storage
    encrypted_files = ListField(EmbeddedDocumentField(EncryptedFileMetadata))
    decryption_history = ListField(EmbeddedDocumentField(DecryptionHistory))
    
    # Account stats
    total_encrypted_files = IntField(default=0)
    total_storage_used = IntField(default=0)  # in bytes
    
    # Security
    failed_login_attempts = IntField(default=0)
    account_locked = BooleanField(default=False)
    locked_until = DateTimeField()
    
    meta = {
        'collection': 'users',
        'indexes': [
            'email',
            'created_at',
            '-last_login'
        ]
    }

    def set_password(self, password: str):
        """Hash and set password"""
        self.password_hash = generate_password_hash(password)

    def check_password(self, password: str) -> bool:
        """Verify password"""
        return check_password_hash(self.password_hash, password)

    def add_encrypted_file(self, file_id: str, original_name: str, algorithm: str, 
                          file_size: int, encrypted_data: bytes):
        """Add encrypted file to user's storage"""
        file_metadata = EncryptedFileMetadata(
            file_id=file_id,
            original_name=original_name,
            algorithm=algorithm,
            file_size=file_size,
            encrypted_data=encrypted_data
        )
        self.encrypted_files.append(file_metadata)
        self.total_encrypted_files += 1
        self.total_storage_used += file_size
        self.save()
        return file_metadata

    def get_encrypted_file(self, file_id: str) -> EncryptedFileMetadata:
        """Retrieve encrypted file metadata"""
        for file_obj in self.encrypted_files:
            if file_obj.file_id == file_id:
                return file_obj
        return None

    def delete_encrypted_file(self, file_id: str) -> bool:
        """Delete encrypted file from storage"""
        file_to_delete = self.get_encrypted_file(file_id)
        if file_to_delete:
            self.total_storage_used -= file_to_delete.file_size
            self.encrypted_files.remove(file_to_delete)
            self.total_encrypted_files = len(self.encrypted_files)
            self.save()
            return True
        return False

    def add_decryption_record(self, history_id: str, encrypted_file_id: str, 
                             encrypted_file_name: str, original_filename: str = None,
                             file_size: int = None):
        """Record decryption operation"""
        record = DecryptionHistory(
            history_id=history_id,
            encrypted_file_id=encrypted_file_id,
            encrypted_file_name=encrypted_file_name,
            original_filename=original_filename,
            file_size=file_size
        )
        self.decryption_history.append(record)
        self.save()
        return record

    def clear_encrypted_files(self):
        """Delete all encrypted files"""
        self.total_storage_used = 0
        self.total_encrypted_files = 0
        self.encrypted_files = []
        self.save()

    def clear_decryption_history(self):
        """Clear all decryption records"""
        self.decryption_history = []
        self.save()

    def to_dict(self):
        """Convert user to dictionary (safe for API response)"""
        return {
            'email': self.email,
            'name': self.name,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'last_login': self.last_login.isoformat() if self.last_login else None,
            'is_active': self.is_active,
            'default_algorithm': self.default_algorithm,
            'total_encrypted_files': self.total_encrypted_files,
            'total_storage_used': self.total_storage_used,
            'total_storage_used_mb': round(self.total_storage_used / (1024 * 1024), 2)
        }

    def __repr__(self):
        return f'<User {self.email}>'


class ServerSession(Document):
    """Session management for API tokens"""
    user_email = EmailField(required=True)
    token = StringField(required=True, unique=True)
    created_at = DateTimeField(default=datetime.utcnow)
    expires_at = DateTimeField(required=True)
    ip_address = StringField()
    user_agent = StringField()
    is_active = BooleanField(default=True)
    
    meta = {
        'collection': 'sessions',
        'indexes': [
            'token',
            'user_email',
            'expires_at'
        ]
    }

    def __repr__(self):
        return f'<Session {self.user_email}>'
