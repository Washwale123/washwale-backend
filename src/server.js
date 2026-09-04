const http = require('http');
const { URL } = require('url');
const db = require('./db');
const { hashPassword, verifyPassword, signToken, verifyToken, randomToken } = require('./auth');
const { Router, readBody, sendJson } = require('./router');

const PORT = process.env.PORT || 3000;
const router = new Router();

const CONFIG = {
  serviceHoursStart: '09:30',
  serviceHoursEnd: '18:30',
  feedbackEmail: 'support@washwale.example',
  feedbackPhone: '+91-00000-00000',
  terms: 'Standard WashWale terms and conditions apply. See app for full text.',
};

// ---------- helpers ----------
function requireAuth(req) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const payload = verifyToken(token);
  return payload; // null if invalid/expired
}

function publicUser(u) {
  const { passwordHash, ...rest } = u;
  return rest;
}

function publicBooking(b) {
  return b;
}

// ---------- config ----------
router.get('/api/config', async (req, res) => {
  sendJson(res, 200, CONFIG);
});

// ---------- auth: customers ----------
router.post('/api/auth/register', async (req, res) => {
  const body = req._body;
  const { name, phone, email, password } = body;
  if (!name || !phone || !password) return sendJson(res, 400, { error: 'name, phone, and password are required' });
  const data = await db.load();
  if (data.users.find((u) => u.phone === phone)) {
    return sendJson(res, 409, { error: 'An account with this phone number already exists' });
  }
  const user = {
    id: db.nextId(data, 'users'),
    name, phone, email: email || null,
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString(),
  };
  data.users.push(user);
  await db.save(data);
  const token = signToken({ sub: user.id, role: 'customer' });
  sendJson(res, 201, { token, user: publicUser(user) });
});

router.post('/api/auth/login', async (req, res) => {
  const { phone, password } = req._body;
  const data = await db.load();
  const user = data.users.find((u) => u.phone === phone);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return sendJson(res, 401, { error: 'Invalid phone number or password' });
  }
  const token = signToken({ sub: user.id, role: 'customer' });
  sendJson(res, 200, { token, user: publicUser(user) });
});

// ---------- auth: admin ----------
router.post('/api/admin/bootstrap', async (req, res) => {
  // One-time setup route to create the first admin. Disable/remove in production.
  const { username, password } = req._body;
  if (!username || !password) return sendJson(res, 400, { error: 'username and password required' });
  const data = await db.load();
  if (data.admins.length > 0) return sendJson(res, 403, { error: 'Admin already exists. Use /api/admin/login.' });
  const admin = { id: 1, username, passwordHash: hashPassword(password) };
  data.admins.push(admin);
  await db.save(data);
  sendJson(res, 201, { message: 'Admin created' });
});

router.post('/api/admin/login', async (req, res) => {
  const { username, password } = req._body;
  const data = await db.load();
  const admin = data.admins.find((a) => a.username === username);
  if (!admin || !verifyPassword(password, admin.passwordHash)) {
    return sendJson(res, 401, { error: 'Invalid username or password' });
  }
  const token = signToken({ sub: admin.id, role: 'admin' });
  sendJson(res, 200, { token });
});

// ---------- bookings: customer ----------
router.post('/api/bookings', async (req, res) => {
  const auth = requireAuth(req);
  if (!auth || auth.role !== 'customer') return sendJson(res, 401, { error: 'Login required' });
  const { vehicleType, serviceType, address, lat, lng, scheduledTime } = req._body;
  if (!vehicleType || !serviceType || !address) {
    return sendJson(res, 400, { error: 'vehicleType, serviceType, and address are required' });
  }
  const data = await db.load();
  const booking = {
    id: db.nextId(data, 'bookings'),
    userId: auth.sub,
    vehicleType, serviceType, address,
    lat: lat ?? null, lng: lng ?? null,
    scheduledTime: scheduledTime || null,
    status: 'pending', // pending -> accepted -> in_progress -> completed | cancelled
    staffId: null,
    price: null,
    paymentStatus: 'unpaid',
    startLocation: null,
    endLocation: null,
    createdAt: new Date().toISOString(),
  };
  data.bookings.push(booking);
  await db.save(data);
  sendJson(res, 201, publicBooking(booking));
});

router.get('/api/bookings', async (req, res) => {
  const auth = requireAuth(req);
  if (!auth || auth.role !== 'customer') return sendJson(res, 401, { error: 'Login required' });
  const data = await db.load();
  const list = data.bookings.filter((b) => b.userId === auth.sub);
  sendJson(res, 200, list);
});

