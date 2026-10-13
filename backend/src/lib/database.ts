import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { readDatabaseEnvironment } from '../config/database-env.js';

export function createDatabase(connectionString = readDatabaseEnvironment().DATABASE_URL) {
  const adapter = new PrismaPg({ connectionString, max: 5, connectionTimeoutMillis: 10_000 });
  return new PrismaClient({ adapter, log: [] });
}
