// MongoDB-backed "database". Keeps the whole app state as ONE document
// (same shape the old JSON file used), so the rest of the codebase barely
// changes — you just `await` db.load() / db.save() now instead of calling
// them synchronously.
const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI;
const DOC_ID = 'main'; // single document holding the whole app state

const DEFAULT_DATA = {
  _id: DOC_ID,
  users: [],       // customers
  staff: [],        // wash staff, each has a unique trackLinkToken
  bookings: [],
  ratings: [],
  admins: [],
  payments: [],
  _seq: { users: 1, staff: 1, bookings: 1, ratings: 1, payments: 1 },
};

let clientPromise = null;
let collectionCache = null;

async function getCollection() {
  if (collectionCache) return collectionCache;
  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI is not set. Add it to your environment variables.');
  }
  if (!clientPromise) {
    const client = new MongoClient(MONGODB_URI);
    clientPromise = client.connect();
  }
  const client = await clientPromise;
  const db = client.db(); // uses the database name from the URI (e.g. /washwale)
  collectionCache = db.collection('appdata');
  return collectionCache;
}

async function load() {
  const col = await getCollection();
  let doc = await col.findOne({ _id: DOC_ID });
  if (!doc) {
    doc = DEFAULT_DATA;
    await col.insertOne(doc);
  }
  return doc;
}

async function save(data) {
  const col = await getCollection();
  await col.replaceOne({ _id: DOC_ID }, data, { upsert: true });
}

function nextId(data, collection) {
  const id = data._seq[collection]++;
  return id;
}

module.exports = { load, save, nextId };
