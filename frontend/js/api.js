// Production Server URLs
const PRIMARY_SERVER = 'https://api.mypatholabs.tech';
const SECONDARY_SERVER = 'https://api2.mypatholabs.tech';
const REQUEST_TIMEOUT_MS = 8000;

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

  _isLocalHost(hostname) {
    if (!hostname) return true;
    return hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('10.') ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname);
  },

  isAllowedServer(url) {
    if (!url || typeof url !== 'string') return false;
    if (url === PRIMARY_SERVER || url === SECONDARY_SERVER) return true;

    const hostname = window.location.hostname;
    if (this._isLocalHost(hostname)) {
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

  getDefaultPrimaryServer() {
    const hostname = window.location.hostname;
    const isLocal = this._isLocalHost(hostname);

    if (window.location.protocol !== 'file:' && !isLocal) {
      return PRIMARY_SERVER;
    }

    const host = hostname || '127.0.0.1';
    return `http://${host}:5000`;
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

    return this.getDefaultPrimaryServer();
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

  // Backward-compatible server resolver
  async resolveServer() {
    return this.getActiveServer();
  },

  // Server health check utility
  async checkServerHealth(serverUrl = null, timeoutMs = 3000) {
    const target = serverUrl || this.getActiveServer();
    if (!this.isAllowedServer(target)) return false;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(`${target}/health`, { signal: controller.signal, credentials: 'omit' });
      clearTimeout(timer);
      if (!res.ok) return false;
      const data = await res.json();
      return !!(data && data.status === 'ok' && data.service === 'mypatholabs-server');
    } catch (_) {
      return false;
    }
  },

  getExp() {
    return localStorage.getItem('lis_exp');
  },

  async _fetchFrom(serverUrl, endpoint, config, timeoutMs = null) {
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const url = `${serverUrl}/api${cleanEndpoint}`;

    const defaultTimeout = (config && config.body instanceof FormData) ? 30000 : REQUEST_TIMEOUT_MS;
    const actualTimeout = timeoutMs || defaultTimeout;

    const controller = new AbortController();
    const timeoutTimer = setTimeout(() => controller.abort(), actualTimeout);

    let onCallerAbort = null;
    if (config.signal) {
      if (config.signal.aborted) {
        clearTimeout(timeoutTimer);
        controller.abort();
      } else {
        onCallerAbort = () => controller.abort();
        config.signal.addEventListener('abort', onCallerAbort, { once: true });
      }
    }

    const fetchConfig = { ...config, signal: controller.signal };

    try {
      const response = await fetch(url, fetchConfig);

      // Server gateway / infrastructure outage indicators (including Cloudflare 52x origin errors)
      if (
        response.status === 502 ||
        response.status === 503 ||
        response.status === 504 ||
        (response.status >= 520 && response.status <= 526)
      ) {
        const err = new Error(`Server temporarily unavailable (${response.status})`);
        err.isServerOutage = true;
        throw err;
      }

      let data;
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else if (response.ok) {
        return response;
      } else {
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

      if (!response.ok && response.status === 401) {
        const path = window.location.pathname;
        const isAuthPage = path.endsWith('index.html') || path.endsWith('/') || path === '';
        if (!isAuthPage) {
          this.clearLocalData();
          return;
        }
      }

      if (!response.ok) {
        throw new Error((data && (data.error || data.message)) || 'API Request Failed');
      }

      return data;
    } catch (err) {
      if (err.name === 'AbortError' && (!config.signal || !config.signal.aborted)) {
        const timeoutErr = new Error('Connection to server timed out');
        timeoutErr.isServerOutage = true;
        throw timeoutErr;
      }
      const msg = (err.message || '').toLowerCase();
      if (
        err.name === 'TypeError' ||
        msg.includes('failed to fetch') ||
        msg.includes('networkerror') ||
        msg.includes('load failed') ||
        msg.includes('network request failed')
      ) {
        err.isServerOutage = true;
      }
      throw err;
    } finally {
      clearTimeout(timeoutTimer);
      if (config.signal && onCallerAbort) {
        config.signal.removeEventListener('abort', onCallerAbort);
      }
    }
  },

  async request(endpoint, method = 'GET', body = null, signal = null) {
    const headers = {};

    const config = {
      method,
      headers,
      credentials: 'include',
      signal
    };

    if (body && !(body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      config.body = JSON.stringify(body);
    } else if (body instanceof FormData) {
      config.body = body;
    }

    const storedServer = this._getStoredServer();
    const primaryTarget = (storedServer && this.isAllowedServer(storedServer))
      ? storedServer
      : this.getDefaultPrimaryServer();

    const backupTarget = (primaryTarget === PRIMARY_SERVER)
      ? SECONDARY_SERVER
      : (primaryTarget === SECONDARY_SERVER ? PRIMARY_SERVER : null);

    try {
      const result = await this._fetchFrom(primaryTarget, endpoint, config);
      if (!this._getStoredServer() || this._activeServer !== primaryTarget) {
        this.setActiveServer(primaryTarget);
      }
      return result;
    } catch (error) {
      if (signal && signal.aborted) {
        throw error;
      }

      const isNetworkFailure = !!error.isServerOutage;

      // Safe failover:
      // Always failover if establishing session (auth routes) OR if idempotent GET
      const isSessionEstablishing = !this._getStoredServer();
      const isIdempotent = method === 'GET';
      const canFailover = isNetworkFailure && backupTarget && (isSessionEstablishing || isIdempotent);

      if (canFailover) {
        console.warn(`[API] Primary server (${primaryTarget}) unreachable. Failing over to ${backupTarget}...`);
        try {
          const backupResult = await this._fetchFrom(backupTarget, endpoint, config);
          this.setActiveServer(backupTarget);
          return backupResult;
        } catch (backupError) {
          if (!backupError.isServerOutage) {
            // Backup server responded with HTTP status (e.g. 401, 400), so it is alive
            this.setActiveServer(backupTarget);
            throw backupError;
          }
          console.error(`[API] Backup server (${backupTarget}) also unreachable:`, backupError.message || backupError);
        }
      }

      if (!isNetworkFailure) {
        // Primary server responded with an HTTP status code (e.g. 401, 400) -> Primary is healthy
        if (!this._getStoredServer() || this._activeServer !== primaryTarget) {
          this.setActiveServer(primaryTarget);
        }
        throw error;
      }

      console.error(`API Error on ${endpoint}:`, error.message || error);
      let friendlyMessage = error.message || 'An unexpected error occurred';
      if (isNetworkFailure) {
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

  async forgotPassword(email) {
    return this.request('/auth/forgot-password', 'POST', { email });
  },

  async verifyEmail(token) {
    return this.request('/auth/verify-email', 'POST', { token });
  },

  async resendVerification(email) {
    return this.request('/auth/resend-verification', 'POST', { email });
  },

  async resetPasswordWithToken(token, newPassword) {
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


