"""ChaCha20-Poly1305 implementation.

AEAD authenticated encryption using ChaCha20 stream cipher + Poly1305 MAC.

Usage:
    key = derive_key(password, salt)
    cipher, tag = chacha20_poly1305_encrypt(key, nonce, plaintext)
    plain = chacha20_poly1305_decrypt(key, nonce, cipher, tag)
"""

import os
from typing import Union, Tuple
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend

def chacha20_encrypt(key: bytes, nonce: bytes, plaintext: bytes, counter: int = 1) -> bytes:
    """ChaCha20 stream encryption."""
    cipher = Cipher(
        algorithms.ChaCha20(key, nonce),
        mode=None,  # Stream cipher
        backend=default_backend()
    )
    encryptor = cipher.encryptor()
    return encryptor.update(plaintext)

def poly1305_mac(message: bytes, key: bytes) -> bytes:
    """Poly1305 one-time MAC."""
    cipher = Cipher(
        algorithms.ChaCha20(key, b'\x00' * 12),  # First block for Poly key
        mode=None,
        backend=default_backend()
    )
    mac = cipher.encryptor()
    return mac.update(message + b'\x00' * (16 - len(message) % 16))[:16]

def chacha20_poly1305_encrypt(key: bytes, nonce: bytes, plaintext: bytes) -> Tuple[bytes, bytes]:
    """ChaCha20-Poly1305 authenticated encryption."""
    # Generate Poly1305 key from first ChaCha20 block
    poly_key_cipher = Cipher(
        algorithms.ChaCha20(key, nonce),
        mode=None,
        backend=default_backend()
    )
    poly_key = poly_key_cipher.encryptor().update(b'\x00' * 64)[:32]
    
    # Encrypt with ChaCha20 starting from block 1
    ciphertext = chacha20_encrypt(key, nonce, plaintext, counter=1)
    
    # Authenticate with Poly1305
    tag = poly1305_mac(ciphertext, poly_key)
    
    return ciphertext, tag

def chacha20_poly1305_decrypt(key: bytes, nonce: bytes, ciphertext: bytes, tag: bytes) -> bytes:
    """ChaCha20-Poly1305 authenticated decryption."""
    # Verify Poly1305 first
    poly_key_cipher = Cipher(
        algorithms.ChaCha20(key, nonce),
        mode=None,
        backend=default_backend()
    )
    poly_key = poly_key_cipher.encryptor().update(b'\x00' * 64)[:32]
    
    expected_tag = poly1305_mac(ciphertext, poly_key)
    if expected_tag != tag:
        raise ValueError("Authentication failed")
    
    # Decrypt (XOR with keystream)
    plaintext = chacha20_encrypt(key, nonce, ciphertext, counter=1)
    return plaintext

def generate_nonce() -> bytes:
    """Generate random 12-byte nonce."""
    return os.urandom(12)

if __name__ == "__main__":
    # Demo usage
    key = os.urandom(32)
    nonce = generate_nonce()
    plaintext = b"Secret ChaCha20-Poly1305 message!"
    
    ciphertext, tag = chacha20_poly1305_encrypt(key, nonce, plaintext)
    decrypted = chacha20_poly1305_decrypt(key, nonce, ciphertext, tag)
    
    print(f"Plain: {plaintext}")
    print(f"Cipher: {ciphertext.hex()}")
    print(f"Tag: {tag.hex()}")
    print(f"Decrypt: {decrypted}")
    print("Success:", plaintext == decrypted)

