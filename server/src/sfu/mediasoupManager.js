import mediasoup from 'mediasoup';
import config from './mediasoupConfig.js';
import { normalizeMeetingId as normalizeRoomId } from '../utils/normalizeMeetingId.js';

class MediasoupManager {
  constructor() {
    this.workers = [];
    this.nextWorkerIdx = 0;
    this.rooms = new Map(); // roomId -> roomData
    this.isInitialized = false;
  }

  async init() {
    if (this.isInitialized) {
      return;
    }

    const { numWorkers } = config;
    this.workers = [];

    for (let i = 0; i < numWorkers; i++) {
      const worker = await this._spawnWorker(i);
      this.workers.push(worker);
    }

    this.isInitialized = true;
    console.log(`[mediasoup] Initialized ${this.workers.length} worker(s)`);

    if (process.env.MEDIASOUP_STATS_LOG === 'true') {
      const intervalMs = parseInt(process.env.MEDIASOUP_STATS_INTERVAL_MS, 10) || 10000;
      this.startStatsLogging(intervalMs);
      console.log(`[mediasoup] Periodic stats logging enabled every ${intervalMs}ms`);
    }
  }

  async _spawnWorker(index) {
    const { workerSettings } = config;
    const worker = await mediasoup.createWorker(workerSettings);

    worker.on('died', async (error) => {
      console.error(`[mediasoup] Worker #${index} (pid: ${worker.pid}) died:`, error);
      const idx = this.workers.indexOf(worker);
      if (idx !== -1) {
        try {
          const replacement = await this._spawnWorker(idx);
          this.workers[idx] = replacement;
          console.log(`[mediasoup] Replaced dead worker #${idx} with new worker (pid: ${replacement.pid})`);
        } catch (e) {
          console.error('[mediasoup] Failed to recreate worker:', e);
          if (process.env.NODE_ENV === 'production') {
            setTimeout(() => process.exit(1), 2000);
          }
        }
      }
    });

    return worker;
  }

  getNextWorker() {
    if (!this.workers.length) {
      throw new Error('[mediasoup] No workers available');
    }

    for (let attempt = 0; attempt < this.workers.length; attempt++) {
      const workerIdx = this.nextWorkerIdx;
      const worker = this.workers[workerIdx];
      this.nextWorkerIdx = (this.nextWorkerIdx + 1) % this.workers.length;
      if (worker && !worker.closed) {
        return { worker, workerIdx };
      }
    }

    throw new Error('[mediasoup] No active (non-closed) workers available');
  }

  async getOrCreateRouter(roomId) {
    const normalized = normalizeRoomId(roomId);
    if (!normalized) {
      throw new Error('Invalid roomId');
    }

    if (!this.isInitialized) {
      await this.init();
    }

    let roomData = this.rooms.get(normalized);

    if (roomData && roomData.router && !roomData.router.closed) {
      return roomData.router;
    }

    const { worker, workerIdx } = this.getNextWorker();
    const router = await worker.createRouter({ mediaCodecs: config.router.mediaCodecs });
    console.log(`[mediasoup] Room ${normalized} router created on Worker #${workerIdx} (pid: ${worker.pid})`);

    const routers = new Map();
    routers.set(workerIdx, router);
    const routerWorkers = new Map();
    routerWorkers.set(router, workerIdx);

    roomData = {
      defaultWorkerIdx: workerIdx,
      router, // Primary router for backwards-compatibility
      routers, // workerIdx -> router
      routerWorkers, // router -> workerIdx
      socketWorkers: new Map(), // socketId -> workerIdx
      transports: new Map(), // transportId -> transport
      transportRouters: new Map(), // transportId -> router
      transportWorkers: new Map(), // transportId -> workerIdx
      producers: new Map(), // producerId -> producer
      producerRouters: new Map(), // producerId -> router
      producerWorkers: new Map(), // producerId -> workerIdx
      consumers: new Map(), // consumerId -> consumer
      pipeProducers: new Map(), // `${producerId}:${targetWorkerIdx}` -> { pipeConsumer, pipeProducer }
      socketTransports: new Map(), // socketId -> Set of transport IDs
      socketProducers: new Map(),  // socketId -> Set of producer IDs
      socketConsumers: new Map(),  // socketId -> Set of consumer IDs
    };

    this.rooms.set(normalized, roomData);
    return router;
  }

