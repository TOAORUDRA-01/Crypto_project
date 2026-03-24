"""
Run Server Script

Start the FastAPI server with proper configuration.
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
import uvicorn
from config import get_config

if __name__ == '__main__':
    # Get environment
    env = os.getenv('APP_ENV') or os.getenv('FLASK_ENV', 'development')
    config = get_config(env)
    
    print("\n" + "=" * 60)
    print("  🔐 Crypto Project - FastAPI Server")
    print("=" * 60)
    print(f"\nEnvironment: {env.upper()}")
    print(f"Host: {config.HOST}")
    print(f"Port: {config.PORT}")
    print(f"Database: {config.MONGO_DB_NAME}")
    print(f"Debug: {config.DEBUG}")
    print(f"TLS Enforced: {config.FORCE_HTTPS}")
    print(f"TLS for Auth: {config.REQUIRE_TLS_FOR_AUTH}")
    print(f"HTTP/3 Hint: {config.ENABLE_HTTP3_HINT}")
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
    if config.TLS_CERT_FILE and config.TLS_KEY_FILE:
        print("🔒 TLS mode enabled (direct cert/key loaded)")
    else:
        print("⚠️  TLS cert/key not set. For multi-laptop secure access, run behind HTTPS + HTTP/3 capable proxy.")
    print("=" * 60 + "\n")

    uvicorn_kwargs = {
        'app': 'app:app',
        'host': config.HOST,
        'port': config.PORT,
        'reload': config.DEBUG,
    }

    if config.TLS_CERT_FILE and config.TLS_KEY_FILE:
        uvicorn_kwargs['ssl_certfile'] = config.TLS_CERT_FILE
        uvicorn_kwargs['ssl_keyfile'] = config.TLS_KEY_FILE

    uvicorn.run(**uvicorn_kwargs)
