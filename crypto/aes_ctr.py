"""AES-128-CTR implementation using Web Crypto API.

This module provides AES-128-CTR encryption/decryption functions.

Usage:
    key = derive_key(password, salt)
    cipher = aes_ctr_encrypt(key, iv, plaintext)
    plain = aes_ctr_decrypt(key, iv, cipher)
"""

import os
from typing import Union, Tuple
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend

def aes_ctr_encrypt(key: bytes, iv: bytes, plaintext: bytes) -> bytes:
    """Encrypt data using AES-128-CTR."""
    cipher = Cipher(algorithms.AES(key), modes.CTR(iv), backend=default_backend())
    encryptor = cipher.encryptor()
    return encryptor.update(plaintext) + encryptor.finalize()

def aes_ctr_decrypt(key: bytes, iv: bytes, ciphertext: bytes) -> bytes:
    """Decrypt data using AES-128-CTR."""
    cipher = Cipher(algorithms.AES(key), modes.CTR(iv), backend=default_backend())
    decryptor = cipher.decryptor()
    return decryptor.update(ciphertext) + decryptor.finalize()

def generate_iv() -> bytes:
    """Generate random 16-byte IV for AES-CTR."""
    return os.urandom(16)

if __name__ == "__main__":
    # Demo usage
    key = os.urandom(16)  # 128-bit key
    iv = generate_iv()
    plaintext = b"Hello, AES-CTR!"
    
    ciphertext = aes_ctr_encrypt(key, iv, plaintext)
    decrypted = aes_ctr_decrypt(key, iv, ciphertext)
    
    print(f"Plain: {plaintext}")
    print(f"Cipher: {ciphertext.hex()}")
    print(f"Decrypt: {decrypted}")
    print("Success:", plaintext == decrypted)

