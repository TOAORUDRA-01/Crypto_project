"""
Crypto Package

This package contains cryptographic modules for file encryption:
- kdf: Key Derivation Function (Argon2id)
- aes_gcm: AES-GCM-256 encryption/decryption
"""

from .kdf import derive_key
from .aes_gcm import encrypt_aes_gcm, decrypt_aes_gcm, ALGO_ID

__all__ = ['derive_key', 'encrypt_aes_gcm', 'decrypt_aes_gcm', 'ALGO_ID']

