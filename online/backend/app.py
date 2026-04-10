"""
FastAPI server for the crypto project backend.
"""

import logging
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from io import BytesIO
from typing import Annotated, Optional

import certifi
from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from mongoengine import NotUniqueError, connect, disconnect
from mongoengine.connection import get_db
from pymongo.errors import OperationFailure
from pydantic import BaseModel, field_validator

from .config import get_config
from .models import DecryptionHistory, EncryptedFile, ServerSession, User
from .utils import (
    allowed_file,
    consume_rate_limit,
    generate_token,
    hash_token,
    sanitize_filename,
    validate_email,
    validate_password,
    verify_token,
)


CONFIG = get_config()
logger = logging.getLogger(__name__)
security = HTTPBearer(auto_error=False)
INVALID_TOKEN_MESSAGE = "Invalid or missing token"


class SignupRequest(BaseModel):
    email: str
    name: str
    password: str

    @field_validator("email")
    @classmethod
    def validate_signup_email(cls, value):
        normalized = value.strip().lower()
        if not validate_email(normalized):
            raise ValueError("Invalid email format")
        return normalized

    @field_validator("name")
    @classmethod
    def validate_name(cls, value):
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Name is required")
        return cleaned

    @field_validator("password")
    @classmethod
    def validate_signup_password(cls, value):
        if not validate_password(value):
            raise ValueError(
                "Password must be at least 8 characters and include upper, lower, and digit"
            )
        return value


