# Password-Based File Encryption Tool - Workflow Documentation

## Project Overview

This is a secure file encryption tool that supports multiple encryption algorithms: **AES-GCM**, **AES-CTR**, and **ChaCha20-Poly1305** for file encryption, with **Argon2** for key derivation. The tool provides a simple CLI interface to encrypt, decrypt, and manage sensitive files.

---

## Technology Stack

| Component | Technology |
|-----------|------------|
| Encryption | AES-GCM (256-bit), AES-CTR (256-bit), ChaCha20-Poly1305 |
| Key Derivation | Argon2id |
| Python Version | 3.10+ |
| Dependencies | `cryptography`, `argon2-cffi` |

---

## Project Structure

```
crypto_project/
├── app.py                 # Main CLI application
├── requirements.txt      # Python dependencies
├── setup.txt             # Setup instructions
├── workflow.md           # This file
├── crypto/
│   ├── kdf.py           # Key Derivation Function (Argon2)
│   ├── aes_gcm.py       # AES-GCM encryption/decryption
│   ├── aes_ctr.py       # AES-CTR encryption/decryption
│   └── chacha20.py      # ChaCha20-Poly1305 encryption/decryption
├── storage/              # Encrypted files (generated)
├── decrypted/           # Decrypted files (generated)
└── test_files/          # Test files for encryption
```

---

## Workflows

### 1. Encrypt File Workflow

```
┌─────────────────────────────────────────────────────────────┐
│                     ENCRYPT FILE                             │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 1. User selects "1. Encrypt File" from menu                 │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. User enters file path to encrypt                         │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Validate file exists                                     │
│    └─► If not found: Show error and return to menu         │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. User selects encryption algorithm:                       │
│    - 1. AES-GCM (recommended)                               │
│    - 2. AES-CTR                                             │
│    - 3. ChaCha20-Poly1305                                   │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. User enters password (masked with asterisks)             │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. Read file content as binary data                         │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 7. Generate random 16-byte salt using os.urandom(16)        │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 8. Derive 32-byte key from password using Argon2id:         │
│    - Time cost: 3                                           │
│    - Memory cost: 65536 KB                                  │
│    - Parallelism: 2                                         │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 9. Generate nonce based on algorithm:                       │
│    - AES-GCM: 12 bytes                                      │
│    - AES-CTR: 16 bytes                                      │
│    - ChaCha20-Poly1305: 12 bytes                            │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 10. Encrypt data using selected algorithm:                  │
│     - AES-GCM: AESGCM(key).encrypt(nonce, data, None)      │
│     - AES-CTR: AES-CTR cipher encrypt                       │
│     - ChaCha20: ChaCha20Poly1305(key).encrypt(nonce, data) │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 11. Create output filename:                                 │
│     {original_name}_{uuid}.enc                              │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 12. Write encrypted file to storage/:                       │
│     [algo_id (1 byte)] [salt (16 bytes)] [nonce] [ciphertext]│
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 13. Display success message with algorithm and filename     │
└─────────────────────────────────────────────────────────────┘
```

---

### 2. Decrypt File Workflow

```
┌─────────────────────────────────────────────────────────────┐
│                     DECRYPT FILE                             │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 1. User selects "2. Decrypt File" from menu                 │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. List all encrypted files in storage/ directory           │
│    └─► If no files: Show message and return to menu         │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. User selects file by number                               │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. User enters password (masked with asterisks)             │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. Read encrypted file data                                  │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. Detect algorithm from first byte (algo_id):              │
│    - 1: AES-GCM (nonce 12 bytes)                            │
│    - 2: AES-CTR (nonce 16 bytes)                            │
│    - 3: ChaCha20-Poly1305 (nonce 12 bytes)                  │
│    - Other: Legacy format (AES-GCM)                         │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 7. Extract components based on format:                      │
│    New format:                                               │
│    - algo_id = filedata[0]                                   │
│    - salt = filedata[1:17]                                   │
│    - nonce = filedata[17:17+nonce_size]                      │
│    - ciphertext = filedata[17+nonce_size:]                   │
│    Legacy format:                                            │
│    - salt = filedata[0:16]                                   │
│    - nonce = filedata[16:28]                                 │
│    - ciphertext = filedata[28:]                              │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 8. Derive key from password using extracted salt            │
│    (same Argon2id parameters as encryption)                 │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 9. Decrypt using detected algorithm:                        │
│    - AES-GCM: AESGCM(key).decrypt(nonce, ciphertext, None) │
│    - AES-CTR: AES-CTR cipher decrypt                        │
│    - ChaCha20: ChaCha20Poly1305(key).decrypt(nonce, ct)    │
│    └─► If fails: Wrong password or corrupted file           │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 9. Save decrypted file to decrypted/ directory               │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 10. Display success message with saved filename             │
└─────────────────────────────────────────────────────────────┘
```

---

### 3. Delete File Workflow

