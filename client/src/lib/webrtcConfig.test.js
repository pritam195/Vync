import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_STUN_URL, buildIceServers, getRtcConfiguration } from './webrtcConfig.js';

describe('buildIceServers', () => {
  it('uses STUN only when TURN is not configured', () => {
    assert.deepEqual(buildIceServers({}), [{ urls: DEFAULT_STUN_URL }]);
  });

  it('uses STUN and TURN with credentials when configured', () => {
    assert.deepEqual(
      buildIceServers({
        VITE_STUN_URL: 'stun:stun.example.com:19302',
        VITE_TURN_URL: 'turn:turn.example.com:3478',
        VITE_TURN_USERNAME: 'vync',
        VITE_TURN_CREDENTIAL: 'secret',
      }),
      [
        { urls: 'stun:stun.example.com:19302' },
        {
          urls: 'turn:turn.example.com:3478',
          username: 'vync',
          credential: 'secret',
        },
      ],
    );
  });

  it('keeps TURN usable when credentials are missing', () => {
    assert.deepEqual(
      buildIceServers({
        VITE_TURN_URL: 'turn:turn.example.com:3478',
      }),
      [
        { urls: DEFAULT_STUN_URL },
        { urls: 'turn:turn.example.com:3478' },
      ],
    );
  });

  it('supports multiple STUN and TURN server values', () => {
    assert.deepEqual(
      buildIceServers({
        VITE_STUN_URL: 'stun:one.example.com:19302, stun:two.example.com:19302',
        VITE_TURN_URL: 'turn:one.example.com:3478, turns:two.example.com:5349',
        VITE_TURN_USERNAME: 'user',
        VITE_TURN_CREDENTIAL: 'pass',
      }),
      [
        { urls: ['stun:one.example.com:19302', 'stun:two.example.com:19302'] },
        {
          urls: ['turn:one.example.com:3478', 'turns:two.example.com:5349'],
          username: 'user',
          credential: 'pass',
        },
      ],
    );
  });
});

describe('getRtcConfiguration', () => {
  it('returns an RTCPeerConnection configuration object', () => {
    assert.deepEqual(getRtcConfiguration({ VITE_STUN_URL: 'stun:local.test:19302' }), {
      iceServers: [{ urls: 'stun:local.test:19302' }],
    });
  });
});
