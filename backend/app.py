
"""
FastAPI Server for Crypto Project with MongoDB Backend.

Provides RESTful API endpoints for:
- User authentication (signup, login, logout)
- Encrypted file management (upload, download, delete)
- Decryption history tracking
"""

from datetime import datetime, timedelta, timezone
from io import BytesIO
import uuid
from typing import Annotated, Optional

from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from mongoengine import connect

from config import Config
from models import ServerSession, User
from utils import generate_token, validate_email, validate_password, verify_token


app = FastAPI(title="Crypto Project Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=Config.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

security = HTTPBearer(auto_error=False)
INVALID_TOKEN_MESSAGE = "Invalid or missing token"


def _is_local_request(request: Request) -> bool:
    host = (request.url.hostname or "").lower()
    return host in {"localhost", "127.0.0.1", "::1"}


def _is_secure_request(request: Request) -> bool:
    forwarded_proto = request.headers.get("x-forwarded-proto", "")
    if forwarded_proto:
        return forwarded_proto.lower() == "https"
    return request.url.scheme == "https"


@app.middleware("http")
async def transport_security_middleware(request: Request, call_next):
    # Enforce TLS for non-local access when enabled.
    if Config.FORCE_HTTPS and not _is_local_request(request) and not _is_secure_request(request):
        return JSONResponse(
            status_code=426,
            content={
                "error": "TLS required",
                "message": "Use HTTPS (TLS) to access this API.",
            },
        )

    response = await call_next(request)

    # Security headers for TLS deployments.
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"

    if Config.FORCE_HTTPS:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"

    # Advertise HTTP/3 (QUIC) capability when served behind an H3-capable edge proxy.
    if Config.ENABLE_HTTP3_HINT:
        response.headers["Alt-Svc"] = 'h3=":443"; ma=86400'

    return response


# Initialize MongoDB connection
try:
    connect(
        db=Config.MONGO_DB_NAME,
        host=Config.MONGO_URI,
        connect=False,
        serverSelectionTimeoutMS=5000,
    )
    print("✓ MongoDB connected successfully")
except Exception as e:
    print(f"✗ MongoDB connection failed: {e}")


@app.exception_handler(HTTPException)
async def http_exception_handler(_, exc: HTTPException):
    if exc.status_code == 401:
        return JSONResponse(
            status_code=401,
            content={"error": "Unauthorized", "message": "Invalid or missing token"},
        )
    if exc.status_code == 404:
        return JSONResponse(
            status_code=404,
            content={"error": "Not found", "message": str(exc.detail)},
        )
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": "Bad request", "message": str(exc.detail)},
    )


def get_current_user(
    request: Request,
    credentials: Annotated[Optional[HTTPAuthorizationCredentials], Depends(security)],
):
    if Config.REQUIRE_TLS_FOR_AUTH and not _is_local_request(request) and not _is_secure_request(request):
        raise HTTPException(status_code=401, detail="TLS required for authentication")

    if not credentials or not credentials.credentials:
        raise HTTPException(status_code=401, detail=INVALID_TOKEN_MESSAGE)

    token = credentials.credentials
    payload = verify_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail=INVALID_TOKEN_MESSAGE)

    email = payload.get("email")
    if not email:
        raise HTTPException(status_code=401, detail=INVALID_TOKEN_MESSAGE)

    session = ServerSession.objects(
        token=token,
        user_email=email,
        is_active=True,
        expires_at__gt=datetime.now(timezone.utc),
    ).first()
    if not session:
        raise HTTPException(status_code=401, detail=INVALID_TOKEN_MESSAGE)

    user = User.objects(email=email).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail=INVALID_TOKEN_MESSAGE)

    return {"user": user, "email": email, "token": token}


