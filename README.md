# Encryptix

Encryptix is a file encryption web app with local encryption/decryption and optional cloud workflows. It supports AES-256-GCM, AES-128-CTR, and ChaCha20-Poly1305, plus folder encryption via ZIP.

## Features
- Local mode: encrypt/decrypt files on-device without uploading.
- Cloud mode: login, upload encrypted files, manage history, optional Google Drive sharing.
- Algorithms: AES-256-GCM, AES-128-CTR, ChaCha20-Poly1305.
- Folder encryption: folders are zipped client-side before encryption.

## Project Layout
- online/frontend: Browser UI (HTML/CSS/JS)
- online/backend: FastAPI backend (auth, file storage, history)
- crypto: crypto helpers for backend and shared logic
- local/app: optional local app script

## Prerequisites
- Python 3.10+ (recommended)
- Windows, macOS, or Linux

## Installation
1. Create and activate a virtual environment.
   - Windows:
     ```
     python -m venv .venv
     .venv\Scripts\activate
     ```
   - macOS/Linux:
     ```
     python -m venv .venv
     source .venv/bin/activate
     ```
2. Install dependencies.
   ```
   pip install -r requirements.txt
   ```

## Run Backend (FastAPI)
From the project root:
```
python -m uvicorn online.backend.app:app --host 127.0.0.1 --port 8000
```

## Run Frontend (HTTP)
Serve the frontend folder with any static server. If you already use VS Code Live Preview, that is fine.

If you want a quick Python server:
```
python -m http.server 3002 --directory online/frontend
```
Then open:
```
http://127.0.0.1:3002/index.html
```

## Run Frontend (HTTPS)
If you need HTTPS locally (for Google OAuth popups):
```
python server_frontend_https.py
```
This uses:
- online/backend/cert.pem
- online/backend/key.pem

Then open:
```
https://localhost:8000
```

## Configure API Base URL
Edit [online/frontend/config.js](online/frontend/config.js) to point to your backend:
- Local backend: `http://127.0.0.1:8000`
- Deployed backend: your public URL

## Workflow
1. Start the backend server.
2. Start the frontend server.
3. Open the UI and choose a mode:
   - Local: encrypt/decrypt without uploads.
   - Cloud: login to upload and manage files.
4. Choose a file or folder, set a password, select an algorithm, and encrypt.
5. (Cloud mode) Upload to Drive or send share link via email.
6. Decrypt using the same password.

## Google Drive Notes
- OAuth popups can be blocked by the browser. Allow popups for localhost.
- Drive integration uses the Google OAuth client ID in [online/frontend/config.js](online/frontend/config.js).

## Common Issues
- Buttons not responsive after updates: clear browser cache or use a cache-busting query.
- OAuth popup blocked: allow popups for localhost.
- API calls failing: check the backend URL in config.js.

## Development Tips
- Cache busting is enabled via query strings on script imports during development.
- Prefer running both backend and frontend locally during changes.

## Security Notes
- Keep passwords secure. Encryptix never stores plaintext passwords.
- Local mode keeps data on your machine only.

## License
Specify your license here (MIT, Apache-2.0, etc.).
