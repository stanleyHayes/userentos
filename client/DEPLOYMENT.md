# Client — Build & Deployment

## Tech Stack

- **Framework:** React 19 + Vite 8
- **Styling:** Tailwind CSS v4 + MUI v7
- **Routing:** React Router v7
- **State:** Zustand + TanStack Query

## Local Development

```bash
# From project root
npm run dev:client

# Or from client/
npm run dev
```

Runs on `http://localhost:5173`. API requests to `/api` are proxied to `http://localhost:3002`.

## Environment Variables

| Variable | Description | Dev | Production |
|---|---|---|---|
| `VITE_API_URL` | Backend API URL | `/api` (uses Vite proxy) | `https://api.rentos.gh/api` |
| `VITE_SOCKET_URL` | WebSocket URL | `http://localhost:5002` | `https://api.rentos.gh` |

**Files:**
- `.env` — local development overrides
- `.env.production` — production values (used by `vite build`)
- `.env.example` — template

## Build

```bash
npm run build
```

Runs `tsc -b && vite build`. Output goes to `dist/`.

## Preview Production Build

```bash
npm run preview
```

## Deploy to Vercel

### Setup

1. Go to [vercel.com](https://vercel.com) and import your GitHub repository
2. Configure:

| Setting | Value |
|---|---|
| **Root Directory** | `client` |
| **Framework Preset** | Vite |
| **Build Command** | `npm run build` |
| **Output Directory** | `dist` |

### Environment Variables

Add in the Vercel dashboard under **Settings > Environment Variables**:

- `VITE_API_URL` = `https://your-render-server.onrender.com/api`
- `VITE_SOCKET_URL` = `https://your-render-server.onrender.com`

### SPA Routing

`vercel.json` is already configured with a catch-all rewrite so client-side routing works:

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/" }]
}
```

### Custom Domain

1. In Vercel dashboard: **Settings > Domains**
2. Add your domain and update DNS records as instructed

### Auto-Deploy

Vercel auto-deploys on push to `main`. Preview deployments are created for PRs.

## Deploy via CLI

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy preview
vercel

# Deploy production
vercel --prod
```
