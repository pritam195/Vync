const authTokenStorageKey = 'vync_auth_token';

export function getAuthToken() {
  try {
    return localStorage.getItem(authTokenStorageKey) || '';
  } catch {
    return '';
  }
}

export function setAuthToken(token) {
  try {
    if (token) {
      localStorage.setItem(authTokenStorageKey, token);
      return;
    }

    localStorage.removeItem(authTokenStorageKey);
  } catch {
    // Storage can be unavailable in private browsing or embedded contexts.
  }
}

export function clearAuthToken() {
  setAuthToken('');
}