router.get('/api/bookings/:id', async (req, res) => {
  const auth = requireAuth(req);
  if (!auth) return sendJson(res, 401, { error: 'Login required' });
  const data = await db.load();
  const booking = data.bookings.find((b) => b.id === Number(req._params.id));
  if (!booking) return sendJson(res, 404, { error: 'Booking not found' });
  if (auth.role === 'customer' && booking.userId !== auth.sub) return sendJson(res, 403, { error: 'Not your booking' });
  sendJson(res, 200, booking);
});

router.post('/api/bookings/:id/cancel', async (req, res) => {
  const auth = requireAuth(req);
  if (!auth || auth.role !== 'customer') return sendJson(res, 401, { error: 'Login required' });
  const data = await db.load();
  const booking = data.bookings.find((b) => b.id === Number(req._params.id) && b.userId === auth.sub);
  if (!booking) return sendJson(res, 404, { error: 'Booking not found' });
  if (['completed', 'cancelled'].includes(booking.status)) {
    return sendJson(res, 400, { error: `Cannot cancel a ${booking.status} booking` });
  }
  booking.status = 'cancelled';
  await db.save(data);
  sendJson(res, 200, booking);
});

// live location for a customer's booking (reads assigned staff's current location)
router.get('/api/bookings/:id/location', async (req, res) => {
  const auth = requireAuth(req);
  if (!auth || auth.role !== 'customer') return sendJson(res, 401, { error: 'Login required' });
  const data = await db.load();
  const booking = data.bookings.find((b) => b.id === Number(req._params.id) && b.userId === auth.sub);
  if (!booking) return sendJson(res, 404, { error: 'Booking not found' });
  if (!booking.staffId) return sendJson(res, 200, { location: null, message: 'Not yet assigned' });
  const staff = data.staff.find((s) => s.id === booking.staffId);
  sendJson(res, 200, { location: staff?.currentLocation || null, staffName: staff?.name || null });
});

// ---------- ratings ----------
router.post('/api/bookings/:id/rating', async (req, res) => {
  const auth = requireAuth(req);
  if (!auth || auth.role !== 'customer') return sendJson(res, 401, { error: 'Login required' });
  const { rating, comment } = req._body;
  if (!rating || rating < 1 || rating > 5) return sendJson(res, 400, { error: 'rating must be 1-5' });
  const data = await db.load();
  const booking = data.bookings.find((b) => b.id === Number(req._params.id) && b.userId === auth.sub);
  if (!booking) return sendJson(res, 404, { error: 'Booking not found' });
  if (booking.status !== 'completed') return sendJson(res, 400, { error: 'Can only rate completed bookings' });
  const entry = { id: db.nextId(data, 'ratings'), bookingId: booking.id, userId: auth.sub, rating, comment: comment || '', createdAt: new Date().toISOString() };
  data.ratings.push(entry);
  await db.save(data);
  sendJson(res, 201, entry);
});

// ---------- payments (PhonePe/UPI stub — plug in real PhonePe API here) ----------
router.post('/api/payments/initiate', async (req, res) => {
  const auth = requireAuth(req);
  if (!auth || auth.role !== 'customer') return sendJson(res, 401, { error: 'Login required' });
  const { bookingId } = req._body;
  const data = await db.load();
  const booking = data.bookings.find((b) => b.id === bookingId && b.userId === auth.sub);
  if (!booking) return sendJson(res, 404, { error: 'Booking not found' });
  const payment = {
    id: db.nextId(data, 'payments'),
    bookingId, userId: auth.sub,
    amount: booking.price || 0,
    provider: 'phonepe',
    status: 'initiated',
    // In production: call PhonePe's Pay API here and return the real redirect URL.
    redirectUrl: `https://washwale.example/pay/mock/${randomToken(8)}`,
    createdAt: new Date().toISOString(),
  };
  data.payments.push(payment);
  await db.save(data);
  sendJson(res, 201, payment);
});

router.post('/api/payments/webhook', async (req, res) => {
  // In production: verify PhonePe's signature (X-VERIFY header) before trusting this.
  const { bookingId, status } = req._body;
  const data = await db.load();
  const booking = data.bookings.find((b) => b.id === bookingId);
  if (!booking) return sendJson(res, 404, { error: 'Booking not found' });
  booking.paymentStatus = status === 'success' ? 'paid' : 'failed';
  await db.save(data);
  sendJson(res, 200, { ok: true });
});

