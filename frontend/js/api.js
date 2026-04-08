// Auto-detect API base URL: use same origin in production, localhost in development
const BASE_URL = (() => {
  const hostname = window.location.hostname;
  
  // Production URL mapping
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
  return `http://${hostname}:5000/api`;
})();

const api = {
  getToken() {
    return localStorage.getItem('lis_token');
  },

  async request(endpoint, method = 'GET', body = null, signal = null) {
    const headers = {};
    
    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const config = {
      method,
      headers,
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
        data = { success: false, error: `Request failed with status ${response.status}` };
      }
      
      // If unauthorized, redirect to login unless already on index
      if (!response.ok && response.status === 401) {
        if (!window.location.pathname.endsWith('index.html') && !window.location.pathname.endsWith('/')) {
          localStorage.removeItem('lis_token');
          localStorage.removeItem('lis_user');
          window.location.href = 'index.html';
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
       throw error;
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
  }
};