class LoginRequest(BaseModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def validate_login_email(cls, value):
        normalized = value.strip().lower()
        if not validate_email(normalized):
            raise ValueError("Invalid email format")
        return normalized

    @field_validator("password")
    @classmethod
    def validate_login_password(cls, value):
        if not value:
            raise ValueError("Password is required")
        return value


class DecryptionRecordRequest(BaseModel):
    encrypted_file_id: str
    encrypted_file_name: str
    original_filename: Optional[str] = None
    file_size: Optional[int] = None

    @field_validator("encrypted_file_id", "encrypted_file_name")
    @classmethod
    def validate_required_strings(cls, value):
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Field is required")
        return cleaned

    @field_validator("original_filename")
    @classmethod
    def validate_original_filename(cls, value):
        if value is None:
            return None
        return sanitize_filename(value)


def _get_request_client(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _is_local_request(request: Request) -> bool:
    host = (request.url.hostname or "").lower()
    return host in {"localhost", "127.0.0.1", "::1"}


def _is_secure_request(request: Request) -> bool:
    forwarded_proto = request.headers.get("x-forwarded-proto", "")
    if forwarded_proto:
        return forwarded_proto.lower() == "https"
    return request.url.scheme == "https"


def _ensure_secure_auth_transport(request: Request):
    # Temporarily disabled TLS requirement for network testing
    # if CONFIG.REQUIRE_TLS_FOR_AUTH and not _is_local_request(request) and not _is_secure_request(request):
    #     raise HTTPException(status_code=401, detail="TLS required for authentication")
    pass


def _enforce_rate_limit(request: Request, scope: str, limit: int):
    client_key = f"{scope}:{_get_request_client(request)}"
    if not consume_rate_limit(client_key, max_requests=limit, window_seconds=CONFIG.RATE_LIMIT_WINDOW_SECONDS):
        raise HTTPException(status_code=429, detail="Rate limit exceeded")


def _save_session_with_index_repair(session: ServerSession):
    try:
        session.save()
        return
    except OperationFailure as exc:
        details = str(exc)
        if "IndexOptionsConflict" not in details and "expires_at_1" not in details:
            raise

    sessions_collection = get_db()["sessions"]
    sessions_collection.drop_index("expires_at_1")
    logger.warning("Dropped conflicting MongoDB index during login flow: expires_at_1")
    session.save()


def _issue_auth_session(user: User, request: Request) -> str:
    access_token = generate_token(user.email, token_version=user.token_version)
    user.last_login = datetime.now(timezone.utc)
    user.reset_login_failures()
    user.save()

    session = ServerSession(
        user=user,
        token_hash=hash_token(access_token),
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=CONFIG.ACCESS_TOKEN_EXPIRE_MINUTES),
        ip_address=_get_request_client(request),
        user_agent=request.headers.get("user-agent", ""),
    )
    _save_session_with_index_repair(session)
    return access_token


@asynccontextmanager
async def lifespan(_: FastAPI):
    try:
        connect(
            db=CONFIG.MONGO_DB_NAME,
            host=CONFIG.MONGO_URI,
            tls=True,
            tlsCAFile=certifi.where(),
            serverSelectionTimeoutMS=5000,
        )
        get_db().command("ping")
        # Remove stale legacy index from older schema versions if it exists.
        users_collection = get_db()["users"]
        legacy_index = "encrypted_files.file_id_1"
        if legacy_index in users_collection.index_information():
            users_collection.drop_index(legacy_index)
            logger.warning("Dropped legacy MongoDB index: %s", legacy_index)

        # Ensure sessions TTL index is compatible with current model options.
        sessions_collection = get_db()["sessions"]
        session_expiry_index = "expires_at_1"
        sessions_indexes = sessions_collection.index_information()
        if session_expiry_index in sessions_indexes:
            ttl_value = sessions_indexes[session_expiry_index].get("expireAfterSeconds")
            if ttl_value != 0:
                sessions_collection.drop_index(session_expiry_index)
                logger.warning(
                    "Dropped conflicting MongoDB index: %s (expireAfterSeconds=%s)",
                    session_expiry_index,
                    ttl_value,
                )
    except Exception as e:
        # In development, log the error but allow server to start
        if CONFIG.APP_ENV == "development":
            print(f"Warning: Database connection failed (development mode): {str(e)}")
            print("         Server will start but database operations may fail")
        else:
            raise
    try:
        yield
    finally:
        try:
            disconnect()
        except:
            pass


app = FastAPI(title="Crypto Project Backend", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CONFIG.CORS_ORIGINS,
    allow_credentials=CONFIG.CORS_ALLOW_CREDENTIALS,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def transport_security_middleware(request: Request, call_next):
    # Temporarily disabled TLS requirement for network testing
    # if CONFIG.FORCE_HTTPS and not _is_local_request(request) and not _is_secure_request(request):
    #     return JSONResponse(
    #         status_code=426,
    #         content={"error": "TLS required", "message": "Use HTTPS (TLS) to access this API."},
    #     )

    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"

    if CONFIG.FORCE_HTTPS:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"
    if CONFIG.ENABLE_HTTP3_HINT:
        response.headers["Alt-Svc"] = 'h3=":443"; ma=86400'

    return response


@app.exception_handler(HTTPException)
async def http_exception_handler(_, exc: HTTPException):
    if exc.status_code == 401:
        return JSONResponse(
            status_code=401,
            content={"error": "Unauthorized", "message": str(exc.detail) or INVALID_TOKEN_MESSAGE},
        )
    if exc.status_code == 403:
        return JSONResponse(
            status_code=403,
            content={"error": "Forbidden", "message": str(exc.detail)},
        )
    if exc.status_code == 404:
        return JSONResponse(
            status_code=404,
            content={"error": "Not found", "message": str(exc.detail)},
        )
    if exc.status_code == 429:
        return JSONResponse(
            status_code=429,
            content={"error": "Too many requests", "message": str(exc.detail)},
        )
    if exc.status_code == 423:
        return JSONResponse(
            status_code=423,
            content={"error": "Locked", "message": str(exc.detail)},
        )
    if exc.status_code == 413:
        return JSONResponse(
            status_code=413,
            content={"error": "Payload too large", "message": str(exc.detail)},
        )
    if exc.status_code == 409:
        return JSONResponse(
            status_code=409,
            content={"error": "Conflict", "message": str(exc.detail)},
        )
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": "Bad request", "message": str(exc.detail)},
    )


def get_current_user(
    request: Request,
    credentials: Annotated[Optional[HTTPAuthorizationCredentials], Depends(security)],
):
    _ensure_secure_auth_transport(request)

    if not credentials or not credentials.credentials:
        raise HTTPException(status_code=401, detail=INVALID_TOKEN_MESSAGE)

    token = credentials.credentials
    payload = verify_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail=INVALID_TOKEN_MESSAGE)

    session = ServerSession.active_for_token_hash(hash_token(token))
    if not session:
        raise HTTPException(status_code=401, detail=INVALID_TOKEN_MESSAGE)

    user = session.user
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail=INVALID_TOKEN_MESSAGE)

    if payload.get("token_version", 0) != user.token_version:
        raise HTTPException(status_code=401, detail=INVALID_TOKEN_MESSAGE)

    return {"user": user, "token": token, "session": session}


