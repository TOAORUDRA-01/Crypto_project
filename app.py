"""
Password-Based File Encryption Tool

A secure file encryption tool that supports multiple encryption algorithms:
- AES-GCM (recommended)
- AES-CTR
- ChaCha20-Poly1305

Uses Argon2id for key derivation.
"""

import os
import sys
import uuid
import getpass
from pathlib import Path

# Ensure crypto modules can be imported
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from crypto.aes_gcm import encrypt_aes_gcm, ALGO_ID as AES_GCM_ALGO

# Constants
STORAGE_DIR = "storage"
DECRYPTED_DIR = "decrypted"
TEST_FILES_DIR = "test_files"

# Algorithm IDs for file format
ALGO_AES_GCM = 1
ALGO_AES_CTR = 2
ALGO_CHACHA20 = 3


def ensure_directories():
    """Create necessary directories if they don't exist."""
    for directory in [STORAGE_DIR, DECRYPTED_DIR, TEST_FILES_DIR]:
        os.makedirs(directory, exist_ok=True)


def get_password() -> str:
    """Get password from user with masked input."""
    while True:
        password = getpass.getpass("Enter password: ")
        if password:
            return password
        print("Password cannot be empty. Please try again.")


def select_algorithm() -> int:
    """Display algorithm selection menu and return choice."""
    print("\nSelect encryption algorithm:")
    print("1. AES-GCM (recommended)")
    print("2. AES-CTR")
    print("3. ChaCha20-Poly1305")
    
    while True:
        choice = input("Enter choice (1-3): ").strip()
        if choice in ['1', '2', '3']:
            return int(choice)
        print("Invalid selection. Please enter 1, 2, or 3.")


def encrypt_file():
    """Encrypt a file using the selected algorithm."""
    print("\n=== ENCRYPT FILE ===")
    
    # Get file path from user
    file_path = input("Enter file path to encrypt: ").strip()
    
    # Validate file exists
    if not os.path.exists(file_path):
        print("Error: File not found!")
        return
    
    if not os.path.isfile(file_path):
        print("Error: Path is not a file!")
        return
    
    # Select algorithm
    algo_choice = select_algorithm()
    
    # Get password
    password = get_password()
    
    # Read file content as binary
    try:
        with open(file_path, 'rb') as f:
            data = f.read()
    except Exception as e:
        print(f"Error reading file: {e}")
        return
    
    # Generate unique ID for filename
    unique_id = str(uuid.uuid4())[:8]
    original_name = Path(file_path).stem
    output_filename = f"{original_name}_{unique_id}.enc"
    output_path = os.path.join(STORAGE_DIR, output_filename)
    
    # Encrypt based on selected algorithm
    try:
        if algo_choice == ALGO_AES_GCM:
            # AES-GCM encryption
            salt, nonce, ciphertext = encrypt_aes_gcm(data, password)
            
            # Create output: [algo_id (1 byte)] [salt (16 bytes)] [nonce (12 bytes)] [ciphertext]
            algo_id_bytes = bytes([ALGO_AES_GCM])
            encrypted_data = algo_id_bytes + salt + nonce + ciphertext
            
            algorithm_name = "AES-GCM-256"
            
        elif algo_choice == ALGO_AES_CTR:
            # AES-CTR encryption (placeholder - implement if needed)
            print("Error: AES-CTR not yet implemented")
            return
            
        elif algo_choice == ALGO_CHACHA20:
            # ChaCha20-Poly1305 encryption (placeholder - implement if needed)
            print("Error: ChaCha20-Poly1305 not yet implemented")
            return
        
        # Write encrypted file
        with open(output_path, 'wb') as f:
            f.write(encrypted_data)
        
        print(f"\nEncryption successful!")
        print(f"Algorithm: {algorithm_name}")
        print(f"Encrypted file saved to: {output_path}")
        
    except Exception as e:
        print(f"Encryption failed: {e}")


