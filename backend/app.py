"""
Flask API Server for Crypto Project with MongoDB Backend

Provides RESTful API endpoints for:
- User authentication (signup, login, logout)
- Encrypted file management (upload, download, delete)
- Decryption history tracking
"""

from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
from mongoengine import connect, ValidationError as MongoValidationError
from werkzeug.security import generate_password_hash
from datetime import datetime, timedelta
import uuid
import os
from io import BytesIO

from config import Config
from models import User, ServerSession, EncryptedFileMetadata, DecryptionHistory
from utils import (
    validate_email, validate_password, hash_password, 
    verify_password, generate_token, verify_token
)


# Initialize Flask app
app = Flask(__name__)
app.config.from_object(Config)

# Initialize extensions
CORS(app, resources={r"/api/*": {"origins": "*"}})
jwt = JWTManager(app)

# Initialize MongoDB connection
try:
    connect(
        db=app.config['MONGO_DB_NAME'],
        host=app.config['MONGO_URI'],
        connect=False,
        serverSelectionTimeoutMS=5000
    )
    print("✓ MongoDB connected successfully")
except Exception as e:
    print(f"✗ MongoDB connection failed: {e}")


# ═══════════════════════════════════════════════════════════════════════════
# ─── ERROR HANDLERS ─────────────────────────────────────────────────────
# ═══════════════════════════════════════════════════════════════════════════

@app.errorhandler(400)
def bad_request(e):
    return jsonify({'error': 'Bad request', 'message': str(e)}), 400

@app.errorhandler(401)
def unauthorized(e):
    return jsonify({'error': 'Unauthorized', 'message': 'Invalid or missing token'}), 401

@app.errorhandler(404)
def not_found(e):
    return jsonify({'error': 'Not found', 'message': 'Endpoint not found'}), 404

@app.errorhandler(500)
def internal_error(e):
    return jsonify({'error': 'Internal server error', 'message': str(e)}), 500


# ═══════════════════════════════════════════════════════════════════════════
# ─── AUTHENTICATION ENDPOINTS ───────────────────────────────────────────
# ═══════════════════════════════════════════════════════════════════════════

@app.route('/api/auth/signup', methods=['POST'])
def signup():
    """
    Register a new user account.
    
    Request body:
    {
        "email": "user@example.com",
        "name": "John Doe",
        "password": "securepass123"
    }
    """
    try:
        data = request.get_json()
        
        # Validate input
        email = data.get('email', '').strip().lower()
        name = data.get('name', '').strip()
        password = data.get('password', '')
        
        if not email or not name or not password:
            return jsonify({'error': 'Missing required fields'}), 400
        
        if not validate_email(email):
            return jsonify({'error': 'Invalid email format'}), 400
        
        if not validate_password(password):
            return jsonify({'error': 'Password must be at least 8 characters'}), 400
        
        # Check if user exists
        if User.objects(email=email):
            return jsonify({'error': 'Email already registered'}), 409
        
        # Create new user
        user = User(
            email=email,
            name=name
        )
        user.set_password(password)
        user.save()
        
        return jsonify({
            'message': 'Account created successfully',
            'user': {
                'email': user.email,
                'name': user.name
            }
        }), 201
        
    except Exception as e:
        return jsonify({'error': 'Signup failed', 'message': str(e)}), 500


@app.route('/api/auth/login', methods=['POST'])
def login():
    """
    Authenticate user and return JWT token.
    
    Request body:
    {
        "email": "user@example.com",
        "password": "securepass123"
    }
    """
    try:
        data = request.get_json()
        email = data.get('email', '').strip().lower()
        password = data.get('password', '')
        
        if not email or not password:
            return jsonify({'error': 'Email and password required'}), 400
        
        # Find user
        user = User.objects(email=email).first()
        
        if not user or not user.check_password(password):
            return jsonify({'error': 'Invalid email or password'}), 401
        
        if not user.is_active:
            return jsonify({'error': 'Account is inactive'}), 403
        
        # Create JWT token (expires in 24 hours)
        access_token = create_access_token(
            identity=user.email,
            expires_delta=timedelta(days=1)
        )
        
        # Update last login
        user.last_login = datetime.utcnow()
        user.failed_login_attempts = 0
        user.save()
        
        # Create session record
        session = ServerSession(
            user_email=user.email,
            token=access_token,
            expires_at=datetime.utcnow() + timedelta(days=1),
            ip_address=request.remote_addr,
            user_agent=request.headers.get('User-Agent', '')
        )
        session.save()
        
        return jsonify({
            'message': 'Login successful',
            'token': access_token,
            'user': user.to_dict()
        }), 200
        
    except Exception as e:
        return jsonify({'error': 'Login failed', 'message': str(e)}), 500