```
┌─────────────────────────────────────────────────────────────┐
│                     DELETE FILE                              │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 1. User selects "3. Delete File" from menu                  │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. User chooses folder:                                      │
│    - Option 1: test_files                                    │
│    - Option 2: decrypted                                     │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. List files in selected folder                             │
│    └─► If no files: Show message and return to menu         │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. User selects file by number                               │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. Confirm deletion: "Are you sure you want to delete?"     │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. If confirmed "yes": Delete file                          │
│    If "no": Cancel and return to menu                        │
└─────────────────────────────────────────────────────────────┘
```

---

## Security Considerations

### Key Derivation (Argon2id)
- **Algorithm**: Argon2id (winner of Password Hashing Competition)
- **Time Cost**: 3 iterations
- **Memory Cost**: 64 MB
- **Parallelism**: 2 threads
- **Key Length**: 256 bits (32 bytes)

### Encryption Algorithms

#### AES-GCM (Recommended)
- **Mode**: Galois/Counter Mode (authenticated encryption)
- **Key Size**: 256 bits
- **Nonce Size**: 96 bits (12 bytes)
- **Security**: Provides confidentiality AND integrity/authenticity
- **Use Case**: General purpose, recommended for most scenarios

#### AES-CTR
- **Mode**: Counter Mode (stream cipher)
- **Key Size**: 256 bits
- **Nonce Size**: 128 bits (16 bytes)
- **Security**: Provides confidentiality only (no authentication)
- **Use Case**: Fast encryption, when integrity is handled separately
- **Note**: Does NOT provide authentication - file tampering won't be detected

#### ChaCha20-Poly1305
- **Mode**: Stream cipher with Poly1305 MAC (authenticated encryption)
- **Key Size**: 256 bits
- **Nonce Size**: 96 bits (12 bytes)
- **Security**: Provides confidentiality AND integrity/authenticity
- **Use Case**: Alternative to AES-GCM, better performance on devices without AES hardware acceleration

### File Format (New)
```
┌─────────┬──────────┬─────────┬────────────────────┐
│ Algo ID │   Salt   │  Nonce  │     Ciphertext     │
│  (1 B)  │ (16 B)   │ (var)   │    (variable)      │
└─────────┴──────────┴─────────┴────────────────────┘

Algo ID:
  1 = AES-GCM (nonce: 12 bytes)
  2 = AES-CTR (nonce: 16 bytes)
  3 = ChaCha20-Poly1305 (nonce: 12 bytes)
```

### Legacy File Format (for backward compatibility)
```
┌──────────┬─────────┬────────────────────┐
│   Salt   │  Nonce  │     Ciphertext     │
│ (16 B)   │ (12 B)  │    (variable)      │
└──────────┴─────────┴────────────────────┘
```

---

## Setup & Installation

### Prerequisites
- Python 3.10 or higher

### Installation Steps

```
bash
# 1. Clone or navigate to project directory
cd crypto_project

# 2. Create virtual environment
python -m venv venv

# 3. Activate virtual environment
# Linux/Mac:
source venv/bin/activate
# Windows:
venv\Scripts\activate

# 4. Install dependencies
pip install -r requirements.txt
```

---

## Usage

### Run the Application

```
bash
python app.py
```

### Menu Options

```
========== Encryption Tool ==========
1. Encrypt File
2. Decrypt File
3. Delete File
4. Exit
```

### Example: Encrypt a File

1. Run `python app.py`
2. Enter `1` to select "Encrypt File"
3. Enter the file path (e.g., `test_files/test2.txt`)
4. Select encryption algorithm (1-3):
   - `1` for AES-GCM (recommended)
   - `2` for AES-CTR
   - `3` for ChaCha20-Poly1305
5. Enter a strong password (displayed as asterisks `***`)
6. Encrypted file is saved in `storage/` with `.enc` extension

### Example: Decrypt a File

1. Run `python app.py`
2. Enter `2` to select "Decrypt File"
3. Select the file number from the list
4. Enter the password used during encryption (displayed as asterisks `***`)
5. Algorithm is automatically detected from the file
6. Decrypted file is saved in `decrypted/` directory

---

## Error Handling

| Error | Cause | Solution |
|-------|-------|----------|
| "File not found!" | Invalid file path | Verify file exists and path is correct |
| "Invalid selection" | Invalid menu choice | Enter a valid number from the list |
| "Decryption failed!" | Wrong password or corrupted file | Verify password and file integrity |

---

## Testing

### Test Files Location
- `test_files/` - Contains sample files for encryption testing
- `storage/` - Encrypted files are stored here after encryption
- `decrypted/` - Decrypted files appear here after decryption

### Manual Testing Workflow
1. Place a test file in `test_files/`
2. Run encryption and note the output filename
3. Run decryption and select the encrypted file
4. Verify decrypted file matches original in `decrypted/`

---

## Future Enhancements

Potential improvements for the project:
- [ ] Add GUI interface (Tkinter/PyQt)
- [ ] Implement file compression before encryption
- [ ] Add batch file encryption/decryption
- [ ] Add password strength indicator
- [x] ~~Implement secure password entry (hidden input)~~ ✓ Implemented
- [x] ~~Add multiple encryption algorithms~~ ✓ Implemented (AES-GCM, AES-CTR, ChaCha20)
- [ ] Add encryption metadata (original filename, date)
- [ ] Add integrity verification (checksums)
- [ ] Implement secure file deletion (overwrite before delete)
