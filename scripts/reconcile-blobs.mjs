// Run manually from the project root: node --env-file=.env.local scripts/reconcile-blobs.mjs
// Uses MongoDB references as the source of truth. Only abandoned uploads older than 24h are removed.
import { MongoClient } from 'mongodb';
import { del } from '@vercel/blob';
const uri = process.env.MONGODB_URI;
if (!uri || !process.env.BLOB_READ_WRITE_TOKEN) throw new Error('Configure MONGODB_URI and BLOB_READ_WRITE_TOKEN.');
const client = new MongoClient(uri);
await client.connect();
try {
  const db = client.db(process.env.MONGODB_DB || 'cardflow');
  const cutoff = new Date(Date.now() - 86400000);
  let deleted = 0, failed = 0;
  const pending = db.collection('blob_cleanup');
  const uploads = db.collection('blob_uploads');
  const rows = [
    ...(await pending.find({}).limit(500).toArray()).map(x => ({...x, source:'pending'})),
    ...(await uploads.find({ createdAt: { $lt: cutoff } }).limit(500).toArray()).map(x => ({...x, source:'uploads'})),
  ];
  for (const item of rows) {
    const path = item.pathname;
    if (typeof path !== 'string' || !path.startsWith('cardflow/')) continue;
    const owner = await db.collection('contacts').findOne({$or:[{'images.front.pathname':path},{'images.back.pathname':path}]},{projection:{_id:1}});
    if (owner) { if(item.source==='uploads') await uploads.deleteOne({_id:item._id}); continue; }
    try {
      await del(path);
      if(item.source==='pending') await pending.deleteOne({_id:item._id});
      else await uploads.deleteOne({_id:item._id});
      deleted++;
    } catch (error) { failed++; console.error('Cleanup failed for',path,error instanceof Error ? error.message : error); }
  }
  console.log(`Cleanup: ${deleted} deleted, ${failed} failures, ${rows.length} examined.`);
  if(failed) process.exitCode=1;
} finally { await client.close(); }