@app.route('/api/auth/logout', methods=['POST'])
@jwt_required()
def logout():
    """
    Logout user and invalidate session token.
    """
    try:
        email = get_jwt_identity()
        
        # Invalidate session
        ServerSession.objects(user_email=email).update(set__is_active=False)
        
        return jsonify({'message': 'Logged out successfully'}), 200
        
    except Exception as e:
        return jsonify({'error': 'Logout failed', 'message': str(e)}), 500


@app.route('/api/auth/profile', methods=['GET'])
@jwt_required()
def get_profile():
    """
    Get current user profile.
    """
    try:
        email = get_jwt_identity()
        user = User.objects(email=email).first()
        
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        return jsonify({
            'user': user.to_dict()
        }), 200
        
    except Exception as e:
        return jsonify({'error': 'Failed to fetch profile', 'message': str(e)}), 500


# ═══════════════════════════════════════════════════════════════════════════
# ─── FILE MANAGEMENT ENDPOINTS ──────────────────────────────────────────
# ═══════════════════════════════════════════════════════════════════════════

@app.route('/api/files/upload', methods=['POST'])
@jwt_required()
def upload_encrypted_file():
    """
    Upload encrypted file to server.
    
    Request (multipart/form-data):
    - file: encrypted file binary
    - original_name: original filename
    - algorithm: encryption algorithm used
    - file_size: original file size in bytes
    """
    try:
        email = get_jwt_identity()
        user = User.objects(email=email).first()
        
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['file']
        original_name = request.form.get('original_name', 'encrypted_file')
        algorithm = request.form.get('algorithm', 'AES-256-GCM')
        file_size = request.form.get('file_size', type=int, default=0)
        
        if not file or file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        # Generate unique file ID
        file_id = str(uuid.uuid4())
        encrypted_data = file.read()
        actual_size = len(encrypted_data)
        
        # Add to user's encrypted files
        user.add_encrypted_file(
            file_id=file_id,
            original_name=original_name,
            algorithm=algorithm,
            file_size=actual_size,
            encrypted_data=encrypted_data
        )
        
        return jsonify({
            'message': 'File uploaded successfully',
            'file_id': file_id,
            'file_name': original_name,
            'algorithm': algorithm,
            'file_size': actual_size
        }), 201
        
    except Exception as e:
        return jsonify({'error': 'File upload failed', 'message': str(e)}), 500


@app.route('/api/files/list', methods=['GET'])
@jwt_required()
def list_encrypted_files():
    """
    List all encrypted files for current user.
    """
    try:
        email = get_jwt_identity()
        user = User.objects(email=email).first()
        
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        files = [
            {
                'file_id': f.file_id,
                'original_name': f.original_name,
                'algorithm': f.algorithm,
                'file_size': f.file_size,
                'uploaded_at': f.uploaded_at.isoformat() if f.uploaded_at else None
            }
            for f in user.encrypted_files
        ]
        
        return jsonify({
            'total_files': len(files),
            'total_storage_mb': round(user.total_storage_used / (1024 * 1024), 2),
            'files': files
        }), 200
        
    except Exception as e:
        return jsonify({'error': 'Failed to list files', 'message': str(e)}), 500


@app.route('/api/files/download/<file_id>', methods=['GET'])
@jwt_required()
def download_encrypted_file(file_id):
    """
    Download encrypted file.
    """
    try:
        email = get_jwt_identity()
        user = User.objects(email=email).first()
        
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        file_obj = user.get_encrypted_file(file_id)
        
        if not file_obj:
            return jsonify({'error': 'File not found'}), 404
        
        # Return file as binary
        return send_file(
            BytesIO(file_obj.encrypted_data),
            mimetype='application/octet-stream',
            as_attachment=True,
            download_name=f"{file_obj.original_name}.enc"
        ), 200
        
    except Exception as e:
        return jsonify({'error': 'File download failed', 'message': str(e)}), 500


