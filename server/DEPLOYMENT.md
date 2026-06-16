# Server — Build & Deployment

## Tech Stack

- **Runtime:** Node.js + Express 5
- **Language:** TypeScript (compiled with `tsc`)
- **Database:** MongoDB (Mongoose ODM)
- **Services:** Firebase Admin, Twilio, Resend, Cloudinary, Anthropic AI

## Local Development

```bash
# From project root
npm run dev:server

# Or from server/
npm run dev
```

Runs on `http://localhost:3002` with hot-reload via `tsx watch`.

## Environment Variables

Copy `.env.example` to `.env` and fill in values:

| Variable | Description |
|---|---|
| `PORT` | Server port (default: `3002`) |
| `MONGO_URI` | MongoDB connection string |
| `JWT_SECRET` | Secret key for JWT token signing **(required)** |
| `CORS_ALLOWED_ORIGINS` | Comma-separated allowed origins **(required in production)** |
| `ANTHROPIC_API_KEY` | Anthropic API key (AI Legal Assistant) **(required)** |
| `RESEND_API_KEY` | Resend API key (email) **(required)** |
| `FROM_EMAIL` | Sender email address |
| `TWILIO_ACCOUNT_SID` | Twilio account SID (SMS) **(required)** |
| `TWILIO_AUTH_TOKEN` | Twilio auth token **(required)** |
| `TWILIO_PHONE_NUMBER` | Twilio sender phone number |
| `FIREBASE_SERVICE_ACCOUNT` | Firebase service account JSON (single line) |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name for uploads |
| `CLOUDINARY_API_KEY` | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret |
| `REDIS_URL` | Optional Redis-compatible cache URL |
| `PUBLIC_BASE_URL` | Public-facing base URL for email links and webhooks |
| `PAYMENTS_PROVIDER_MODE` | `simulated` (default) or `live` |

## Build

```bash
npm run build
```

Compiles TypeScript to `dist/`.

## Production Start

```bash
npm start
```

Runs `node dist/index.js`.

## Deploy to Render (Native)

### Setup

1. Create a new **Web Service** on [Render](https://render.com)
2. Connect your GitHub repository
3. Configure:

| Setting | Value |
|---|---|
| **Root Directory** | `server` |
| **Build Command** | `npm install && npm run build` |
| **Start Command** | `npm start` |
| **Runtime** | Node |

### Environment Variables

Add all variables from `.env.example` in the Render dashboard under **Environment**.

Make sure `MONGO_URI` points to your production MongoDB instance (e.g., MongoDB Atlas).

### Auto-Deploy

Render auto-deploys on push to `main` by default. You can disable this under **Settings > Auto-Deploy**.

### Health Check

Render will monitor your service. Ensure your server responds on the configured `PORT`.

## Deploy to Render (Docker)

Use the included `Dockerfile` at the project root for containerized deployment.

### Blueprint Free Deployment

The root `render.yaml` deploys one Render **Free** Docker web service and does not create a Render database. During Blueprint setup, paste your MongoDB Atlas Free cluster connection string into the prompted `MONGO_URI` secret and provide the other prompted values from `server/.env`. Do not commit the Atlas URL or any other secret to Git.

1. Create a new **Web Service** on Render
2. Select **Docker** as the runtime
3. Set the **Root Directory** to `/` (project root)
4. Render will automatically detect and build the `Dockerfile`

Required environment variables are the same as above.

## Docker Compose (Local)

Run the full stack locally with Docker Compose:

```bash
# Set required secrets
cp server/.env.example .env
# Edit .env and set JWT_SECRET, ANTHROPIC_API_KEY, RESEND_API_KEY, etc.

# Start services
docker compose up --build

# The API will be available at http://localhost:3002
# MongoDB will be available at mongodb://localhost:27017
```

To stop:
```bash
docker compose down
```

To stop and remove volumes:
```bash
docker compose down -v
```

## Database

### Seeding

```bash
npm run reseed
```

Runs `src/reseed.ts` to seed the database with initial data.

### MongoDB Atlas (Production)

1. Create a free M0 cluster at [mongodb.com/atlas](https://www.mongodb.com/atlas)
2. Whitelist `0.0.0.0/0` for Render access (or use Render's static IPs)
3. Copy the connection string to `MONGO_URI`

## Graceful Shutdown

The server handles `SIGTERM` and `SIGINT` signals for graceful shutdown:
1. Stops accepting new HTTP connections
2. Closes MongoDB connection
3. Exits with code 0

A 10-second timeout forces exit if shutdown hangs.
