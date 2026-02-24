import os
from argon2.low_level import hash_secret_raw, Type

def derive_key(password: str, salt: bytes, length=32):
    return hash_secret_raw(
        secret=password.encode(),
        salt=salt,
        time_cost=3,
        memory_cost=65536,
        parallelism=2,
        hash_len=length,
        type=Type.ID
    )