  async getOrCreateRouterOnWorker(roomId, workerIdx) {
    const normalized = normalizeRoomId(roomId);
    let roomData = this.rooms.get(normalized);
    if (!roomData) {
      await this.getOrCreateRouter(normalized);
      roomData = this.rooms.get(normalized);
    }

    let router = roomData.routers.get(workerIdx);
    if (router && !router.closed) {
      return router;
    }

    const worker = this.workers[workerIdx];
    if (!worker || worker.closed) {
      throw new Error(`[mediasoup] Worker #${workerIdx} is unavailable`);
    }

    router = await worker.createRouter({ mediaCodecs: config.router.mediaCodecs });
    roomData.routers.set(workerIdx, router);
    roomData.routerWorkers.set(router, workerIdx);
    console.log(`[mediasoup] Room ${normalized} router created on Worker #${workerIdx} (pid: ${worker.pid})`);

    // Pipe any existing producers in this room from other routers to this new router!
    for (const [prodId, prod] of roomData.producers.entries()) {
      if (!prod.closed) {
        const sourceWorkerIdx = roomData.producerWorkers.get(prodId);
        if (sourceWorkerIdx !== undefined && sourceWorkerIdx !== workerIdx) {
          await this._pipeProducerBetweenWorkers(normalized, prod, sourceWorkerIdx, workerIdx);
        }
      }
    }

    return router;
  }

  async _pipeProducerBetweenWorkers(roomId, producer, sourceWorkerIdx, targetWorkerIdx) {
    const normalized = normalizeRoomId(roomId);
    const roomData = this.rooms.get(normalized);
    if (!roomData) return null;

    const key = `${producer.id}:${targetWorkerIdx}`;
    if (roomData.pipeProducers.has(key)) {
      return roomData.pipeProducers.get(key);
    }

    const sourceRouter = roomData.routers.get(sourceWorkerIdx);
    const targetRouter = roomData.routers.get(targetWorkerIdx);
    if (!sourceRouter || !targetRouter || sourceRouter.closed || targetRouter.closed) {
      return null;
    }

    try {
      const { pipeConsumer, pipeProducer } = await sourceRouter.pipeToRouter({
        producerId: producer.id,
        router: targetRouter,
      });

      roomData.pipeProducers.set(key, { pipeConsumer, pipeProducer });
      console.log(
        `[mediasoup] Piped producer ${producer.id} (${producer.kind}) from Worker #${sourceWorkerIdx} (pid: ${this.workers[sourceWorkerIdx].pid}) to Worker #${targetWorkerIdx} (pid: ${this.workers[targetWorkerIdx].pid}) for room ${normalized}`
      );
      return { pipeConsumer, pipeProducer };
    } catch (pipeErr) {
      console.error(
        `[mediasoup] Error piping producer ${producer.id} to Worker #${targetWorkerIdx}:`,
        pipeErr
      );
      return null;
    }
  }

  getRoomData(roomId) {
    const normalized = normalizeRoomId(roomId);
    return this.rooms.get(normalized) || null;
  }

  getRouterRtpCapabilities(roomId) {
    const roomData = this.getRoomData(roomId);
    return roomData?.router?.rtpCapabilities || null;
  }

