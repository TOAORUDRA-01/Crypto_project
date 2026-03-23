"""
AES-GCM-256 Encryption Module

Provides encrypt and decrypt functions using AES-GCM-256.
Key derivation is done using Argon2id (via argon2-cffi + cryptography).
"""

import os
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from crypto.kdf import derive_key

# Algorithm ID (must match app.py)
ALGO_ID = 1

# Sizes
SALT_SIZE = 16    # bytes
NONCE_SIZE = 12   # bytes for AES-GCM
KEY_SIZE = 32     # bytes = 256 bits





def encrypt_aes_gcm(data: bytes, password: str):
    """
    Encrypt data using AES-GCM-256.

    Args:
        data:     Raw bytes of the file to encrypt.
        password: User-provided password string.

    Returns:
        Tuple of (salt, nonce, ciphertext) — all bytes.
        - salt      : 16 bytes (for key derivation)
        - nonce     : 12 bytes (for AES-GCM)
        - ciphertext: encrypted data + 16-byte GCM authentication tag
    """
    salt = os.urandom(SALT_SIZE)
    nonce = os.urandom(NONCE_SIZE)

    key = derive_key(password, salt, length=KEY_SIZE)

    aesgcm = AESGCM(key)
    ciphertext = aesgcm.encrypt(nonce, data, None)  # No additional data (AAD)

    return salt, nonce, ciphertext


def decrypt_aes_gcm(ciphertext: bytes, password: str, salt: bytes, nonce: bytes) -> bytes:
    """
    Decrypt data using AES-GCM-256.

    Args:
        ciphertext: Encrypted bytes (includes GCM auth tag).
        password:   User-provided password string.
        salt:       16-byte salt (from the encrypted file).
        nonce:      12-byte nonce (from the encrypted file).

    Returns:
        Original plaintext bytes.

    Raises:
        cryptography.exceptions.InvalidTag: If password is wrong or data is corrupted.
    """
    key = derive_key(password, salt, length=KEY_SIZE)

    aesgcm = AESGCM(key)
    plaintext = aesgcm.decrypt(nonce, ciphertext, None)  # No additional data (AAD)

    return plaintext
