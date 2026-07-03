export const DEFAULT_STUN_URL = 'stun:stun.l.google.com:19302';

function splitServerList(value) {
  return String(value || '')
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean);
}

export function buildIceServers(env = {}) {
  const stunUrls = splitServerList(env.VITE_STUN_URL || DEFAULT_STUN_URL);
  const turnUrls = splitServerList(env.VITE_TURN_URL);
  const iceServers = [];

  if (stunUrls.length) {
    iceServers.push({ urls: stunUrls.length === 1 ? stunUrls[0] : stunUrls });
  }

  if (turnUrls.length) {
    const turnServer = {
      urls: turnUrls.length === 1 ? turnUrls[0] : turnUrls,
    };

    if (env.VITE_TURN_USERNAME) {
      turnServer.username = env.VITE_TURN_USERNAME;
    }

    if (env.VITE_TURN_CREDENTIAL) {
      turnServer.credential = env.VITE_TURN_CREDENTIAL;
    }

    iceServers.push(turnServer);
  }

  return iceServers;
}

export function getRtcConfiguration(env = import.meta.env) {
  return {
    iceServers: buildIceServers(env),
  };
}