  async createWebRtcTransport(roomId, socketId, { producing = false, consuming = false, forceWorkerIndex } = {}) {
    const normalized = normalizeRoomId(roomId);
    if (!this.isInitialized) {
      await this.init();
    }
    await this.getOrCreateRouter(normalized);
    const roomData = this.getRoomData(normalized);

    let workerIdx;
    if (roomData.socketWorkers.has(socketId)) {
      workerIdx = roomData.socketWorkers.get(socketId);
    } else if (forceWorkerIndex !== undefined && forceWorkerIndex !== null) {
      workerIdx = Math.abs(Number(forceWorkerIndex)) % this.workers.length;
      roomData.socketWorkers.set(socketId, workerIdx);
    } else if (config.splitRoomWorkers && this.workers.length > 1) {
      workerIdx = this.nextWorkerIdx % this.workers.length;
      this.nextWorkerIdx = (this.nextWorkerIdx + 1) % this.workers.length;
      roomData.socketWorkers.set(socketId, workerIdx);
    } else {
      workerIdx = roomData.defaultWorkerIdx;
      roomData.socketWorkers.set(socketId, workerIdx);
    }

    const router = await this.getOrCreateRouterOnWorker(normalized, workerIdx);
    const worker = this.workers[workerIdx];

    const transport = await router.createWebRtcTransport({
      ...config.webRtcTransport,
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
      appData: { socketId, producing, consuming, workerIdx },
    });

    roomData.transports.set(transport.id, transport);
    roomData.transportRouters.set(transport.id, router);
    roomData.transportWorkers.set(transport.id, workerIdx);

    if (!roomData.socketTransports.has(socketId)) {
      roomData.socketTransports.set(socketId, new Set());
    }
    roomData.socketTransports.get(socketId).add(transport.id);

    console.log(
      `[mediasoup] Transport ${transport.id} (${producing ? 'producing' : 'consuming'}) for socket ${socketId} created on Worker #${workerIdx} (pid: ${worker.pid}) in room ${normalized}`
    );

    transport.on('dtlsstatechange', (dtlsState) => {
      if (dtlsState === 'closed' || dtlsState === 'failed') {
        transport.close();
      }
    });

    transport.on('@close', () => {
      roomData.transports.delete(transport.id);
      roomData.transportRouters.delete(transport.id);
      roomData.transportWorkers.delete(transport.id);
      const userTransports = roomData.socketTransports.get(socketId);
      userTransports?.delete(transport.id);
    });

    return {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
      sctpParameters: transport.sctpParameters,
      workerIndex: workerIdx,
      workerPid: worker.pid,
    };
  }

  async connectTransport(roomId, socketId, transportId, dtlsParameters) {
    const roomData = this.getRoomData(roomId);
    if (!roomData) {
      throw new Error(`Room ${roomId} not found`);
    }

    const transport = roomData.transports.get(transportId);
    if (!transport) {
      throw new Error(`Transport ${transportId} not found in room ${roomId}`);
    }

    await transport.connect({ dtlsParameters });
  }

  async createProducer(roomId, socketId, transportId, { kind, rtpParameters, appData = {} } = {}) {
    const normalized = normalizeRoomId(roomId);
    const roomData = this.getRoomData(normalized);
    if (!roomData) {
      throw new Error(`Room ${roomId} not found`);
    }

    const transport = roomData.transports.get(transportId);
    if (!transport) {
      throw new Error(`Transport ${transportId} not found`);
    }

    const transportRouter = roomData.transportRouters.get(transportId) || roomData.router;
    const workerIdx = roomData.transportWorkers.get(transportId) ?? roomData.defaultWorkerIdx;

    const producer = await transport.produce({
      kind,
      rtpParameters,
      appData: { ...appData, socketId, roomId: normalized, workerIdx },
    });

    roomData.producers.set(producer.id, producer);
    roomData.producerRouters.set(producer.id, transportRouter);
    roomData.producerWorkers.set(producer.id, workerIdx);

    if (!roomData.socketProducers.has(socketId)) {
      roomData.socketProducers.set(socketId, new Set());
    }
    roomData.socketProducers.get(socketId).add(producer.id);

    producer.on('transportclose', () => {
      producer.close();
    });

    producer.on('@close', () => {
      roomData.producers.delete(producer.id);
      roomData.producerRouters.delete(producer.id);
      roomData.producerWorkers.delete(producer.id);
      const userProducers = roomData.socketProducers.get(socketId);
      userProducers?.delete(producer.id);
    });

    // Pipe this producer to all other active routers in this room across different workers!
    for (const [otherWorkerIdx, otherRouter] of roomData.routers.entries()) {
      if (otherWorkerIdx !== workerIdx && !otherRouter.closed) {
        await this._pipeProducerBetweenWorkers(normalized, producer, workerIdx, otherWorkerIdx);
      }
    }

    return {
      id: producer.id,
      kind: producer.kind,
      appData: producer.appData,
    };
  }