// ---------- admin ----------
function requireAdmin(req, res) {
  const auth = requireAuth(req);
  if (!auth || auth.role !== 'admin') { sendJson(res, 401, { error: 'Admin login required' }); return null; }
  return auth;
}

router.get('/api/admin/bookings', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const data = await db.load();
  sendJson(res, 200, data.bookings);
});

router.patch('/api/admin/bookings/:id', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const data = await db.load();
  const booking = data.bookings.find((b) => b.id === Number(req._params.id));
  if (!booking) return sendJson(res, 404, { error: 'Booking not found' });
  const { status, staffId, price } = req._body;
  if (status) booking.status = status;
  if (staffId !== undefined) booking.staffId = staffId;
  if (price !== undefined) booking.price = price;
  await db.save(data);
  sendJson(res, 200, booking);
});

router.get('/api/admin/staff', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const data = await db.load();
  sendJson(res, 200, data.staff);
});

router.post('/api/admin/staff', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const { name, phone } = req._body;
  if (!name || !phone) return sendJson(res, 400, { error: 'name and phone required' });
  const data = await db.load();
  const staff = {
    id: db.nextId(data, 'staff'),
    name, phone,
    trackLinkToken: randomToken(16), // this is the "no-login" link identifier
    currentLocation: null,
    createdAt: new Date().toISOString(),
  };
  data.staff.push(staff);
  await db.save(data);
  sendJson(res, 201, { ...staff, trackLink: `/track/${staff.trackLinkToken}` });
});

// ---------- staff no-login tracking link ----------
router.get('/api/track/:linkToken', async (req, res) => {
  const data = await db.load();
  const staff = data.staff.find((s) => s.trackLinkToken === req._params.linkToken);
  if (!staff) return sendJson(res, 404, { error: 'Invalid tracking link' });
  const today = new Date().toISOString().slice(0, 10);
  const myBookings = data.bookings.filter((b) => b.staffId === staff.id && ['accepted', 'in_progress'].includes(b.status));
  sendJson(res, 200, { staffName: staff.name, bookings: myBookings });
});

router.post('/api/track/:linkToken/location', async (req, res) => {
  const { lat, lng } = req._body;
  if (lat === undefined || lng === undefined) return sendJson(res, 400, { error: 'lat and lng required' });
  const data = await db.load();
  const staff = data.staff.find((s) => s.trackLinkToken === req._params.linkToken);
  if (!staff) return sendJson(res, 404, { error: 'Invalid tracking link' });
  staff.currentLocation = { lat, lng, updatedAt: new Date().toISOString() };
  await db.save(data);
  sendJson(res, 200, { ok: true });
});

router.post('/api/track/:linkToken/bookings/:id/start', async (req, res) => {
  const { lat, lng } = req._body;
  const data = await db.load();
  const staff = data.staff.find((s) => s.trackLinkToken === req._params.linkToken);
  if (!staff) return sendJson(res, 404, { error: 'Invalid tracking link' });
  const booking = data.bookings.find((b) => b.id === Number(req._params.id) && b.staffId === staff.id);
  if (!booking) return sendJson(res, 404, { error: 'Booking not found for this staff member' });
  booking.status = 'in_progress';
  booking.startLocation = { lat, lng, timestamp: new Date().toISOString() };
  await db.save(data);
  sendJson(res, 200, booking);
});

router.post('/api/track/:linkToken/bookings/:id/complete', async (req, res) => {
  const { lat, lng } = req._body;
  const data = await db.load();
  const staff = data.staff.find((s) => s.trackLinkToken === req._params.linkToken);
  if (!staff) return sendJson(res, 404, { error: 'Invalid tracking link' });
  const booking = data.bookings.find((b) => b.id === Number(req._params.id) && b.staffId === staff.id);
  if (!booking) return sendJson(res, 404, { error: 'Booking not found for this staff member' });
  booking.status = 'completed';
  booking.endLocation = { lat, lng, timestamp: new Date().toISOString() };
  await db.save(data);
  sendJson(res, 200, booking);
});

// ---------- server ----------
const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    return sendJson(res, 204, {});
  }
  const url = new URL(req.url, `http://${req.headers.host}`);
  const match = router.match(req.method, url.pathname);
  if (!match) return sendJson(res, 404, { error: 'Not found' });
  try {
    req._body = await readBody(req);
    req._params = match.params;
    req._query = Object.fromEntries(url.searchParams);
    await match.handler(req, res);
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { error: err.message || 'Internal server error' });
  }
});

server.listen(PORT, () => {
  console.log(`WashWale API listening on http://localhost:${PORT}`);
});

module.exports = server;
