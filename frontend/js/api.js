// Auto-detect API base URL: use same origin in production, localhost in development
const BASE_URL = (() => {
  const hostname = window.location.hostname;
  
  // Production URL mapping
  if (hostname === 'www.mypatholabs.tech' || hostname === 'mypatholabs.tech') {
    return 'https://api.mypatholabs.tech/api';
  }

  if (hostname === 'laboratory-management-six.vercel.app') {
    return 'https://mylaboratory.onrender.com/api';
  }

  const isLocal = hostname === 'localhost' || 
                  hostname === '127.0.0.1' || 
                  hostname.startsWith('192.168.') || 
                  hostname.startsWith('10.') || 
                  hostname.startsWith('172.');

  if (window.location.protocol !== 'file:' && !isLocal) {
    return `${window.location.origin}/api`;
  }
  const host = hostname || '127.0.0.1';
  return `http://${host}:5000/api`;
})();

const API_URL = BASE_URL; // Global alias for scripts using old naming convention

// Socket.IO server URL — explicitly maps each environment to the correct origin
const SOCKET_URL = (() => {
  const hostname = window.location.hostname;

  // Production: backend is on api.mypatholabs.tech
  if (hostname === 'www.mypatholabs.tech' || hostname === 'mypatholabs.tech') {
    return 'https://api.mypatholabs.tech';
  }

  // Staging / Vercel preview → Render backend
  if (hostname === 'laboratory-management-six.vercel.app') {
    return 'https://mylaboratory.onrender.com';
  }

  // Local development
  const isLocal = hostname === 'localhost' ||
                  hostname === '127.0.0.1' ||
                  hostname.startsWith('192.168.') ||
                  hostname.startsWith('10.') ||
                  hostname.startsWith('172.');

  if (isLocal || window.location.protocol === 'file:') {
    const host = hostname || '127.0.0.1';
    return `http://${host}:5000`;
  }

  // Generic fallback — same origin (works when backend serves frontend)
  return window.location.origin;
})();

/**
 * SECURITY: XSS Mitigation Utility
 * All user-generated content (e.g., patient names, lab notes, report fields)
 * MUST be sanitized before being injected into the DOM via innerHTML.
 * This prevents malicious scripts from reading `localStorage.getItem('lis_token')`.
 */
const sanitizeHTML = (str) => {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

const api = {
  getExp() {
    return localStorage.getItem('lis_exp');
  },

  async request(endpoint, method = 'GET', body = null, signal = null) {
    const headers = {};
    
    // Authorization header is removed because the token is now sent via HttpOnly cookie

    const config = {
      method,
      headers,
      credentials: 'include',
      signal // Support for AbortController cancellation
    };

    if (body && !(body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      config.body = JSON.stringify(body);
    } else if (body instanceof FormData) {
      // Let browser set Content-Type with boundary for FormData
      config.body = body;
    }

    try {
      const response = await fetch(`${BASE_URL}${endpoint}`, config);
      
      // Handle non-JSON responses (e.g., PDF blobs, network errors)
      let data;
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else if (response.ok) {
        // Non-JSON successful response (e.g., PDF) — return raw response
        return response;
      } else {
        // Non-JSON error response
        if (response.status === 429) {
          data = { success: false, error: 'Too many requests. Please try again later.' };
        } else if (response.status >= 500) {
          data = { success: false, error: 'Server encountered an error. Please try again later.' };
        } else if (response.status === 403) {
          data = { success: false, error: 'Access denied. You do not have permission for this action.' };
        } else {
          data = { success: false, error: `Request failed with status ${response.status}` };
        }
      }
      
      // If unauthorized, redirect to login unless already on index
      if (!response.ok && response.status === 401) {
        if (!window.location.pathname.endsWith('index.html') && !window.location.pathname.endsWith('/')) {
          this.clearLocalData();
          return;
        }
      }

      if (!response.ok) {
        throw new Error((data && data.error) || 'API Request Failed');
      }
      
      return data;
    } catch (error) {
       // Don't log token in errors
       console.error(`API Error on ${endpoint}:`, error.message || error);
       
       let friendlyMessage = error.message || 'An unexpected error occurred';
       if (friendlyMessage === 'Failed to fetch' || friendlyMessage.includes('NetworkError')) {
           friendlyMessage = 'Network Error: Cannot connect to server. Please check your internet connection.';
       }
       
       throw new Error(friendlyMessage);
    }
  },

  // Auth Helpers
  async login(email, password) {
    return this.request('/auth/login', 'POST', { email, password });
  },

  async register(data) {
    return this.request('/auth/register', 'POST', data);
  },

  async getMe() {
    return this.request('/auth/me');
  },

  async updateProfile(data) {
    return this.request('/auth/profile', 'PUT', data);
  },

  clearLocalData() {
    localStorage.removeItem('lis_token'); // Kept for backwards compatibility cleanup
    localStorage.removeItem('lis_exp');
    localStorage.removeItem('lis_user');
    window.location.href = 'index.html';
  },

  async logout() {
    try {
      await this.request('/auth/logout', 'POST');
    } catch (err) {
      console.warn('Logout request failed', err);
    }
    this.clearLocalData();
  }
};
