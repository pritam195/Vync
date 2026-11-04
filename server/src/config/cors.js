const defaultClientOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
];

export function getCorsOrigin() {
  const configuredOrigins = process.env.CLIENT_URL
    ? process.env.CLIENT_URL.split(',').map((origin) => origin.trim()).filter(Boolean)
    : [];

  const allowedList = Array.from(new Set([...configuredOrigins, ...defaultClientOrigins]));

  return (origin, callback) => {
    if (!origin || allowedList.includes(origin)) {
      return callback(null, true);
    }

    try {
      const url = new URL(origin);
      if (
        url.hostname === 'localhost' ||
        url.hostname === '127.0.0.1' ||
        url.hostname === '::1' ||
        url.hostname.startsWith('192.168.') ||
        url.hostname.startsWith('10.') ||
        url.hostname.endsWith('.local')
      ) {
        return callback(null, true);
      }
    } catch {}

    return callback(new Error('Not allowed by CORS'));
  };
}
