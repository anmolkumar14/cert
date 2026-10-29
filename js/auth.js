/**
 * ============================================================================
 * Certificate Generator Portal - Authentication & Session Guard (auth.js)
 * ============================================================================
 * Handles:
 * - Admin credentials verification via Google Apps Script Web App
 * - Session token persistence (sessionStorage / localStorage for "Remember Me")
 * - Route guarding: protects dashboard.html and redirects unauthenticated users
 * - Instant Demo mode support when backend URL is not yet configured
 */

const Auth = (function() {
  /**
   * Retrieve active session token from storage
   */
  function getToken() {
    return sessionStorage.getItem(CONFIG.STORAGE_KEYS.token) ||
           localStorage.getItem(CONFIG.STORAGE_KEYS.token);
  }

  /**
   * Retrieve active session user metadata
   */
  function getUser() {
    const raw = sessionStorage.getItem(CONFIG.STORAGE_KEYS.user) ||
                localStorage.getItem(CONFIG.STORAGE_KEYS.user);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  /**
   * Check if active session exists and is not expired
   */
  function isAuthenticated() {
    const token = getToken();
    const user = getUser();
    if (!token || !user) return false;

    if (user.expiresAt && Date.now() > user.expiresAt) {
      logout();
      return false;
    }

    return true;
  }

  /**
   * Save session upon successful authentication
   */
  function saveSession(token, user, rememberMe) {
    const storage = rememberMe ? localStorage : sessionStorage;
    storage.setItem(CONFIG.STORAGE_KEYS.token, token);
    storage.setItem(CONFIG.STORAGE_KEYS.user, JSON.stringify(user));
    
    if (rememberMe) {
      localStorage.setItem(CONFIG.STORAGE_KEYS.rememberMe, "true");
    } else {
      localStorage.removeItem(CONFIG.STORAGE_KEYS.rememberMe);
    }
  }

  /**
   * Login method
   * Dispatches payload to Google Apps Script backend with Content-Type: text/plain
   * to avoid CORS preflight issues.
   */
  async function login(username, password, rememberMe = false) {
    const trimmedUser = (username || "").trim();
    const rawPass = password || "";

    if (!trimmedUser || !rawPass) {
      throw new Error("Please enter both username and password.");
    }

    // Check if backend Apps Script URL is set
    const apiUrl = CONFIG.APPS_SCRIPT_URL ? CONFIG.APPS_SCRIPT_URL.trim() : "";

    // If no backend configured, provide built-in demo credentials for immediate exploration
    if (!apiUrl) {
      console.warn("⚠️ No backend URL configured in CONFIG.APPS_SCRIPT_URL. Entering demo authorization mode.");
      
      // Default demo credentials
      if ((trimmedUser.toLowerCase() === "admin" && rawPass === "admin123") || 
          (trimmedUser.toLowerCase() === "demo" && rawPass === "demo123")) {
        const dummyToken = "demo-session-token-" + Date.now();
        const dummyUser = {
          username: trimmedUser,
          isDemo: true,
          expiresAt: Date.now() + (24 * 60 * 60 * 1000)
        };
        saveSession(dummyToken, dummyUser, rememberMe);
        return { success: true, isDemo: true, user: dummyUser };
      } else {
        throw new Error("Demo mode active: Use username 'admin' and password 'admin123' (or configure Apps Script in js/config.js).");
      }
    }

    // Call Google Apps Script backend
    try {
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=utf-8"
        },
        body: JSON.stringify({
          action: "login",
          username: trimmedUser,
          password: rawPass
        })
      });

      if (!response.ok) {
        throw new Error(`Server returned HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Authentication failed. Invalid username or password.");
      }

      const sessionUser = {
        username: data.user ? data.user.username : trimmedUser,
        expiresAt: data.expiresAt || (Date.now() + (24 * 60 * 60 * 1000)),
        isDemo: false,
        remainingQuota: data.remainingQuota
      };

      saveSession(data.token, sessionUser, rememberMe);
      return { success: true, user: sessionUser };
    } catch (err) {
      console.error("Login request failed:", err);
      // Helpful diagnosis for CORS or invalid URLs
      if (err.message.includes("Failed to fetch") || err.name === "TypeError") {
        throw new Error("Unable to connect to Google Apps Script. Ensure the script is deployed as a Web App with access set to 'Anyone'.");
      }
      throw err;
    }
  }

  /**
   * Log out current user and clear stored tokens
   */
  function logout() {
    sessionStorage.removeItem(CONFIG.STORAGE_KEYS.token);
    sessionStorage.removeItem(CONFIG.STORAGE_KEYS.user);
    localStorage.removeItem(CONFIG.STORAGE_KEYS.token);
    localStorage.removeItem(CONFIG.STORAGE_KEYS.user);
    localStorage.removeItem(CONFIG.STORAGE_KEYS.rememberMe);

    window.location.href = "index.html";
  }

  /**
   * Route Guard: Call on page load
   */
  function guardRoute(pageType) {
    const authenticated = isAuthenticated();

    if (pageType === "login") {
      // If already logged in, redirect to dashboard
      if (authenticated) {
        window.location.href = "dashboard.html";
      }
    } else if (pageType === "dashboard") {
      // If not logged in, redirect to login
      if (!authenticated) {
        window.location.href = "index.html";
      } else {
        // Populate profile info in navbar
        const user = getUser();
        const userNameEl = document.getElementById("navUserName");
        const userAvatarEl = document.getElementById("navUserAvatar");
        if (userNameEl && user) {
          userNameEl.textContent = user.username || "Admin";
        }
        if (userAvatarEl && user) {
          userAvatarEl.textContent = (user.username || "A").substring(0, 1).toUpperCase();
        }

        // Attach logout event
        const logoutBtn = document.getElementById("logoutBtn");
        if (logoutBtn) {
          logoutBtn.addEventListener("click", (e) => {
            e.preventDefault();
            logout();
          });
        }
      }
    }
  }

  return {
    getToken,
    getUser,
    isAuthenticated,
    login,
    logout,
    guardRoute
  };
})();

if (typeof window !== "undefined") { window.Auth = Auth; }
