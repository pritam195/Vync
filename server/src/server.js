import 'dotenv/config';
import http from 'http';
import { Server } from 'socket.io';
import app from './app.js';
import { getCorsOrigin } from './config/cors.js';
import connectDB from './config/db.js';
import { getRedisClient } from './config/redis.js';
import registerSocketHandlers from './socket/index.js';

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
  await getRedisClient();

  server.listen(port, () => {
    console.log(`Vync server running on port ${port}`);
  });
}

startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