  async createConsumer(roomId, socketId, transportId, { producerId, rtpCapabilities } = {}) {
    const normalized = normalizeRoomId(roomId);
    const roomData = this.getRoomData(normalized);
    if (!roomData) {
      throw new Error(`Room ${roomId} not found`);
    }

    const transport = roomData.transports.get(transportId);
    if (!transport) {
      throw new Error(`Transport ${transportId} not found`);
    }

    const router = roomData.transportRouters.get(transportId) || roomData.router;
    const producer = roomData.producers.get(producerId);
    if (!producer) {
      throw new Error(`Producer ${producerId} not found`);
    }

    // If the producer is on a different worker than this consumer, ensure it is piped!
    const producerWorkerIdx = roomData.producerWorkers.get(producerId);
    const consumerWorkerIdx = roomData.transportWorkers.get(transportId);
    if (
      producerWorkerIdx !== undefined &&
      consumerWorkerIdx !== undefined &&
      producerWorkerIdx !== consumerWorkerIdx
    ) {
      const pipeKey = `${producerId}:${consumerWorkerIdx}`;
      if (!roomData.pipeProducers.has(pipeKey)) {
        await this._pipeProducerBetweenWorkers(
          normalized,
          producer,
          producerWorkerIdx,
          consumerWorkerIdx
        );
      }
    }

    if (!router.canConsume({ producerId, rtpCapabilities })) {
      throw new Error(`Cannot consume producer ${producerId} with provided RTP capabilities`);
    }

    const consumer = await transport.consume({
      producerId,
      rtpCapabilities,
      paused: true, // Recommended by mediasoup: pause until client prepares receiver
      appData: { ...producer.appData, consumerSocketId: socketId },
    });

    roomData.consumers.set(consumer.id, consumer);

    if (!roomData.socketConsumers.has(socketId)) {
      roomData.socketConsumers.set(socketId, new Set());
    }
    roomData.socketConsumers.get(socketId).add(consumer.id);

    consumer.on('transportclose', () => {
      consumer.close();
    });

    consumer.on('producerclose', () => {
      consumer.close();
    });

    consumer.on('@close', () => {
      roomData.consumers.delete(consumer.id);
      const userConsumers = roomData.socketConsumers.get(socketId);
      userConsumers?.delete(consumer.id);
    });

    return {
      id: consumer.id,
      producerId,
      kind: consumer.kind,
      rtpParameters: consumer.rtpParameters,
      appData: consumer.appData,
      producerSocketId: producer.appData?.socketId,
    };
  }

  async resumeConsumer(roomId, socketId, consumerId) {
    const roomData = this.getRoomData(roomId);
    if (!roomData) {
      return;
    }

    const consumer = roomData.consumers.get(consumerId);
    if (consumer && !consumer.closed) {
      await consumer.resume();
    }
  }

  async pauseProducer(roomId, socketId, producerId) {
    const roomData = this.getRoomData(roomId);
    if (!roomData) {
      return;
    }

    const producer = roomData.producers.get(producerId);
    if (producer && !producer.closed && producer.appData?.socketId === socketId) {
      await producer.pause();
    }
  }

  async resumeProducer(roomId, socketId, producerId) {
    const roomData = this.getRoomData(roomId);
    if (!roomData) {
      return;
    }

    const producer = roomData.producers.get(producerId);
    if (producer && !producer.closed && producer.appData?.socketId === socketId) {
      await producer.resume();
    }
  }

  async closeProducer(roomId, socketId, producerId) {
    const roomData = this.getRoomData(roomId);
    if (!roomData) {
      return;
    }

    const producer = roomData.producers.get(producerId);
    if (producer && !producer.closed && producer.appData?.socketId === socketId) {
      producer.close();
      roomData.producers.delete(producerId);
      roomData.producerRouters.delete(producerId);
      roomData.producerWorkers.delete(producerId);
      roomData.socketProducers.get(socketId)?.delete(producerId);
    }
  }

  getProducersForRoom(roomId) {
    const roomData = this.getRoomData(roomId);
    if (!roomData) {
      return [];
    }

    const producersList = [];
    for (const [id, producer] of roomData.producers.entries()) {
      if (!producer.closed) {
        producersList.push({
          producerId: id,
          producerSocketId: producer.appData?.socketId,
          kind: producer.kind,
          appData: producer.appData,
        });
      }
    }
    return producersList;
  }