@app.post("/api/auth/signup")
async def signup(payload: dict, request: Request):
    try:
        if Config.REQUIRE_TLS_FOR_AUTH and not _is_local_request(request) and not _is_secure_request(request):
            return JSONResponse(status_code=401, content={"error": "TLS required for signup"})

        email = payload.get("email", "").strip().lower()
        name = payload.get("name", "").strip()
        password = payload.get("password", "")

        if not email or not name or not password:
            return JSONResponse(status_code=400, content={"error": "Missing required fields"})

        if not validate_email(email):
            return JSONResponse(status_code=400, content={"error": "Invalid email format"})

        if not validate_password(password):
            return JSONResponse(
                status_code=400,
                content={"error": "Password must be at least 8 characters"},
            )

        if User.objects(email=email):
            return JSONResponse(status_code=409, content={"error": "Email already registered"})

        user = User(email=email, name=name)
        user.set_password(password)
        user.save()

        return JSONResponse(
            status_code=201,
            content={
                "message": "Account created successfully",
                "user": {"email": user.email, "name": user.name},
            },
        )
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": "Signup failed", "message": str(e)})


@app.post("/api/auth/login")
async def login(payload: dict, request: Request):
    try:
        if Config.REQUIRE_TLS_FOR_AUTH and not _is_local_request(request) and not _is_secure_request(request):
            return JSONResponse(status_code=401, content={"error": "TLS required for login"})

        email = payload.get("email", "").strip().lower()
        password = payload.get("password", "")

        if not email or not password:
            return JSONResponse(status_code=400, content={"error": "Email and password required"})

        user = User.objects(email=email).first()
        if not user or not user.check_password(password):
            return JSONResponse(status_code=401, content={"error": "Invalid email or password"})

        if not user.is_active:
            return JSONResponse(status_code=403, content={"error": "Account is inactive"})

        access_token = generate_token(user.email, expires_in_hours=24)

        user.last_login = datetime.now(timezone.utc)
        user.failed_login_attempts = 0
        user.save()

        session = ServerSession(
            user_email=user.email,
            token=access_token,
            expires_at=datetime.now(timezone.utc) + timedelta(days=1),
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent", ""),
        )
        session.save()

        return JSONResponse(
            status_code=200,
            content={"message": "Login successful", "token": access_token, "user": user.to_dict()},
        )
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": "Login failed", "message": str(e)})


@app.post("/api/auth/logout")
async def logout(current: Annotated[dict, Depends(get_current_user)]):
    try:
        email = current["email"]
        token = current["token"]
        ServerSession.objects(user_email=email, token=token).update(set__is_active=False)
        return JSONResponse(status_code=200, content={"message": "Logged out successfully"})
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": "Logout failed", "message": str(e)})


@app.get("/api/auth/profile")
async def get_profile(current: Annotated[dict, Depends(get_current_user)]):
    try:
        email = current["email"]
        user = User.objects(email=email).first()

        if not user:
            return JSONResponse(status_code=404, content={"error": "User not found"})

        return JSONResponse(status_code=200, content={"user": user.to_dict()})
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": "Failed to fetch profile", "message": str(e)},
        )


@app.post("/api/files/upload")
async def upload_encrypted_file(
    file: Annotated[UploadFile, File(...)],
    current: Annotated[dict, Depends(get_current_user)],
    original_name: Annotated[str, Form()] = "encrypted_file",
    algorithm: Annotated[str, Form()] = "AES-256-GCM",
    file_size: Annotated[int, Form()] = 0,
):
    _ = file_size
    try:
        user = current["user"]

        if not file:
            return JSONResponse(status_code=400, content={"error": "No file provided"})

        encrypted_data = await file.read()
        if not encrypted_data:
            return JSONResponse(status_code=400, content={"error": "No file selected"})

        file_id = str(uuid.uuid4())
        actual_size = len(encrypted_data)

        user.add_encrypted_file(
            file_id=file_id,
            original_name=original_name,
            algorithm=algorithm,
            file_size=actual_size,
            encrypted_data=encrypted_data,
        )

        return JSONResponse(
            status_code=201,
            content={
                "message": "File uploaded successfully",
                "file_id": file_id,
                "file_name": original_name,
                "algorithm": algorithm,
                "file_size": actual_size,
            },
        )
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": "File upload failed", "message": str(e)},
        )