def decrypt_file():
    """Decrypt an encrypted file."""
    print("\n=== DECRYPT FILE ===")
    
    # List encrypted files in storage
    if not os.path.exists(STORAGE_DIR):
        print("No encrypted files found.")
        return
    
    files = [f for f in os.listdir(STORAGE_DIR) if f.endswith('.enc')]
    
    if not files:
        print("No encrypted files found.")
        return
    
    # Display list of files
    print("\nAvailable encrypted files:")
    for i, filename in enumerate(files, 1):
        print(f"{i}. {filename}")
    
    # Select file
    try:
        choice = int(input("\nSelect file number: "))
        if choice < 1 or choice > len(files):
            print("Invalid selection.")
            return
        selected_file = files[choice - 1]
    except ValueError:
        print("Invalid input.")
        return
    
    # Get password
    password = get_password()
    
    # Read encrypted file
    file_path = os.path.join(STORAGE_DIR, selected_file)
    try:
        with open(file_path, 'rb') as f:
            encrypted_data = f.read()
    except Exception as e:
        print(f"Error reading file: {e}")
        return
    
    # Detect algorithm from first byte
    if len(encrypted_data) < 1:
        print("Error: Invalid encrypted file.")
        return
    
    algo_id = encrypted_data[0]
    
    # Handle new format: [algo_id (1)] [salt (16)] [nonce (var)] [ciphertext]
    # Handle legacy format: [salt (16)] [nonce (12)] [ciphertext]
    
    if algo_id in [ALGO_AES_GCM, ALGO_AES_CTR, ALGO_CHACHA20]:
        # New format
        salt = encrypted_data[1:17]  # 16 bytes
        
        # Determine nonce size based on algorithm
        if algo_id == ALGO_AES_GCM:
            nonce_size = 12
            nonce_start = 17
        elif algo_id == ALGO_AES_CTR:
            nonce_size = 16
            nonce_start = 17
        elif algo_id == ALGO_CHACHA20:
            nonce_size = 12
            nonce_start = 17
        
        nonce = encrypted_data[nonce_start:nonce_start + nonce_size]
        ciphertext = encrypted_data[nonce_start + nonce_size:]
    else:
        # Legacy format (assume AES-GCM)
        algo_id = ALGO_AES_GCM
        salt = encrypted_data[0:16]
        nonce = encrypted_data[16:28]
        ciphertext = encrypted_data[28:]
    
    # Decrypt based on algorithm
    try:
        if algo_id == ALGO_AES_GCM:
            from crypto.aes_gcm import decrypt_aes_gcm
            plaintext = decrypt_aes_gcm(ciphertext, password, salt, nonce)
            algorithm_name = "AES-GCM-256"
        elif algo_id == ALGO_AES_CTR:
            print("Error: AES-CTR decryption not yet implemented")
            return
        elif algo_id == ALGO_CHACHA20:
            print("Error: ChaCha20-Poly1305 decryption not yet implemented")
            return
        
        # Save decrypted file
        output_filename = selected_file.replace('.enc', '_decrypted')
        output_path = os.path.join(DECRYPTED_DIR, output_filename)
        
        with open(output_path, 'wb') as f:
            f.write(plaintext)
        
        print(f"\nDecryption successful!")
        print(f"Algorithm: {algorithm_name}")
        print(f"Decrypted file saved to: {output_path}")
        
    except Exception as e:
        print(f"Decryption failed! Wrong password or corrupted file.")
        print(f"Error: {e}")


def delete_file():
    """Delete a file from test_files or decrypted directory."""
    print("\n=== DELETE FILE ===")
    
    print("Select folder:")
    print("1. test_files")
    print("2. decrypted")
    
    choice = input("Enter choice: ").strip()
    
    if choice == '1':
        folder = TEST_FILES_DIR
    elif choice == '2':
        folder = DECRYPTED_DIR
    else:
        print("Invalid selection.")
        return
    
    # List files in folder
    if not os.path.exists(folder):
        print(f"No files in {folder}.")
        return
    
    files = [f for f in os.listdir(folder) if os.path.isfile(os.path.join(folder, f))]
    
    if not files:
        print(f"No files in {folder}.")
        return
    
    print(f"\nFiles in {folder}:")
    for i, filename in enumerate(files, 1):
        print(f"{i}. {filename}")
    
    # Select file
    try:
        file_choice = int(input("\nSelect file number to delete: "))
        if file_choice < 1 or file_choice > len(files):
            print("Invalid selection.")
            return
        selected_file = files[file_choice - 1]
    except ValueError:
        print("Invalid input.")
        return
    
    # Confirm deletion
    confirm = input(f"Are you sure you want to delete '{selected_file}'? (yes/no): ").strip().lower()
    
    if confirm == 'yes':
        try:
            os.remove(os.path.join(folder, selected_file))
            print(f"File '{selected_file}' deleted successfully.")
        except Exception as e:
            print(f"Error deleting file: {e}")
    else:
        print("Deletion cancelled.")


def main():
    """Main application entry point."""
    # Ensure required directories exist
    ensure_directories()
    
    while True:
        print("\n" + "=" * 40)
        print("    Encryption Tool")
        print("=" * 40)
        print("1. Encrypt File")
        print("2. Decrypt File")
        print("3. Delete File")
        print("4. Exit")
        
        choice = input("\nEnter choice: ").strip()
        
        if choice == '1':
            encrypt_file()
        elif choice == '2':
            decrypt_file()
        elif choice == '3':
            delete_file()
        elif choice == '4':
            print("Exiting. Goodbye!")
            break
        else:
            print("Invalid selection. Please enter 1, 2, 3, or 4.")


if __name__ == "__main__":
    main()

