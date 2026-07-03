import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envTestPath = path.resolve(__dirname, '../.env.test');

if (fs.existsSync(envTestPath)) {
  dotenv.config({ path: envTestPath, override: true });
}

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'meetify-test-secret';
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';
process.env.JWT_COOKIE_EXPIRES_IN = process.env.JWT_COOKIE_EXPIRES_IN || '1';
process.env.STORAGE_PROVIDER = process.env.STORAGE_PROVIDER || 's3';
process.env.LOCAL_UPLOADS_ENABLED = process.env.LOCAL_UPLOADS_ENABLED || 'false';

const mongoUri = process.env.MONGO_URI_TEST || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/meetify_test';
const databaseName = new URL(mongoUri).pathname.replace(/^\//, '').split('?')[0];

if (!/test|jest/i.test(databaseName)) {
  throw new Error(`Refusing to run tests against non-test MongoDB database "${databaseName}"`);
}

async function clearCollections() {
  const collections = Object.values(mongoose.connection.collections);
  await Promise.all(collections.map((collection) => collection.deleteMany({})));
}

beforeAll(async () => {
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
});

beforeEach(async () => {
  await clearCollections();
});

afterEach(async () => {
  await clearCollections();
});

afterAll(async () => {
  await mongoose.connection.close();
});
