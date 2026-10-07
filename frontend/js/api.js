// Production Server URLs
const PRIMARY_SERVER = 'https://api.mypatholabs.tech';
const SECONDARY_SERVER = 'https://api2.mypatholabs.tech';
const HEALTH_TIMEOUT_MS = 3500;

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
  _activeServer: null,
  _resolvingPromise: null,

  isAllowedServer(url) {
    if (!url || typeof url !== 'string') return false;
    if (url === PRIMARY_SERVER || url === SECONDARY_SERVER) return true;

    const hostname = window.location.hostname;
    const isLocal = hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('10.') ||
      hostname.startsWith('172.');

    if (isLocal) {
      const host = hostname || '127.0.0.1';
      return url === `http://${host}:5000` || url === 'http://localhost:5000' || url === 'http://127.0.0.1:5000';
    }

    return false;
  },

  _getStoredServer() {
    try {
      return sessionStorage.getItem('lis_active_server') || localStorage.getItem('lis_active_server');
    } catch (_) {
      return null;
    }
  },

  _setStoredServer(url) {
    try { sessionStorage.setItem('lis_active_server', url); } catch (_) {}
    try { localStorage.setItem('lis_active_server', url); } catch (_) {}
  },

  _clearStoredServer() {
    try { sessionStorage.removeItem('lis_active_server'); } catch (_) {}
    try { localStorage.removeItem('lis_active_server'); } catch (_) {}
  },

  getActiveServer() {
    if (this._activeServer && this.isAllowedServer(this._activeServer)) {
      return this._activeServer;
    }

    const storedServer = this._getStoredServer();
    if (storedServer && this.isAllowedServer(storedServer)) {
      this._activeServer = storedServer;
      return storedServer;
    }

    if (storedServer) {
      this.resetActiveServer();
    }

    const hostname = window.location.hostname;
    const isLocal = hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('10.') ||
      hostname.startsWith('172.');

    if (window.location.protocol !== 'file:' && !isLocal) {
      return PRIMARY_SERVER;
    }

    const host = hostname || '127.0.0.1';
    return `http://${host}:5000`;
  },

  setActiveServer(url) {
    if (!url || !this.isAllowedServer(url)) {
      this.resetActiveServer();
      return;
    }
    this._activeServer = url;
    this._setStoredServer(url);
  },

  resetActiveServer() {
    this._activeServer = null;
    this._clearStoredServer();
  },

  getBaseUrl() {
    return `${this.getActiveServer()}/api`;
  },

  getSocketUrl() {
    return this.getActiveServer();
  },

  async checkServerHealth(serverUrl, timeoutMs = HEALTH_TIMEOUT_MS) {
    if (!this.isAllowedServer(serverUrl)) return false;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${serverUrl}/health`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        cache: 'no-store',
        credentials: 'omit',
        signal: controller.signal
      });

      if (!response.ok) return false;
      const data = await response.json();
      return Boolean(data && data.status === 'ok' && data.service === 'mypatholabs-server');
    } catch (_) {
      return false;
    } finally {
      clearTimeout(timer);
    }
  },

  async resolveServer() {
    if (this._resolvingPromise) {
      return this._resolvingPromise;
    }

    this._resolvingPromise = (async () => {
      try {
        const hostname = window.location.hostname;
        const isLocal = hostname === 'localhost' ||
          hostname === '127.0.0.1' ||
          hostname.startsWith('192.168.') ||
          hostname.startsWith('10.') ||
          hostname.startsWith('172.');

        // In local development, check local server first
        if (isLocal) {
          const host = hostname || '127.0.0.1';
          const localUrl = `http://${host}:5000`;
          const isLocalOk = await this.checkServerHealth(localUrl, 1500);
          if (isLocalOk) {
            this.setActiveServer(localUrl);
            return localUrl;
          }
        }

        // Step 1: Health check Primary Server 1 (api.mypatholabs.tech)
        const server1Healthy = await this.checkServerHealth(PRIMARY_SERVER);
        if (server1Healthy) {
          this.setActiveServer(PRIMARY_SERVER);
          return PRIMARY_SERVER;
        }

        // Step 2: Server 1 not responding / unhealthy -> Health check Server 2 (api2.mypatholabs.tech)
        const server2Healthy = await this.checkServerHealth(SECONDARY_SERVER);
        if (server2Healthy) {
          this.setActiveServer(SECONDARY_SERVER);
          return SECONDARY_SERVER;
        }

        // Both servers unavailable
        throw new Error('Unable to connect to service. All servers are currently unavailable. Please try again shortly.');
      } finally {
        this._resolvingPromise = null;
      }
    })();

    return this._resolvingPromise;
  },

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
      const response = await fetch(`${this.getBaseUrl()}${endpoint}`, config);

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

      // If unauthorized, redirect to login unless already on index/login page
      if (!response.ok && response.status === 401) {
        const path = window.location.pathname;
        const isAuthPage = path.endsWith('index.html') || path.endsWith('/') || path === '';
        if (!isAuthPage) {
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
    await this.resolveServer();
    return this.request('/auth/login', 'POST', { email, password });
  },

  async register(data) {
    await this.resolveServer();
    return this.request('/auth/register', 'POST', data);
  },

  async forgotPassword(email) {
    await this.resolveServer();
    return this.request('/auth/forgot-password', 'POST', { email });
  },

  async verifyEmail(token) {
    await this.resolveServer();
    return this.request('/auth/verify-email', 'POST', { token });
  },

  async resendVerification(email) {
    await this.resolveServer();
    return this.request('/auth/resend-verification', 'POST', { email });
  },

  async resetPasswordWithToken(token, newPassword) {
    await this.resolveServer();
    return this.request('/auth/reset-password-with-token', 'POST', { token, newPassword });
  },

  async getMe() {
    return this.request('/auth/me');
  },

  async updateProfile(data) {
    return this.request('/auth/profile', 'PUT', data);
  },

  // MFA Helpers
  async mfaSetup() {
    return this.request('/mfa/setup', 'POST');
  },

  async mfaVerifySetup(code) {
    return this.request('/mfa/verify-setup', 'POST', { code });
  },

  async mfaVerifyLogin(mfaToken, code, isBackup = false) {
    return this.request('/mfa/verify-login', 'POST', { mfaToken, code, isBackup });
  },

  async mfaDisable(password, code) {
    return this.request('/mfa/disable', 'POST', { password, code });
  },

  clearLocalData() {
    localStorage.removeItem('lis_token'); // Kept for backwards compatibility cleanup
    localStorage.removeItem('lis_exp');
    localStorage.removeItem('lis_user');
    this.resetActiveServer();
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

// Global aliases for backward compatibility across all existing scripts
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'BASE_URL', {
    get() { return api.getBaseUrl(); },
    configurable: true
  });
  Object.defineProperty(window, 'API_URL', {
    get() { return api.getBaseUrl(); },
    configurable: true
  });
  Object.defineProperty(window, 'SOCKET_URL', {
    get() { return api.getSocketUrl(); },
    configurable: true
  });
}


