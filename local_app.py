"""
Local Flask Web Application for File Encryption

Provides Flask API endpoints for local desktop-mode encryption/decryption.
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
    from flask import Flask, jsonify, request, send_file, send_from_directory
except ImportError:
    Flask = None
    jsonify = None
    request = None
    send_file = None
    send_from_directory = None

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
    """Create and configure Flask web application for local encryption."""
    if Flask is None:
        raise RuntimeError("Flask is not installed. Install it with: pip install flask")

    web_app = Flask(__name__, static_folder=".", static_url_path="")

    @web_app.get("/")
    def index_page():
        return send_from_directory(".", "index.html")

    @web_app.post("/api/local/encrypt")
    def api_local_encrypt():
        uploaded = request.files.get("file")
        password = request.form.get("password", "")
        algorithm = request.form.get("algorithm", "AES-256-GCM")

        if uploaded is None or uploaded.filename == "":
            return jsonify({"error": "File is required"}), 400
        if not password:
            return jsonify({"error": "Password is required"}), 400

        try:
            raw = uploaded.read()
            encrypted_data, algorithm_name = encrypt_bytes(raw, password, algorithm)
            output_name = f"{Path(uploaded.filename).name}.enc"
            response = send_file(
                BytesIO(encrypted_data),
                as_attachment=True,
                download_name=output_name,
                mimetype="application/octet-stream",
            )
            response.headers["X-Algorithm"] = algorithm_name
            return response
        except Exception as exc:
            return jsonify({"error": f"Encryption failed: {exc}"}), 400

    @web_app.post("/api/local/decrypt")
    def api_local_decrypt():
        uploaded = request.files.get("file")
        password = request.form.get("password", "")

        if uploaded is None or uploaded.filename == "":
            return jsonify({"error": "File is required"}), 400
        if not password:
            return jsonify({"error": "Password is required"}), 400

        try:
            encrypted_data = uploaded.read()
            plaintext, algorithm_name = decrypt_bytes(encrypted_data, password)
            output_name = uploaded.filename.replace('.enc', '') if uploaded.filename.endswith('.enc') else f"{uploaded.filename}.decrypted"
            response = send_file(
                BytesIO(plaintext),
                as_attachment=True,
                download_name=output_name,
                mimetype="application/octet-stream",
            )
            response.headers["X-Algorithm"] = algorithm_name
            return response
        except Exception:
            return jsonify({"error": "Decryption failed. Wrong password or invalid encrypted file."}), 400

    return web_app
