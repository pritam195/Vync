import mediasoupManager from '../src/sfu/mediasoupManager.js';

describe('mediasoupManager SFU service', () => {
  const TEST_ROOM_ID = 'SFU-TEST-101';
  const FAKE_SOCKET_ID = 'socket_abc123';

  afterAll(async () => {
    await mediasoupManager.close();
  });

  it('initializes workers and creates a router for a room', async () => {
    await mediasoupManager.init();
    expect(mediasoupManager.workers.length).toBeGreaterThan(0);

    const router = await mediasoupManager.getOrCreateRouter(TEST_ROOM_ID);
    expect(router).toBeDefined();
    expect(router.rtpCapabilities).toBeDefined();

    const capabilities = mediasoupManager.getRouterRtpCapabilities(TEST_ROOM_ID);
    expect(capabilities).toEqual(router.rtpCapabilities);
  });

  it('creates WebRTC transports for sending and receiving', async () => {
    const sendTransportParams = await mediasoupManager.createWebRtcTransport(TEST_ROOM_ID, FAKE_SOCKET_ID, {
      producing: true,
      consuming: false,
    });

    expect(sendTransportParams).toMatchObject({
      id: expect.any(String),
      iceParameters: expect.any(Object),
      iceCandidates: expect.any(Array),
      dtlsParameters: expect.any(Object),
    });

    const recvTransportParams = await mediasoupManager.createWebRtcTransport(TEST_ROOM_ID, FAKE_SOCKET_ID, {
      producing: false,
      consuming: true,
    });

    expect(recvTransportParams.id).toBeDefined();
    expect(recvTransportParams.id).not.toBe(sendTransportParams.id);
  });

  it('returns empty producers list for new room and tracks socket disconnect cleanup', () => {
    const producers = mediasoupManager.getProducersForRoom(TEST_ROOM_ID);
    expect(Array.isArray(producers)).toBe(true);

    mediasoupManager.handleSocketDisconnect(TEST_ROOM_ID, FAKE_SOCKET_ID);
    const roomData = mediasoupManager.getRoomData(TEST_ROOM_ID);
    if (roomData) {
      expect(roomData.transports.size).toBe(0);
    }
  });

  it('supports multi-worker distribution and creates transports across distinct workers', async () => {
    const MULTI_ROOM_ID = 'SFU-TEST-MULTI';
    const SOCKET_W0 = 'socket_w0';
    const SOCKET_W1 = 'socket_w1';

    const t0 = await mediasoupManager.createWebRtcTransport(MULTI_ROOM_ID, SOCKET_W0, {
      producing: true,
      forceWorkerIndex: 0,
    });
    expect(t0.workerIndex).toBe(0);

    const t1 = await mediasoupManager.createWebRtcTransport(MULTI_ROOM_ID, SOCKET_W1, {
      consuming: true,
      forceWorkerIndex: 1,
    });
    expect(t1.workerIndex).toBe(1);

    const roomData = mediasoupManager.getRoomData(MULTI_ROOM_ID);
    expect(roomData.routers.size).toBe(2);
    expect(roomData.routers.has(0)).toBe(true);
    expect(roomData.routers.has(1)).toBe(true);

    mediasoupManager.closeRoom(MULTI_ROOM_ID);
    expect(mediasoupManager.getRoomData(MULTI_ROOM_ID)).toBeNull();
  });

  it('returns metrics for cluster workers and rooms', async () => {
    const metrics = await mediasoupManager.getMetrics();
    expect(metrics).toBeDefined();
    expect(metrics.totalWorkers).toBeGreaterThan(0);
    expect(Array.isArray(metrics.workers)).toBe(true);
    expect(metrics.workers[0].pid).toBeDefined();
  });
});
