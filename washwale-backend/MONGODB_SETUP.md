# MongoDB Atlas setup (replaces the JSON file database)

The backend now stores all data (users, staff, bookings, ratings, payments)
in MongoDB Atlas instead of a local JSON file, so nothing is lost when
Render restarts your free-tier service.

## 1. Add the environment variable on Render

Go to your `washwale-backend` service on Render → **Environment** tab →
**Add Environment Variable**:

- **Key**: `MONGODB_URI`
- **Value**: your Atlas connection string, e.g.
  ```
  mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/washwale?retryWrites=true&w=majority&appName=Cluster0
  ```

Save changes — Render will automatically redeploy with the new variable.

## 2. Network Access (Atlas side)

In MongoDB Atlas → **Network Access** → **Add IP Address** → choose
**Allow Access from Anywhere** (`0.0.0.0/0`). Render's outgoing IP isn't
fixed on the free plan, so this is required for the connection to work.

## 3. That's it

The very first request to the backend after deploy will auto-create the
database document with empty collections (same starting state as before).
No manual migration needed since you were only testing so far.

## Local development

If you also run the backend locally, create a `.env` file (or export the
variable in your shell) with the same `MONGODB_URI` before running
`npm start`, or the server will throw `MONGODB_URI is not set`.
