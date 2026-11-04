import 'dotenv/config';
import http from 'http';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import app from './app.js';
import { getCorsOrigin } from './config/cors.js';
import connectDB from './config/db.js';
import { getRedisClient } from './config/redis.js';
import registerSocketHandlers from './socket/index.js';
import mediasoupManager from './sfu/mediasoupManager.js';

const port = process.env.PORT || 5000;
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: getCorsOrigin(),
    credentials: true,
  },
});

registerSocketHandlers(io);

async function startServer() {
  await connectDB();
  const redisClient = await getRedisClient();
  if (redisClient) {
    try {
      const subClient = redisClient.duplicate();
      await subClient.connect();
      io.adapter(createAdapter(redisClient, subClient));
      console.log('Socket.IO clustered with Redis adapter');
    } catch (adapterErr) {
      console.warn('Using default memory adapter for Socket.IO:', adapterErr.message);
    }
  }

  await mediasoupManager.init();

  server.listen(port, () => {
    console.log(`Vync server running on port ${port}`);
  });
}

async function shutdown() {
  console.log('Shutting down Vync server...');
  await mediasoupManager.close();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
