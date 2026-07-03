const defaultClientOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173'];

export function getCorsOrigin() {
  const configuredOrigins = process.env.CLIENT_URL
    ? process.env.CLIENT_URL.split(',').map((origin) => origin.trim()).filter(Boolean)
    : [];

  return Array.from(new Set([...configuredOrigins, ...defaultClientOrigins]));
}
