// API Configuration
// This file defines the backend API endpoint
// Change this to point to your backend server

export const API_CONFIG = {
  // Local backend used for development or local cloud emulation.
  LOCAL_API_BASE_URL: 'https://localhost:5444',

  // Set this to your deployed backend URL for cloud mode.
  CLOUD_API_BASE_URL: 'https://localhost:5444',
  
  // Alternatively, use environment variables if available
  // import.meta.env.VITE_API_URL || 'http://localhost:5000'
};

export const GOOGLE_OAUTH_CLIENT_ID = '786706856532-cm1qioi5lg30e0o1chva2dotduo8h2f8.apps.googleusercontent.com';
export const GOOGLE_DRIVE_SHARED_FOLDER_ID = '13ajKe-vCHB8Z2ERhS2lPNjWD8uBr5t11';
export const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

export function getApiBaseUrl() {
  const mode = localStorage.getItem('app_mode') === 'cloud' ? 'cloud' : 'local';
  if (mode === 'cloud') {
    return API_CONFIG.CLOUD_API_BASE_URL || API_CONFIG.LOCAL_API_BASE_URL;
  }
  return API_CONFIG.LOCAL_API_BASE_URL;
}

// Export for easier access
export default API_CONFIG;
