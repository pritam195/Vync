import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import { isLocalUploadsEnabled, uploadRoot } from './config/storage.js';
import { getCorsOrigin } from './config/cors.js';
import { errorHandler, notFound } from './middleware/errorMiddleware.js';
import authRoutes from './routes/authRoutes.js';
import chatRoutes from './routes/chatRoutes.js';
import fileRoutes from './routes/fileRoutes.js';
import healthRoutes from './routes/healthRoutes.js';
import meetingRoutes from './routes/meetingRoutes.js';
import recordingRoutes from './routes/recordingRoutes.js';
import userRoutes from './routes/userRoutes.js';
import { getPrometheusMetrics, register } from './services/metricsService.js';

const app = express();

app.use(
  cors({
    origin: getCorsOrigin(),
    credentials: true,
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

if (isLocalUploadsEnabled()) {
  app.use('/uploads', express.static(uploadRoot));
}

// Prometheus metrics scraper endpoint
app.get('/metrics', async (req, res) => {
  try {
    const metrics = await getPrometheusMetrics();
    res.setHeader('Content-Type', register.contentType);
    res.send(metrics);
  } catch (error) {
    res.status(500).send(error.message);
  }
});

app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/meetings', meetingRoutes);
app.use('/api/recordings', recordingRoutes);
app.use('/api/users', userRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
