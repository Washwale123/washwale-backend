# WashWale API Documentation

Base URL (local): `http://localhost:3000`

Zero external dependencies — runs with plain `node src/server.js`. Data is
stored in `data/db.json` (swap for Postgres/MySQL later; the record shapes
won't need to change).

Auth: send `Authorization: Bearer <token>` on protected routes. Tokens come
from register/login and expire after 7 days.

---

## Public

**GET /api/config**
Returns service hours, feedback email/phone, terms text.

---

## Customer Auth

**POST /api/auth/register**
Body: `{ name, phone, email?, password }`
Returns: `{ token, user }`

**POST /api/auth/login**
Body: `{ phone, password }`
Returns: `{ token, user }`

---

## Customer: Bookings

All require `Authorization: Bearer <customer token>`.

**POST /api/bookings**
Body: `{ vehicleType, serviceType, address, lat?, lng?, scheduledTime? }`
Creates a booking with status `pending`.

**GET /api/bookings**
List the logged-in customer's bookings.

**GET /api/bookings/:id**
Get one booking (must belong to the customer, or be an admin).

**POST /api/bookings/:id/cancel**
Cancels a booking (not allowed once completed/cancelled).

**GET /api/bookings/:id/location**
Live location of the assigned staff member (for in-progress bookings).

**POST /api/bookings/:id/rating**
Body: `{ rating (1-5), comment? }` — only for `completed` bookings.

---

## Payments (PhonePe/UPI — stubbed)

**POST /api/payments/initiate**
Body: `{ bookingId }`
Returns a mock redirect URL. **Replace the stub in
`src/server.js` (`/api/payments/initiate`) with a real call to PhonePe's Pay
API** using your merchant credentials once you have them.

**POST /api/payments/webhook**
Body: `{ bookingId, status: "success" | "failed" }`
Marks the booking's payment status. In production, verify PhonePe's
`X-VERIFY` signature here before trusting the payload.

---

## Booking Status Flow

```
pending -> accepted -> in_progress -> completed
                 \-> cancelled (from pending/accepted)
```

---

## Admin

**POST /api/admin/bootstrap** (one-time only, disable after first use)
Body: `{ username, password }` — creates the first admin account.

**POST /api/admin/login**
Body: `{ username, password }`
Returns: `{ token }`

All routes below require `Authorization: Bearer <admin token>`.

**GET /api/admin/bookings** — all bookings, any status.

**PATCH /api/admin/bookings/:id**
Body: any of `{ status, staffId, price }` — assign staff, set price, change
status.

**GET /api/admin/staff** — list staff (includes each staff member's
`trackLinkToken`).

**POST /api/admin/staff**
Body: `{ name, phone }`
Creates a staff member and generates their unique no-login tracking link
(`trackLinkToken`). Share `/track/<trackLinkToken>` with the staff member —
no account or password needed.

---

## Staff Tracking Link (no login)

These use the `trackLinkToken` from staff creation, not a user token.

**GET /api/track/:linkToken**
Returns the staff member's name and their currently-active bookings
(`accepted` / `in_progress`).

**POST /api/track/:linkToken/location**
Body: `{ lat, lng }` — updates the staff member's live location, which
customers see via `GET /api/bookings/:id/location`.

**POST /api/track/:linkToken/bookings/:id/start**
Body: `{ lat, lng }` — marks booking `in_progress`, captures start location.

**POST /api/track/:linkToken/bookings/:id/complete**
Body: `{ lat, lng }` — marks booking `completed`, captures end location.

---

## Example: full flow with curl

```bash
# Customer registers and books
curl -X POST localhost:3000/api/auth/register -d '{"name":"Ravi","phone":"9999999999","password":"pass123"}' -H 'Content-Type: application/json'
curl -X POST localhost:3000/api/bookings -H "Authorization: Bearer <token>" -d '{"vehicleType":"car","serviceType":"full wash","address":"123 MG Road"}' -H 'Content-Type: application/json'

# Admin sets up and assigns
curl -X POST localhost:3000/api/admin/bootstrap -d '{"username":"admin","password":"adminpass"}' -H 'Content-Type: application/json'
curl -X POST localhost:3000/api/admin/staff -H "Authorization: Bearer <admin_token>" -d '{"name":"Suresh","phone":"8888888888"}' -H 'Content-Type: application/json'
curl -X PATCH localhost:3000/api/admin/bookings/1 -H "Authorization: Bearer <admin_token>" -d '{"status":"accepted","staffId":1,"price":299}' -H 'Content-Type: application/json'

# Staff (no login) updates location and starts/completes the wash
curl -X POST localhost:3000/api/track/<link>/location -d '{"lat":12.91,"lng":77.61}' -H 'Content-Type: application/json'
curl -X POST localhost:3000/api/track/<link>/bookings/1/start -d '{"lat":12.91,"lng":77.61}' -H 'Content-Type: application/json'
curl -X POST localhost:3000/api/track/<link>/bookings/1/complete -d '{"lat":12.92,"lng":77.62}' -H 'Content-Type: application/json'
```

## Known gaps to fill before production

- Password/token secret: set `JWT_SECRET` env var (defaults to a dev value).
- Real PhonePe integration (currently stubbed).
- Real database instead of the JSON file (fine for dev/demo, not for
  concurrent production traffic).
- Push notifications for booking status changes.
- Rate limiting / input validation hardening.
