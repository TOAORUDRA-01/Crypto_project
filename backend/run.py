"""
Run Server Script

Start the Flask API server with proper configuration.
"""

import os
import sys
from pathlib import Path

# Add server directory to path
server_dir = Path(__file__).parent.absolute()
sys.path.insert(0, str(server_dir))

# Load environment variables
from dotenv import load_dotenv
load_dotenv(server_dir / '.env')

# Import app
from app import app
from config import get_config

if __name__ == '__main__':
    # Get environment
    env = os.getenv('FLASK_ENV', 'development')
    config = get_config(env)
    
    print("\n" + "=" * 60)
    print("  🔐 Crypto Project - Server")
    print("=" * 60)
    print(f"\nEnvironment: {env.upper()}")
    print(f"Host: {config.HOST}")
    print(f"Port: {config.PORT}")
    print(f"Database: {config.MONGO_DB_NAME}")
    print(f"Debug: {config.DEBUG}")
    print("\n📚 API Documentation:")
    print("   GET  /api/health              - Health check")
    print("   POST /api/auth/signup         - Register new user")
    print("   POST /api/auth/login          - Login user")
    print("   POST /api/auth/logout         - Logout user (requires token)")
    print("   GET  /api/auth/profile        - Get user profile (requires token)")
    print("   POST /api/files/upload        - Upload encrypted file (requires token)")
    print("   GET  /api/files/list          - List encrypted files (requires token)")
    print("   GET  /api/files/download/<id> - Download encrypted file (requires token)")
    print("   DELETE /api/files/delete/<id> - Delete encrypted file (requires token)")
    print("   DELETE /api/files/delete-all  - Delete all files (requires token)")
    print("   POST /api/history/add-record  - Add decryption record (requires token)")
    print("   GET  /api/history/list        - Get decryption history (requires token)")
    print("   DELETE /api/history/clear     - Clear decryption history (requires token)")
    print("\n🚀 Starting server...")
    print("=" * 60 + "\n")
    
    app.run(
        host=config.HOST,
        port=config.PORT,
        debug=config.DEBUG
    )