  handleSocketDisconnect(roomId, socketId) {
    const normalized = normalizeRoomId(roomId);
    const roomData = this.getRoomData(normalized);
    if (!roomData) {
      return;
    }

    // Close producers for this socket
    const userProducers = roomData.socketProducers.get(socketId);
    if (userProducers) {
      for (const producerId of userProducers) {
        const producer = roomData.producers.get(producerId);
        producer?.close();
        roomData.producers.delete(producerId);
        roomData.producerRouters.delete(producerId);
        roomData.producerWorkers.delete(producerId);
      }
      roomData.socketProducers.delete(socketId);
    }

    // Close consumers for this socket
    const userConsumers = roomData.socketConsumers.get(socketId);
    if (userConsumers) {
      for (const consumerId of userConsumers) {
        const consumer = roomData.consumers.get(consumerId);
        consumer?.close();
        roomData.consumers.delete(consumerId);
      }
      roomData.socketConsumers.delete(socketId);
    }

    // Close transports for this socket
    const userTransports = roomData.socketTransports.get(socketId);
    if (userTransports) {
      for (const transportId of userTransports) {
        const transport = roomData.transports.get(transportId);
        transport?.close();
        roomData.transports.delete(transportId);
        roomData.transportRouters.delete(transportId);
        roomData.transportWorkers.delete(transportId);
      }
      roomData.socketTransports.delete(socketId);
    }

    roomData.socketWorkers.delete(socketId);

    // Clean up room if no transports left
    if (roomData.transports.size === 0 && roomData.producers.size === 0) {
      for (const router of roomData.routers.values()) {
        try {
          router.close();
        } catch {
          // ignore
        }
      }
      this.rooms.delete(normalized);
    }
  }

  closeRoom(roomId) {
    const normalized = normalizeRoomId(roomId);
    const roomData = this.rooms.get(normalized);
    if (roomData) {
      for (const consumer of roomData.consumers.values()) {
        try {
          consumer.close();
        } catch {
          // ignore
        }
      }
      roomData.consumers.clear();

      for (const producer of roomData.producers.values()) {
        try {
          producer.close();
        } catch {
          // ignore
        }
      }
      roomData.producers.clear();
      roomData.producerRouters.clear();
      roomData.producerWorkers.clear();

      for (const transport of roomData.transports.values()) {
        try {
          transport.close();
        } catch {
          // ignore
        }
      }
      roomData.transports.clear();
      roomData.transportRouters.clear();
      roomData.transportWorkers.clear();
      roomData.socketTransports.clear();
      roomData.socketProducers.clear();
      roomData.socketConsumers.clear();
      roomData.socketWorkers.clear();
      roomData.pipeProducers.clear();

      for (const router of roomData.routers.values()) {
        try {
          router.close();
        } catch {
          // ignore
        }
      }
      roomData.routers.clear();
      roomData.routerWorkers.clear();

      this.rooms.delete(normalized);
    }
  }

  async close() {
    for (const roomId of Array.from(this.rooms.keys())) {
      this.closeRoom(roomId);
    }
    this.rooms.clear();

    for (const worker of this.workers) {
      try {
        worker.close();
      } catch {
        // ignore
      }
    }
    this.workers = [];
    this.isInitialized = false;
  }

  async pipeProducerToRouter({ sourceRoomId, producerId, targetRouter }) {
    const sourceRoomData = this.getRoomData(sourceRoomId);
    if (!sourceRoomData || !sourceRoomData.router) {
      throw new Error(`Source room ${sourceRoomId} not found`);
    }

    if (!targetRouter || targetRouter.closed) {
      throw new Error('Invalid target router');
    }

    const { pipeConsumer, pipeProducer } = await sourceRoomData.router.pipeToRouter({
      producerId,
      router: targetRouter,
    });

    return { pipeConsumer, pipeProducer };
  }

