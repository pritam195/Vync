import { defineConfig, devices } from '@playwright/test';

const frontendUrl = process.env.E2E_FRONTEND_URL || 'http://127.0.0.1:4173';
const backendUrl = process.env.E2E_BACKEND_URL || 'http://127.0.0.1:5050';
const mongoUri = process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/meetify_e2e_test';

export default defineConfig({
  testDir: './e2e',
  timeout: 120 * 1000,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: frontendUrl,
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    permissions: ['camera', 'microphone'],
    launchOptions: {
      args: [
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
        '--no-sandbox',
      ],
    },
  },
  webServer: [
    {
      command: 'npm run start --prefix server',
      url: `${backendUrl}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000,
      env: {
        NODE_ENV: 'test',
        PORT: '5050',
        CLIENT_URL: frontendUrl,
        MONGO_URI: mongoUri,
        MONGO_URI_TEST: mongoUri,
        JWT_SECRET: 'meetify-e2e-secret',
        JWT_EXPIRES_IN: '1h',
        JWT_COOKIE_EXPIRES_IN: '1',
        REDIS_URL: '',
        STORAGE_PROVIDER: 'local',
        LOCAL_UPLOADS_ENABLED: 'true',
      },
    },
    {
      command: 'npm run build --prefix client && npm run preview --prefix client -- --host 127.0.0.1 --port 4173',
      url: frontendUrl,
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000,
      env: {
        VITE_API_URL: `${backendUrl}/api`,
        VITE_SOCKET_URL: backendUrl,
        VITE_STUN_URL: 'stun:stun.l.google.com:19302',
        VITE_TURN_URL: '',
        VITE_TURN_USERNAME: '',
        VITE_TURN_CREDENTIAL: '',
      },
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