@app.get("/api/files/list")
async def list_encrypted_files(current: Annotated[dict, Depends(get_current_user)]):
    try:
        user = current["user"]

        files = [
            {
                "file_id": f.file_id,
                "original_name": f.original_name,
                "algorithm": f.algorithm,
                "file_size": f.file_size,
                "uploaded_at": f.uploaded_at.isoformat() if f.uploaded_at else None,
            }
            for f in user.encrypted_files
        ]

        return JSONResponse(
            status_code=200,
            content={
                "total_files": len(files),
                "total_storage_mb": round(user.total_storage_used / (1024 * 1024), 2),
                "files": files,
            },
        )
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": "Failed to list files", "message": str(e)},
        )


@app.get("/api/files/download/{file_id}")
async def download_encrypted_file(file_id: str, current: Annotated[dict, Depends(get_current_user)]):
    try:
        user = current["user"]
        file_obj = user.get_encrypted_file(file_id)

        if not file_obj:
            return JSONResponse(status_code=404, content={"error": "File not found"})

        filename = f"{file_obj.original_name}.enc"
        return StreamingResponse(
            BytesIO(file_obj.encrypted_data),
            media_type="application/octet-stream",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": "File download failed", "message": str(e)},
        )


@app.delete("/api/files/delete/{file_id}")
async def delete_encrypted_file(file_id: str, current: Annotated[dict, Depends(get_current_user)]):
    try:
        user = current["user"]

        if user.delete_encrypted_file(file_id):
            return JSONResponse(
                status_code=200,
                content={
                    "message": "File deleted successfully",
                    "total_files": user.total_encrypted_files,
                    "total_storage_mb": round(user.total_storage_used / (1024 * 1024), 2),
                },
            )

        return JSONResponse(status_code=404, content={"error": "File not found"})
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": "File deletion failed", "message": str(e)},
        )


@app.delete("/api/files/delete-all")
async def delete_all_files(current: Annotated[dict, Depends(get_current_user)]):
    try:
        user = current["user"]
        user.clear_encrypted_files()

        return JSONResponse(
            status_code=200,
            content={"message": "All files deleted successfully", "total_files": 0},
        )
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": "Failed to delete files", "message": str(e)},
        )


@app.post("/api/history/add-record")
async def add_decryption_record(payload: dict, current: Annotated[dict, Depends(get_current_user)]):
    try:
        user = current["user"]

        history_id = str(uuid.uuid4())
        encrypted_file_id = payload.get("encrypted_file_id", "")
        encrypted_file_name = payload.get("encrypted_file_name", "")
        original_filename = payload.get("original_filename")

        file_size_value = payload.get("file_size")
        file_size = int(file_size_value) if file_size_value is not None else None

        user.add_decryption_record(
            history_id=history_id,
            encrypted_file_id=encrypted_file_id,
            encrypted_file_name=encrypted_file_name,
            original_filename=original_filename,
            file_size=file_size,
        )

        return JSONResponse(
            status_code=201,
            content={"message": "Decryption record added", "history_id": history_id},
        )
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": "Failed to add record", "message": str(e)},
        )


@app.get("/api/history/list")
async def list_decryption_history(current: Annotated[dict, Depends(get_current_user)]):
    try:
        user = current["user"]

        history = [
            {
                "history_id": h.history_id,
                "encrypted_file_id": h.encrypted_file_id,
                "encrypted_file_name": h.encrypted_file_name,
                "original_filename": h.original_filename,
                "file_size": h.file_size,
                "decrypted_at": h.decrypted_at.isoformat() if h.decrypted_at else None,
            }
            for h in user.decryption_history
        ]

        return JSONResponse(status_code=200, content={"total_records": len(history), "history": history})
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": "Failed to fetch history", "message": str(e)},
        )


@app.delete("/api/history/clear")
async def clear_decryption_history(current: Annotated[dict, Depends(get_current_user)]):
    try:
        user = current["user"]
        user.clear_decryption_history()

        return JSONResponse(
            status_code=200,
            content={"message": "Decryption history cleared", "total_records": 0},
        )
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": "Failed to clear history", "message": str(e)},
        )


@app.get("/api/health")
async def health_check():
    try:
        User.objects().count()
        db_status = "connected"
    except Exception:
        db_status = "disconnected"

    return JSONResponse(
        status_code=200,
        content={
            "status": "healthy",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "database": db_status,
        },
    )