@app.route('/api/files/delete/<file_id>', methods=['DELETE'])
@jwt_required()
def delete_encrypted_file(file_id):
    """
    Delete encrypted file from server.
    """
    try:
        email = get_jwt_identity()
        user = User.objects(email=email).first()
        
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        if user.delete_encrypted_file(file_id):
            return jsonify({
                'message': 'File deleted successfully',
                'total_files': user.total_encrypted_files,
                'total_storage_mb': round(user.total_storage_used / (1024 * 1024), 2)
            }), 200
        else:
            return jsonify({'error': 'File not found'}), 404
        
    except Exception as e:
        return jsonify({'error': 'File deletion failed', 'message': str(e)}), 500


@app.route('/api/files/delete-all', methods=['DELETE'])
@jwt_required()
def delete_all_files():
    """
    Delete all encrypted files for user.
    """
    try:
        email = get_jwt_identity()
        user = User.objects(email=email).first()
        
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        user.clear_encrypted_files()
        
        return jsonify({
            'message': 'All files deleted successfully',
            'total_files': 0
        }), 200
        
    except Exception as e:
        return jsonify({'error': 'Failed to delete files', 'message': str(e)}), 500


# ═══════════════════════════════════════════════════════════════════════════
# ─── DECRYPTION HISTORY ENDPOINTS ───────────────────────────────────────
# ═══════════════════════════════════════════════════════════════════════════

@app.route('/api/history/add-record', methods=['POST'])
@jwt_required()
def add_decryption_record():
    """
    Record a decryption operation.
    
    Request body:
    {
        "encrypted_file_id": "file_id",
        "encrypted_file_name": "filename.enc",
        "original_filename": "original.pdf",
        "file_size": 5242880
    }
    """
    try:
        email = get_jwt_identity()
        user = User.objects(email=email).first()
        
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        data = request.get_json()
        history_id = str(uuid.uuid4())
        encrypted_file_id = data.get('encrypted_file_id', '')
        encrypted_file_name = data.get('encrypted_file_name', '')
        original_filename = data.get('original_filename')
        file_size = data.get('file_size', type=int)
        
        user.add_decryption_record(
            history_id=history_id,
            encrypted_file_id=encrypted_file_id,
            encrypted_file_name=encrypted_file_name,
            original_filename=original_filename,
            file_size=file_size
        )
        
        return jsonify({
            'message': 'Decryption record added',
            'history_id': history_id
        }), 201
        
    except Exception as e:
        return jsonify({'error': 'Failed to add record', 'message': str(e)}), 500


@app.route('/api/history/list', methods=['GET'])
@jwt_required()
def list_decryption_history():
    """
    Get decryption history for current user.
    """
    try:
        email = get_jwt_identity()
        user = User.objects(email=email).first()
        
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        history = [
            {
                'history_id': h.history_id,
                'encrypted_file_id': h.encrypted_file_id,
                'encrypted_file_name': h.encrypted_file_name,
                'original_filename': h.original_filename,
                'file_size': h.file_size,
                'decrypted_at': h.decrypted_at.isoformat() if h.decrypted_at else None
            }
            for h in user.decryption_history
        ]
        
        return jsonify({
            'total_records': len(history),
            'history': history
        }), 200
        
    except Exception as e:
        return jsonify({'error': 'Failed to fetch history', 'message': str(e)}), 500


@app.route('/api/history/clear', methods=['DELETE'])
@jwt_required()
def clear_decryption_history():
    """
    Clear all decryption history records.
    """
    try:
        email = get_jwt_identity()
        user = User.objects(email=email).first()
        
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        user.clear_decryption_history()
        
        return jsonify({
            'message': 'Decryption history cleared',
            'total_records': 0
        }), 200
        
    except Exception as e:
        return jsonify({'error': 'Failed to clear history', 'message': str(e)}), 500


# ═══════════════════════════════════════════════════════════════════════════
# ─── HEALTH CHECK ───────────────────────────────────────────────────────
# ═══════════════════════════════════════════════════════════════════════════

@app.route('/api/health', methods=['GET'])
def health_check():
    """
    Check server and database health.
    """
    try:
        # Test MongoDB connection
        User.objects().count()
        db_status = 'connected'
    except:
        db_status = 'disconnected'
    
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.utcnow().isoformat(),
        'database': db_status
    }), 200


if __name__ == '__main__':
    app.run(
        host=app.config['HOST'],
        port=app.config['PORT'],
        debug=app.config['DEBUG']
    )