@app.post("/api/auth/signup")
async def signup(payload: SignupRequest, request: Request):
    _ensure_secure_auth_transport(request)
    _enforce_rate_limit(request, "signup", CONFIG.RATE_LIMIT_SIGNUP)

    if User.objects(email=payload.email).first():
        raise HTTPException(status_code=409, detail="Email already registered")

    user = User(email=payload.email, name=payload.name)
    user.set_password(payload.password)
    try:
        user.save()
    except NotUniqueError:
        raise HTTPException(status_code=409, detail="Email already registered")

    access_token = _issue_auth_session(user, request)

    return JSONResponse(
        status_code=201,
        content={
            "message": "Account created successfully",
            "token": access_token,
            "user": {"email": user.email, "name": user.name},
        },
    )


@app.post("/api/auth/login")
async def login(payload: LoginRequest, request: Request):
    _ensure_secure_auth_transport(request)
    _enforce_rate_limit(request, "login", CONFIG.RATE_LIMIT_LOGIN)

    user = User.objects(email=payload.email).first()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if user.is_locked():
        raise HTTPException(status_code=423, detail="Account is temporarily locked")

    if not user.check_password(payload.password):
        user.register_failed_login(
            max_attempts=CONFIG.MAX_LOGIN_ATTEMPTS,
            lockout_minutes=CONFIG.LOCKOUT_MINUTES,
        )
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is inactive")

    access_token = _issue_auth_session(user, request)

    return JSONResponse(
        status_code=200,
        content={"message": "Login successful", "token": access_token, "user": user.to_dict()},
    )


@app.post("/api/auth/logout")
async def logout(current: Annotated[dict, Depends(get_current_user)]):
    current["session"].update(set__is_active=False)
    return JSONResponse(status_code=200, content={"message": "Logged out successfully"})


@app.post("/api/auth/logout-all")
async def logout_all(current: Annotated[dict, Depends(get_current_user)]):
    user = current["user"]
    user.token_version += 1
    user.save()
    ServerSession.objects(user=user, is_active=True).update(set__is_active=False)
    return JSONResponse(status_code=200, content={"message": "Logged out from all devices"})


@app.get("/api/auth/profile")
async def get_profile(current: Annotated[dict, Depends(get_current_user)]):
    return JSONResponse(status_code=200, content={"user": current["user"].to_dict()})


@app.post("/api/files/upload")
async def upload_encrypted_file(
    request: Request,
    file: Annotated[UploadFile, File(...)],
    current: Annotated[dict, Depends(get_current_user)],
    original_name: Annotated[str, Form()] = "encrypted_file.enc",
    algorithm: Annotated[str, Form()] = "AES-256-GCM",
):
    _enforce_rate_limit(request, "upload", CONFIG.RATE_LIMIT_UPLOAD)

    safe_name = sanitize_filename(original_name)
    if algorithm not in CONFIG.ALLOWED_ALGORITHMS:
        raise HTTPException(status_code=400, detail="Unsupported algorithm")
    if not allowed_file(safe_name, CONFIG.ALLOWED_EXTENSIONS):
        raise HTTPException(status_code=400, detail="Unsupported file extension")

    upload_stream = file.file
    upload_stream.seek(0, 2)
    actual_size = upload_stream.tell()
    upload_stream.seek(0)

    if actual_size <= 0:
        raise HTTPException(status_code=400, detail="No file selected")
    if actual_size > CONFIG.MAX_CONTENT_LENGTH:
        raise HTTPException(status_code=413, detail="File exceeds maximum allowed size")

    stored_file = EncryptedFile(
        user=current["user"],
        file_id=str(uuid.uuid4()),
        original_name=safe_name,
        algorithm=algorithm,
        file_size=actual_size,
    )
    stored_file.encrypted_data.put(
        upload_stream,
        filename=safe_name,
        content_type=file.content_type or "application/octet-stream",
    )
    stored_file.save()

    current["user"].update(
        inc__total_encrypted_files=1,
        inc__total_storage_used=actual_size,
    )
    current["user"].reload()

    return JSONResponse(
        status_code=201,
        content={
            "message": "File uploaded successfully",
            "file_id": stored_file.file_id,
            "file_name": stored_file.original_name,
            "algorithm": stored_file.algorithm,
            "file_size": stored_file.file_size,
        },
    )


