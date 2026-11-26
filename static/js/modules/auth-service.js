/**
 * AutoLabel Studio - AuthService Module
 * =================================
 * Auth headers, global fetch interceptor, token refresh, heartbeat, session expired handler.
 *
 * DatasetEditor.prototype uzerine guvenli ES6 sinif genisletme kalibiyla enjekte edilir.
 */

(function installAuthService(DatasetEditor) {
  if (!DatasetEditor || !DatasetEditor.prototype) {
    console.error('[AuthService] DatasetEditor henuz yuklenmedi!');
    return;
  }

  class _AuthServiceExtension {
  getAuthHeaders(customHeaders = {}) {
    const token = localStorage.getItem('yolo_auth_token') || localStorage.getItem('authToken') || sessionStorage.getItem('authToken') || '';
    const headers = { ...customHeaders };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  setupGlobalFetchInterceptor() {
    if (window._fetchInterceptorInstalled) return;
    window._fetchInterceptorInstalled = true;

    const originalFetch = window.fetch;
    const self = this;

    // Online / Offline Global Listeners
    window.addEventListener('offline', () => {
      self.showToast('İnternet bağlantınız koptu. Çevrimdışı moddasınız.', 'warning');
    });
    window.addEventListener('online', () => {
      self.showToast('İnternet bağlantısı yeniden sağlandı. ✓', 'success');
    });

    window.fetch = async function(...args) {
      if (typeof args[0] === 'string' && args[0].startsWith('/api/') && typeof window.apiUrl === 'function') {
        args[0] = window.apiUrl(args[0]);
      }
      if (!navigator.onLine && typeof args[0] === 'string' && !args[0].includes('/api/auth/me')) {
        self.showToast('Ağ bağlantısı yok. Lütfen internetinizi kontrol edin.', 'warning');
      }
      const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');
      const isAuthEndpoint = url.includes('/api/auth/login') || url.includes('/api/auth/register') || url.includes('/api/auth/forgot-password') || url.includes('/api/auth/refresh');
      const reqMethod = (args[1]?.method || 'GET').toUpperCase();
      const isIdempotent = reqMethod === 'GET' || reqMethod === 'HEAD';

      // 1. Timeout Policy: Default 20s for standard requests, 60s for model inference/batch exports
      let initOptions = args[1] ? { ...args[1] } : {};
      const timeoutMs = url.includes('/api/ai/') || url.includes('/export-') ? 60000 : 20000;
      if (!initOptions.signal && typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
        initOptions.signal = AbortSignal.timeout(timeoutMs);
      }

      // 2. Resilient Execution with Exponential Backoff Retry for GET/Idempotent requests
      let lastErr = null;
      const maxRetries = isIdempotent && !initOptions._isRetry ? 2 : 0;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          let response = await originalFetch.apply(this, [args[0], initOptions]);
          
          if (response.status === 401) {
            if (self._isAppReady && !isAuthEndpoint && !initOptions._isRetry) {
              const curToken = localStorage.getItem('yolo_auth_token') || localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
              if (curToken) {
                try {
                  const refreshRes = await originalFetch('/api/auth/refresh', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${curToken}` }
                  });
                  if (refreshRes.ok) {
                    const refreshData = await refreshRes.json();
                    if (refreshData.token) {
                      localStorage.setItem('yolo_auth_token', refreshData.token);
                      localStorage.setItem('authToken', refreshData.token);
                      sessionStorage.setItem('authToken', refreshData.token);
                      if (refreshData.user) self.currentUser = refreshData.user;
                      
                      const retryOpts = { ...initOptions };
                      retryOpts.headers = { ...(retryOpts.headers || {}), 'Authorization': `Bearer ${refreshData.token}` };
                      retryOpts._isRetry = true;
                      response = await originalFetch(args[0], retryOpts);
                      return response;
                    }
                  } else if (refreshRes.status === 401) {
                    console.warn('[Session Expired]: /api/auth/refresh oturum kapandı:', url);
                    self.handleSessionExpired();
                  }
                } catch (_) { }
              }
            }
          }

          // If server returned 502/503/504 on idempotent request, attempt exponential backoff
          if ([502, 503, 504].includes(response.status) && attempt < maxRetries) {
            await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
            continue;
          }

          return response;
        } catch (err) {
          lastErr = err;
          if (attempt < maxRetries && navigator.onLine) {
            await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
            continue;
          }
          if (!navigator.onLine) {
            self.showToast('Sunucuya erişilemiyor (Ağ bağlantısı yok).', 'error');
          }
          throw err;
        }
      }
      throw lastErr;
    };
  }

  handleSessionExpired() {
    if (this._isHandlingSessionExpired) return;
    this._isHandlingSessionExpired = true;

    this.clearUserState();
    this.showToast('Oturum süreniz doldu. Lütfen tekrar giriş yapın.', 'warning');
    this.showAuth('login', true);

    setTimeout(() => {
      this._isHandlingSessionExpired = false;
    }, 2000);
  }

  setupAuthHeartbeat() {
    if (this._heartbeatTimer) clearInterval(this._heartbeatTimer);
    // Kullanıcı aktif çalıştığı sürece sliding session'ı canlı tutmak için her 10 dakikada bir refresh at
    this._heartbeatTimer = setInterval(async () => {
      const token = localStorage.getItem('yolo_auth_token') || localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
      if (token && document.visibilityState === 'visible') {
        try {
          const res = await fetch('/api/auth/refresh', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (res.ok) {
            const data = await res.json();
            if (data.token) {
              localStorage.setItem('yolo_auth_token', data.token);
              localStorage.setItem('authToken', data.token);
            }
            if (data.user) this.currentUser = data.user;
          }
        } catch (_) { }
      }
    }, 10 * 60 * 1000);
  }

  }

  // Metotlari ve getter/setter'lari DatasetEditor.prototype'a kopyala
  const proto = _AuthServiceExtension.prototype;
  const descriptors = Object.getOwnPropertyDescriptors(proto);
  for (const name of Object.keys(descriptors)) {
    if (name !== 'constructor') {
      Object.defineProperty(DatasetEditor.prototype, name, descriptors[name]);
    }
  }
})(window.DatasetEditor);
