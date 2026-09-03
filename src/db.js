const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, '..', 'data', 'db.json');

const DEFAULT_DATA = {
  users: [],
  staff: [],
  bookings: [],
  ratings: [],
  admins: [],
  payments: [],
  _seq: { users: 1, staff: 1, bookings: 1, ratings: 1, payments: 1 },
};

function load() {
  const dir = path.dirname(DB_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(DEFAULT_DATA, null, 2));
  }
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
}

function save(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function nextId(data, collection) {
  return data._seq[collection]++;
}

module.exports = { load, save, nextId, DB_FILE };
