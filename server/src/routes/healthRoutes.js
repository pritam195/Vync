import { Router } from 'express';
import os from 'os';
import mediasoupManager from '../sfu/mediasoupManager.js';
import { getPrometheusMetrics, register } from '../services/metricsService.js';

const router = Router();

router.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'vync-api',
  });
});

router.get('/metrics', async (req, res) => {
  try {
    if (req.headers.accept?.includes('text/plain') || req.query.format === 'prometheus') {
      const metrics = await getPrometheusMetrics();
      res.setHeader('Content-Type', register.contentType);
      return res.send(metrics);
    }

    const sfuMetrics = await mediasoupManager.getMetrics();
    res.json({
      status: 'ok',
      timestamp: Date.now(),
      system: {
        cpus: os.cpus().length,
        cpuModel: os.cpus()[0]?.model,
        totalMemory: os.totalmem(),
        freeMemory: os.freemem(),
        loadAvg: os.loadavg(),
      },
      process: {
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage(),
      },
      sfu: sfuMetrics,
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

export default router;
