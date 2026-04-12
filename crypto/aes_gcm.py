"""AES-256-GCM implementation using Web Crypto API.

This module provides AES-256-GCM encryption/decryption with authentication.

Usage:
    key = derive_key(password, salt)
    cipher, tag = aes_gcm_encrypt(key, iv, plaintext)
    plain = aes_gcm_decrypt(key, iv, cipher, tag)
"""

import os
from typing import Union, Tuple
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.backends import default_backend

def aes_gcm_encrypt(key: bytes, iv: bytes, plaintext: bytes) -> Tuple[bytes, bytes]:
    """Encrypt data using AES-256-GCM. Returns (ciphertext, tag)."""
    cipher = Cipher(algorithms.AES(key), modes.GCM(iv), backend=default_backend())
    encryptor = cipher.encryptor()
    ciphertext = encryptor.update(plaintext) + encryptor.finalize()
    tag = encryptor.tag
    return ciphertext, tag

def aes_gcm_decrypt(key: bytes, iv: bytes, ciphertext: bytes, tag: bytes) -> bytes:
    """Decrypt data using AES-256-GCM. Raises InvalidTag if authentication fails."""
    cipher = Cipher(algorithms.AES(key), modes.GCM(iv, tag), backend=default_backend())
    decryptor = cipher.decryptor()
    return decryptor.update(ciphertext) + decryptor.finalize()

def generate_iv() -> bytes:
    """Generate random 12-byte IV for AES-GCM (recommended)."""
    return os.urandom(12)

def derive_key(password: str, salt: bytes, iterations: int = 100000) -> bytes:
    """Derive 256-bit key from password using PBKDF2-SHA256."""
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=iterations,
        backend=default_backend()
    )
    return kdf.derive(password.encode())

if __name__ == "__main__":
    # Demo usage
    password = "testpass123"
    salt = os.urandom(16)
    key = derive_key(password, salt)
    iv = generate_iv()
    plaintext = b"Confidential AES-GCM data!"
    
    ciphertext, tag = aes_gcm_encrypt(key, iv, plaintext)
    decrypted = aes_gcm_decrypt(key, iv, ciphertext, tag)
    
    print(f"Plain: {plaintext}")
    print(f"Cipher: {ciphertext.hex()}")
    print(f"Tag: {tag.hex()}")
    print(f"Decrypt: {decrypted}")
    print("Success:", plaintext == decrypted)

