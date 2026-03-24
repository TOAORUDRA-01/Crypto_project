"""
Local FastAPI Web Application for File Encryption

Provides FastAPI endpoints for local desktop-mode encryption/decryption.
"""

import os
import sys
from io import BytesIO
from pathlib import Path

# Ensure crypto modules can be imported
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from crypto.aes_gcm import encrypt_aes_gcm, decrypt_aes_gcm
from crypto.aes_ctr import encrypt_aes_ctr, decrypt_aes_ctr
from crypto.chacha20_poly1305 import encrypt_chacha20_poly1305, decrypt_chacha20_poly1305

try:
    from fastapi import FastAPI, File, Form, UploadFile
    from fastapi.responses import FileResponse, JSONResponse
    from fastapi.staticfiles import StaticFiles
except ImportError:
    FastAPI = None
    File = None
    Form = None
    UploadFile = None
    FileResponse = None
    JSONResponse = None
    StaticFiles = None

# Algorithm IDs for file format
ALGO_AES_GCM = 1
ALGO_AES_CTR = 2
ALGO_CHACHA20 = 3


def encrypt_bytes(data: bytes, password: str, algorithm: str):
    """Encrypt data using the specified algorithm."""
    if algorithm == "AES-256-GCM":
        salt, nonce, ciphertext = encrypt_aes_gcm(data, password)
        encrypted_data = bytes([ALGO_AES_GCM]) + salt + nonce + ciphertext
        algorithm_name = "AES-GCM-256"
    elif algorithm == "AES-128-CTR":
        salt, nonce, ciphertext = encrypt_aes_ctr(data, password)
        encrypted_data = bytes([ALGO_AES_CTR]) + salt + nonce + ciphertext
        algorithm_name = "AES-CTR-128"
    elif algorithm == "ChaCha20-Poly1305":
        salt, nonce, ciphertext = encrypt_chacha20_poly1305(data, password)
        encrypted_data = bytes([ALGO_CHACHA20]) + salt + nonce + ciphertext
        algorithm_name = "ChaCha20-Poly1305"
    else:
        raise ValueError("Unsupported algorithm")

    return encrypted_data, algorithm_name


def decrypt_bytes(encrypted_data: bytes, password: str):
    """Decrypt encrypted data."""
    if len(encrypted_data) < 1:
        raise ValueError("Invalid encrypted file")

    algo_id = encrypted_data[0]
    if algo_id in [ALGO_AES_GCM, ALGO_AES_CTR, ALGO_CHACHA20]:
        salt = encrypted_data[1:17]
        if algo_id == ALGO_AES_GCM:
            nonce_size = 12
        elif algo_id == ALGO_AES_CTR:
            nonce_size = 16
        else:
            nonce_size = 12
        nonce_start = 17
        nonce = encrypted_data[nonce_start:nonce_start + nonce_size]
        ciphertext = encrypted_data[nonce_start + nonce_size:]
    else:
        algo_id = ALGO_AES_GCM
        salt = encrypted_data[0:16]
        nonce = encrypted_data[16:28]
        ciphertext = encrypted_data[28:]

    if algo_id == ALGO_AES_GCM:
        plaintext = decrypt_aes_gcm(ciphertext, password, salt, nonce)
        algorithm_name = "AES-GCM-256"
    elif algo_id == ALGO_AES_CTR:
        plaintext = decrypt_aes_ctr(ciphertext, password, salt, nonce)
        algorithm_name = "AES-CTR-128"
    elif algo_id == ALGO_CHACHA20:
        plaintext = decrypt_chacha20_poly1305(ciphertext, password, salt, nonce)
        algorithm_name = "ChaCha20-Poly1305"
    else:
        raise ValueError("Unsupported algorithm")

    return plaintext, algorithm_name


def create_web_app():
    """Create and configure FastAPI web application for local encryption."""
    if FastAPI is None:
        raise RuntimeError("FastAPI is not installed. Install it with: pip install fastapi uvicorn")

    app_dir = os.path.dirname(os.path.abspath(__file__))
    frontend_dir = os.path.join(app_dir, "crypto_client_frontend")
    
    web_app = FastAPI(title="Local Encryption Service")
    
    # Mount static files for serving the frontend
    web_app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="static")

    @web_app.post("/api/local/encrypt")
    async def api_local_encrypt(file: UploadFile = File(...), password: str = Form(...), algorithm: str = Form(...)):
        if not file or file.filename == "":
            return JSONResponse({"error": "File is required"}, status_code=400)
        if not password:
            return JSONResponse({"error": "Password is required"}, status_code=400)

        try:
            raw = await file.read()
            encrypted_data, algorithm_name = encrypt_bytes(raw, password, algorithm)
            output_name = f"{Path(file.filename).name}.enc"
            
            return FileResponse(
                BytesIO(encrypted_data),
                media_type="application/octet-stream",
                filename=output_name,
                headers={"X-Algorithm": algorithm_name}
            )
        except Exception as exc:
            return JSONResponse({"error": f"Encryption failed: {exc}"}, status_code=400)

    @web_app.post("/api/local/decrypt")
    async def api_local_decrypt(file: UploadFile = File(...), password: str = Form(...)):
        if not file or file.filename == "":
            return JSONResponse({"error": "File is required"}, status_code=400)
        if not password:
            return JSONResponse({"error": "Password is required"}, status_code=400)

        try:
            encrypted_data = await file.read()
            plaintext, algorithm_name = decrypt_bytes(encrypted_data, password)
            output_name = file.filename.replace('.enc', '') if file.filename.endswith('.enc') else f"{file.filename}.decrypted"
            
            return FileResponse(
                BytesIO(plaintext),
                media_type="application/octet-stream",
                filename=output_name,
                headers={"X-Algorithm": algorithm_name}
            )
        except Exception:
            return JSONResponse({"error": "Decryption failed. Wrong password or invalid encrypted file."}, status_code=400)

    return web_app