@app.get("/api/files/list")
async def list_encrypted_files(current: Annotated[dict, Depends(get_current_user)]):
    files = EncryptedFile.objects(user=current["user"]).order_by("-uploaded_at")
    serialized_files = [
        {
            "file_id": file_obj.file_id,
            "original_name": file_obj.original_name,
            "algorithm": file_obj.algorithm,
            "file_size": file_obj.file_size,
            "uploaded_at": file_obj.uploaded_at.isoformat() if file_obj.uploaded_at else None,
        }
        for file_obj in files
    ]

    current["user"].reload()
    return JSONResponse(
        status_code=200,
        content={
            "total_files": len(serialized_files),
            "total_storage_mb": round(current["user"].total_storage_used / (1024 * 1024), 2),
            "files": serialized_files,
        },
    )


@app.get("/api/files/download/{file_id}")
async def download_encrypted_file(file_id: str, current: Annotated[dict, Depends(get_current_user)]):
    file_obj = EncryptedFile.objects(user=current["user"], file_id=file_id).first()
    if not file_obj:
        raise HTTPException(status_code=404, detail="File not found")

    filename = sanitize_filename(file_obj.original_name)
    return StreamingResponse(
        BytesIO(file_obj.encrypted_data.read()),
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.delete("/api/files/delete/{file_id}")
async def delete_encrypted_file(file_id: str, current: Annotated[dict, Depends(get_current_user)]):
    file_obj = EncryptedFile.objects(user=current["user"], file_id=file_id).first()
    if not file_obj:
        raise HTTPException(status_code=404, detail="File not found")

    deleted_size = file_obj.file_size
    file_obj.delete()
    
    # Safely decrement counters, never allow negative values
    user = current["user"]
    new_files_count = max(0, user.total_encrypted_files - 1)
    new_storage_used = max(0, user.total_storage_used - deleted_size)
    
    user.update(
        set__total_storage_used=new_storage_used,
        set__total_encrypted_files=new_files_count,
    )
    user.reload()

    return JSONResponse(
        status_code=200,
        content={
            "message": "File deleted successfully",
            "total_files": user.total_encrypted_files,
            "total_storage_mb": round(user.total_storage_used / (1024 * 1024), 2),
        },
    )


@app.delete("/api/files/delete-all")
async def delete_all_files(current: Annotated[dict, Depends(get_current_user)]):
    files = list(EncryptedFile.objects(user=current["user"]))
    for file_obj in files:
        file_obj.delete()

    current["user"].update(set__total_storage_used=0, set__total_encrypted_files=0)
    current["user"].reload()

    return JSONResponse(
        status_code=200,
        content={"message": "All files deleted successfully", "total_files": 0},
    )


@app.post("/api/history/add-record")
async def add_decryption_record(
    payload: DecryptionRecordRequest,
    current: Annotated[dict, Depends(get_current_user)],
):
    record = DecryptionHistory(
        user=current["user"],
        history_id=str(uuid.uuid4()),
        encrypted_file_id=payload.encrypted_file_id,
        encrypted_file_name=sanitize_filename(payload.encrypted_file_name),
        original_filename=payload.original_filename,
        file_size=payload.file_size,
    )
    record.save()

    return JSONResponse(
        status_code=201,
        content={"message": "Decryption record added", "history_id": record.history_id},
    )


@app.get("/api/history/list")
async def list_decryption_history(current: Annotated[dict, Depends(get_current_user)]):
    records = DecryptionHistory.objects(user=current["user"]).order_by("-decrypted_at")
    history = [
        {
            "history_id": record.history_id,
            "encrypted_file_id": record.encrypted_file_id,
            "encrypted_file_name": record.encrypted_file_name,
            "original_filename": record.original_filename,
            "file_size": record.file_size,
            "decrypted_at": record.decrypted_at.isoformat() if record.decrypted_at else None,
        }
        for record in records
    ]
    return JSONResponse(status_code=200, content={"total_records": len(history), "history": history})


@app.delete("/api/history/clear")
async def clear_decryption_history(current: Annotated[dict, Depends(get_current_user)]):
    DecryptionHistory.objects(user=current["user"]).delete()
    return JSONResponse(
        status_code=200,
        content={"message": "Decryption history cleared", "total_records": 0},
    )


@app.get("/api/health")
async def health_check():
    try:
        get_db().command("ping")
        db_status = "connected"
        is_healthy = True
        status_code = 200
    except Exception:
        logger.exception("Health check database ping failed")
        db_status = "disconnected"
        is_healthy = False
        status_code = 503

    return JSONResponse(
        status_code=status_code,
        content={
            "status": "healthy" if is_healthy else "unhealthy",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "database": db_status,
        },
    )