import { createMemoryDb } from './db-memory.js';
import { createMysqlDb } from './db-mysql.js';
import { toPublicUser } from './db-shape.js';

export { toPublicUser };

/**
 * Resolve the active store.
 * - DB_DRIVER=memory → in-process (tests / offline)
 * - DB_DRIVER=mysql or MYSQL_URL set → MySQL
 * - otherwise memory (dev default) with a warning
 */
export async function createStore() {
  const driver = process.env.DB_DRIVER || (process.env.MYSQL_URL ? 'mysql' : 'memory');
  if (driver === 'mysql') {
    const url = process.env.MYSQL_URL;
    if (!url) throw new Error('MYSQL_URL is required when DB_DRIVER=mysql');
    return createMysqlDb(url);
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing memory DB in production — set MYSQL_URL');
  }
  return createMemoryDb();
}
