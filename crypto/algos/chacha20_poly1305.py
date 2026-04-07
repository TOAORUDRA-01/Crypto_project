"""
ChaCha20-Poly1305 Encryption Module

Provides encrypt and decrypt functions using ChaCha20-Poly1305.
Key derivation is done using Argon2id.

ChaCha20-Poly1305 is an authenticated encryption algorithm (AEAD),
providing both confidentiality and integrity — similar to AES-GCM.
"""

import os
from cryptography.hazmat.primitives.ciphers.aead import ChaCha20Poly1305
from crypto.kdf import derive_key

# Algorithm ID (must match app.py)
ALGO_ID = 3

# Sizes
SALT_SIZE = 16    # bytes
NONCE_SIZE = 12   # bytes — ChaCha20-Poly1305 uses a 12-byte nonce
KEY_SIZE = 32     # bytes = 256 bits (ChaCha20 always uses 256-bit keys)





def encrypt_chacha20_poly1305(data: bytes, password: str):
    """
    Encrypt data using ChaCha20-Poly1305.

    Args:
        data:     Raw bytes of the file to encrypt.
        password: User-provided password string.

    Returns:
        Tuple of (salt, nonce, ciphertext) — all bytes.
        - salt      : 16 bytes (for key derivation)
        - nonce     : 12 bytes (for ChaCha20-Poly1305)
        - ciphertext: encrypted data + 16-byte Poly1305 authentication tag
    """
    salt = os.urandom(SALT_SIZE)
    nonce = os.urandom(NONCE_SIZE)

    key = derive_key(password, salt, length=KEY_SIZE)

    chacha = ChaCha20Poly1305(key)
    ciphertext = chacha.encrypt(nonce, data, None)  # No additional data (AAD)

    return salt, nonce, ciphertext


def decrypt_chacha20_poly1305(ciphertext: bytes, password: str, salt: bytes, nonce: bytes) -> bytes:
    """
    Decrypt data using ChaCha20-Poly1305.

    Args:
        ciphertext: Encrypted bytes (includes Poly1305 auth tag).
        password:   User-provided password string.
        salt:       16-byte salt (from the encrypted file).
        nonce:      12-byte nonce (from the encrypted file).

    Returns:
        Original plaintext bytes.

    Raises:
        cryptography.exceptions.InvalidTag: If password is wrong or data is corrupted.
    """
    key = derive_key(password, salt, length=KEY_SIZE)

    chacha = ChaCha20Poly1305(key)
    plaintext = chacha.decrypt(nonce, ciphertext, None)  # No additional data (AAD)

    return plaintext
