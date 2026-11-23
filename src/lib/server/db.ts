import 'server-only';
import { MongoClient, type Db } from 'mongodb';

declare global { var __cardflowMongo: Promise<MongoClient> | undefined; }

export async function getDb(): Promise<Db> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not configured');
  const name = process.env.MONGODB_DB || 'cardflow';
  if (!globalThis.__cardflowMongo) {
    const client = new MongoClient(uri, { maxPoolSize: 10, serverSelectionTimeoutMS: 10000 });
    globalThis.__cardflowMongo = client.connect().catch(err => { globalThis.__cardflowMongo = undefined; throw err; });
  }
  return (await globalThis.__cardflowMongo).db(name);
}

export async function ensureIndexes(): Promise<void> {
  const db = await getDb();
  await Promise.all([
    db.collection('users').createIndex({ email: 1 }, { unique: true }),
    db.collection('sessions').createIndex({ tokenHash: 1 }, { unique: true }),
    db.collection('sessions').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection('auth_attempts').createIndex({ key: 1 }, { unique: true }),
    db.collection('auth_attempts').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection('contacts').createIndex({ userId: 1, id: 1 }, { unique: true }),
    db.collection('contacts').createIndex({ userId: 1, createdAt: -1 }),
    db.collection('blob_uploads').createIndex({ userId: 1, pathname: 1 }, { unique: true }),
    db.collection('blob_cleanup').createIndex({ pathname: 1 }, { unique: true }),
    db.collection('blob_upload_limits').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ]);
}
