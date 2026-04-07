"""
AES-CTR-128 Encryption Module

Provides encrypt and decrypt functions using AES-CTR with a 128-bit key.
Key derivation is done using Argon2id.

Note: AES-CTR does NOT provide authentication (no integrity check).
      A wrong password will produce garbage output, not an error.
"""

import os
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from crypto.kdf import derive_key

# Algorithm ID (must match app.py)
ALGO_ID = 2

# Sizes
SALT_SIZE = 16    # bytes
NONCE_SIZE = 16   # bytes — AES-CTR uses a 16-byte counter/IV
KEY_SIZE = 16     # bytes = 128 bits





def encrypt_aes_ctr(data: bytes, password: str):
    """
    Encrypt data using AES-CTR-128.

    Args:
        data:     Raw bytes of the file to encrypt.
        password: User-provided password string.

    Returns:
        Tuple of (salt, nonce, ciphertext) — all bytes.
        - salt      : 16 bytes (for key derivation)
        - nonce     : 16 bytes (initial counter value / IV)
        - ciphertext: encrypted data (same length as plaintext)
    """
    salt = os.urandom(SALT_SIZE)
    nonce = os.urandom(NONCE_SIZE)

    key = derive_key(password, salt, length=KEY_SIZE)

    cipher = Cipher(algorithms.AES(key), modes.CTR(nonce))
    encryptor = cipher.encryptor()
    ciphertext = encryptor.update(data) + encryptor.finalize()

    return salt, nonce, ciphertext


def decrypt_aes_ctr(ciphertext: bytes, password: str, salt: bytes, nonce: bytes) -> bytes:
    """
    Decrypt data using AES-CTR-128.

    Args:
        ciphertext: Encrypted bytes.
        password:   User-provided password string.
        salt:       16-byte salt (from the encrypted file).
        nonce:      16-byte nonce/IV (from the encrypted file).

    Returns:
        Original plaintext bytes.

    Note:
        AES-CTR has no authentication tag, so a wrong password will NOT
        raise an error — it will return corrupted/garbage data silently.
    """
    key = derive_key(password, salt, length=KEY_SIZE)

    cipher = Cipher(algorithms.AES(key), modes.CTR(nonce))
    decryptor = cipher.decryptor()
    plaintext = decryptor.update(ciphertext) + decryptor.finalize()

    return plaintext