  async getMetrics() {
    const workers = [];
    for (let i = 0; i < this.workers.length; i++) {
      const worker = this.workers[i];
      let usage = null;
      try {
        usage = await worker.getResourceUsage();
      } catch {
        // worker closed or busy
      }
      workers.push({
        index: i,
        pid: worker.pid,
        closed: worker.closed,
        usage,
      });
    }

    let totalTransports = 0;
    let totalProducers = 0;
    let totalConsumers = 0;
    let totalPipedProducers = 0;
    const roomsInfo = [];

    for (const [roomId, roomData] of this.rooms.entries()) {
      const transportsCount = roomData.transports.size;
      const producersCount = roomData.producers.size;
      const consumersCount = roomData.consumers.size;
      const pipedCount = roomData.pipeProducers.size;
      totalTransports += transportsCount;
      totalProducers += producersCount;
      totalConsumers += consumersCount;
      totalPipedProducers += pipedCount;
      roomsInfo.push({
        roomId,
        transportsCount,
        producersCount,
        consumersCount,
        pipedProducersCount: pipedCount,
        routersCount: roomData.routers.size,
        workersSpanned: Array.from(roomData.routers.keys()),
      });
    }

    return {
      workers,
      totalWorkers: this.workers.length,
      rooms: roomsInfo,
      totalRooms: this.rooms.size,
      totalTransports,
      totalProducers,
      totalConsumers,
      totalPipedProducers,
    };
  }

  async getRoomStatsSummary(roomId) {
    const roomData = this.rooms.get(roomId);
    if (!roomData) return null;

    let totalPacketsLost = 0;
    let totalPackets = 0;
    let rttSum = 0;
    let rttCount = 0;
    let inBitrateSum = 0;
    let outBitrateSum = 0;

    for (const producer of roomData.producers.values()) {
      if (producer.closed) continue;
      try {
        const stats = await producer.getStats();
        for (const s of stats) {
          if (s.bitrate) inBitrateSum += s.bitrate;
          if (s.roundTripTime) {
            rttSum += s.roundTripTime;
            rttCount++;
          }
          if (s.packetCount) totalPackets += s.packetCount;
          if (s.packetsLost) totalPacketsLost += s.packetsLost;
        }
      } catch {}
    }

    for (const consumer of roomData.consumers.values()) {
      if (consumer.closed) continue;
      try {
        const stats = await consumer.getStats();
        for (const s of stats) {
          if (s.bitrate) outBitrateSum += s.bitrate;
          if (s.roundTripTime) {
            rttSum += s.roundTripTime;
            rttCount++;
          }
          if (s.packetCount) totalPackets += s.packetCount;
          if (s.packetsLost) totalPacketsLost += s.packetsLost;
        }
      } catch {}
    }

    const lossPercent = (totalPackets + totalPacketsLost > 0)
      ? Number(((totalPacketsLost / (totalPackets + totalPacketsLost)) * 100).toFixed(2))
      : 0.0;
    const avgRtt = rttCount > 0 ? Number((rttSum / rttCount).toFixed(1)) : 0.0;

    return {
      roomId,
      lossPercent,
      avgRttMs: avgRtt,
      inBitrateKbps: Math.round(inBitrateSum / 1000),
      outBitrateKbps: Math.round(outBitrateSum / 1000),
      producersCount: roomData.producers.size,
      consumersCount: roomData.consumers.size,
      transportsCount: roomData.transports.size,
    };
  }

  startStatsLogging(intervalMs = 10000) {
    if (this._statsLogInterval) clearInterval(this._statsLogInterval);
    this._statsLogInterval = setInterval(async () => {
      try {
        for (const roomId of this.rooms.keys()) {
          const summary = await this.getRoomStatsSummary(roomId);
          if (summary && (summary.producersCount > 0 || summary.consumersCount > 0)) {
            console.log(
              `[mediasoup:stats] [Room: ${summary.roomId}] RTT: ${summary.avgRttMs}ms | Loss: ${summary.lossPercent}% | In: ${summary.inBitrateKbps} kbps | Out: ${summary.outBitrateKbps} kbps | Producers: ${summary.producersCount} | Consumers: ${summary.consumersCount}`
            );
          }
        }
      } catch (err) {
        console.error('[mediasoup:stats] Error logging room stats:', err);
      }
    }, intervalMs);
    if (this._statsLogInterval && this._statsLogInterval.unref) {
      this._statsLogInterval.unref();
    }
  }

  stopStatsLogging() {
    if (this._statsLogInterval) {
      clearInterval(this._statsLogInterval);
      this._statsLogInterval = null;
    }
  }
}

export const mediasoupManager = new MediasoupManager();
export default mediasoupManager;
