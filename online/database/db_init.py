"""
Database Initialization Script

Initialize MongoDB collections and create necessary indexes.
"""

import os
import secrets

from mongoengine import connect, disconnect

from .models import User, ServerSession
from ..backend.config import Config


def init_database():
    """
    Initialize MongoDB connection and create collections/indexes.
    """
    print("=" * 60)
    print("  MongoDB Database Initialization")
    print("=" * 60)
    
    try:
        # Connect to MongoDB
        print(f"\n📡 Connecting to MongoDB: {Config.MONGO_URI}")
        connect(
            db=Config.MONGO_DB_NAME,
            host=Config.MONGO_URI,
            connect=False,
            serverSelectionTimeoutMS=5000
        )
        print(f"✓ Connected successfully to database: {Config.MONGO_DB_NAME}")
        
    except Exception as e:
        print(f"✗ Connection failed: {e}")
        return False
    
    try:
        # Create indexes for User collection
        print("\n📑 Creating indexes for User collection...")
        User.ensure_indexes()
        print("✓ User indexes created")
        
        # Create indexes for ServerSession collection
        print("\n📑 Creating indexes for ServerSession collection...")
        ServerSession.ensure_indexes()
        print("✓ ServerSession indexes created")
        
        # Display collection info
        print("\n📊 Database Info:")
        print(f"   - Database: {Config.MONGO_DB_NAME}")
        print(f"   - Collections: users, sessions")
        
        # Check for existing users
        user_count = User.objects.count()
        print(f"   - Existing users: {user_count}")
        
        session_count = ServerSession.objects.count()
        print(f"   - Existing sessions: {session_count}")
        
        print("\n✓ Database initialization completed successfully!")
        print("=" * 60)
        return True
        
    except Exception as e:
        print(f"✗ Initialization failed: {e}")
        return False
    
    finally:
        disconnect()


def create_sample_user():
    """
    Create a sample user for testing (optional).

    Requires SEED_DEMO_DATA=true environment variable.
    Refuses to run in production.
    """
    if os.environ.get("SEED_DEMO_DATA") != "true":
        raise RuntimeError(
            "Refusing to seed: set SEED_DEMO_DATA=true explicitly (never in production)."
        )

    app_env = os.environ.get("APP_ENV", "") or os.environ.get("FLASK_ENV", "")
    if app_env.lower() == "production":
        raise RuntimeError("Refusing to seed demo data in production.")

    try:
        connect(
            db=Config.MONGO_DB_NAME,
            host=Config.MONGO_URI,
            connect=False
        )

        # Check if sample user exists
        sample_user = User.objects(email='demo@example.com').first()

        if sample_user:
            print("Sample user already exists: demo@example.com")
            return

        # Generate a random, non-static password
        password = secrets.token_urlsafe(16)

        user = User(
            email='demo@example.com',
            name='Demo User'
        )
        user.set_password(password)
        user.save()

        # Print to stdout/logs only — never store plain password in code
        print("[seed] Demo user created: demo@example.com")
        print(f"[seed] Temporary password: {password}  " 
        "(visible in logs only — change immediately)")

    except Exception as e:
        print(f"Error creating sample user: {e}")

    finally:
        disconnect()


def drop_database():
    """
    Drop the entire database (use with caution!).
    """
    try:
        connect(
            db=Config.MONGO_DB_NAME,
            host=Config.MONGO_URI,
            connect=False
        )
        
        from mongoengine import get_db
        db = get_db()
        
        confirm = input(f"\n⚠️  Are you sure you want to drop database '{Config.MONGO_DB_NAME}'? (yes/no): ")
        
        if confirm.lower() == 'yes':
            db.client.drop_database(Config.MONGO_DB_NAME)
            print(f"✓ Database '{Config.MONGO_DB_NAME}' dropped successfully")
        else:
            print("Operation cancelled")
        
    except Exception as e:
        print(f"Error dropping database: {e}")
    
    finally:
        disconnect()


if __name__ == '__main__':
    import argparse
    
    parser = argparse.ArgumentParser(description='Database initialization utility')
    parser.add_argument('--init', action='store_true', help='Initialize database')
    parser.add_argument('--sample', action='store_true', help='Create sample user')
    parser.add_argument('--drop', action='store_true', help='Drop database (WARNING: destructive)')
    
    args = parser.parse_args()
    
    if args.init:
        init_database()
    elif args.sample:
        create_sample_user()
    elif args.drop:
        drop_database()
    else:
        # Default: initialize database
        init_database()