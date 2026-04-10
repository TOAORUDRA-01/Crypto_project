// API Configuration
// This file defines the backend API endpoint
// Change this to point to your backend server

export const API_CONFIG = {
  // Local backend used for development or local cloud emulation.
  LOCAL_API_BASE_URL: 'http://localhost:8000', // Testing HTTP first

  // Set this to your deployed backend URL for cloud mode.
  CLOUD_API_BASE_URL: 'http://localhost:8000', // Testing HTTP first
  
  // Alternatively, use environment variables if available
  // import.meta.env.VITE_API_URL || 'http://localhost:5000'
};

export function getApiBaseUrl() {
  const mode = localStorage.getItem('app_mode') === 'cloud' ? 'cloud' : 'local';
  if (mode === 'cloud') {
    return API_CONFIG.CLOUD_API_BASE_URL || API_CONFIG.LOCAL_API_BASE_URL;
  }
  return API_CONFIG.LOCAL_API_BASE_URL;
}

// Export for easier access
export default API_CONFIG;
