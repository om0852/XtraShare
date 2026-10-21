# XtraShare Free Deployment & Hosting Guide

XtraShare is engineered as a zero-database, lightweight single container that can be deployed completely for free across multiple cloud platforms or self-hosted locally on your private Wi-Fi / LAN network.

---

## 🚀 Option 1: 100% Free Cloud Deployment on Render

Render provides free hosting for Web Services with automatic HTTPS, custom domains, and native WebSocket support.

### Steps:
1. Fork or push this repository to your **GitHub** account.
2. Sign in to [Render.com](https://render.com) (free account).
3. Click **New +** -> **Blueprint**.
4. Connect your GitHub repository.
5. Render will automatically detect [`render.yaml`](../render.yaml) and configure the web service:
   - **Environment**: Docker
   - **Plan**: Free
   - **Port**: 3000
   - **Health Check**: `/api/health`
6. Click **Apply**.
7. In ~3 minutes, your XtraShare instance will be live at `https://your-app-name.onrender.com`!

---

## 🚂 Option 2: Free / Hobby Deployment on Railway

Railway allows instant deployment from GitHub using our pre-configured [`railway.json`](../railway.json) and [`Dockerfile`](../Dockerfile).

### Steps:
1. Go to [Railway.app](https://railway.app).
2. Click **New Project** -> **Deploy from GitHub repo**.
3. Select your XtraShare repository.
4. Railway will automatically pick up the root `Dockerfile`.
5. Under service settings, add variable:
   - `PORT=3000`
   - `SSL_ENABLED=false` (Railway provides automatic SSL termination at their proxy edge)
6. Click **Deploy**. Your app is live!

---

## 🪰 Option 3: Free Deployment on Fly.io

Fly.io provides a generous free allowance (up to 3 shared-cpu VMs and 256MB RAM each).

### Steps:
1. Install flyctl:
   ```bash
   # Windows PowerShell
   iwr https://fly.io/install.ps1 -useb | iex
   # macOS/Linux
   curl -L https://fly.io/install.sh | sh
   ```
2. Log in:
   ```bash
   fly auth login
   ```
3. Launch from the project root:
   ```bash
   fly launch
   ```
   (Say **Yes** to using the existing `fly.toml` configuration)
4. Deploy:
   ```bash
   fly deploy
   ```

---

## 🤗 Option 4: Free Docker Deployment on Hugging Face Spaces

Hugging Face provides 100% free CPU containers (2 vCPU, 16GB RAM) that can run any Dockerfile with public URL access.

### Steps:
1. Create a new Space at [huggingface.co/spaces](https://huggingface.co/spaces).
2. Space SDK: Select **Docker** -> **Blank**.
3. Clone the space repo locally, copy this project's contents into it, and push to Hugging Face:
   ```bash
   git remote add space https://huggingface.co/spaces/<your-username>/<your-space-name>
   git push space main
   ```
4. Hugging Face builds the Docker container and serves it publicly for free!

---

## 🐙 Option 5: Automated GitHub Actions CI/CD & GitHub Container Registry (GHCR)

XtraShare includes an automated `.github/workflows/ci-cd.yml` workflow:

### What it does automatically on every `git push`:
1. **Automated CI:** Runs the entire test suite and compiles all monorepo workspaces.
2. **Multi-Architecture Docker Build:** Builds `linux/amd64` (standard cloud/PC) and `linux/arm64` (Raspberry Pi / Apple Silicon).
3. **Automated Publishing:** Publishes the container image to GitHub Container Registry (`ghcr.io`).

### Run the published image anywhere:
```bash
docker run -d \
  --name xtrashare \
  --restart unless-stopped \
  -p 3000:3000 \
  ghcr.io/<your-github-username>/xtrashare:latest
```

---

## 🐳 Option 5: Self-Hosting with Docker & Docker Compose

For private home lab, NAS, or Raspberry Pi self-hosting:

### Quick Run with Docker:
```bash
# Build local image
docker build -t xtrashare:latest .

# Run container on LAN
docker run -d \
  --name xtrashare \
  --restart unless-stopped \
  -p 3000:3000 \
  -e SSL_ENABLED=true \
  xtrashare:latest
```

### Run with Docker Compose:
```bash
docker compose up -d
```
Visit `https://<YOUR_LOCAL_IP>:3000` from any device on your local Wi-Fi!

---

## 💻 Option 6: Direct Local Execution (Node.js)

To run directly on your host machine without Docker:

```bash
# 1. Install dependencies
npm install

# 2. Build protocol, server, and web
npm run build

# 3. Start production server
npm start
```
The server will print local and LAN IP addresses alongside a terminal QR code ready for instant mobile scanning!

---

## ⚠️ Public / Cloud Deployment: You Need a TURN Server

XtraShare's WebRTC layer ships with **STUN-only** ICE servers by default
(`packages/protocol/src/constants.ts`). STUN is enough to discover your own
public IP/port, but it **cannot relay traffic** when two peers sit behind
different, restrictive/symmetric NATs — which is the normal case once your
two devices aren't on the same LAN (e.g. one is on home WiFi, the other on
mobile data, talking through your Render/Railway/Fly deployment).

Without TURN, that direct P2P negotiation simply times out, and the app
silently falls back to streaming the actual file bytes through the
signaling server's WebSocket relay (`startSendingChunksViaRelay`). That is
why a cloud deployment can look like it's "sending over the internet /
through the server" and feels slow and bandwidth-capped — it genuinely is
going through the server, consuming *your* server's bandwidth and CPU,
instead of a direct peer-to-peer stream. On a LAN, the same code gets a
fast `host` ICE candidate and never hits this path, which is why it "works
fine locally".

### Fix: add a TURN server

1. Get TURN credentials — free/cheap options:
   - [Metered.ca](https://www.metered.ca/tools/openrelay/) (free tier, quick signup)
   - [Twilio Network Traversal Service](https://www.twilio.com/docs/stun-turn)
   - Self-hosted [coturn](https://github.com/coturn/coturn) on a small VPS
2. Set these build-time env vars for the `apps/web` Vite build (e.g. in
   Render/Railway/Fly's dashboard, or a `.env` file read by Vite):
   ```
   VITE_TURN_URL=turn:your-turn-host:3478
   VITE_TURN_USERNAME=your-username
   VITE_TURN_CREDENTIAL=your-credential
   ```
   (`VITE_TURN_URL` accepts a comma-separated list, e.g. a `turn:` + `turns:` pair.)
3. Rebuild/redeploy. The web client (`apps/web/src/services/webrtc.ts`) will
   automatically add this TURN server to its ICE configuration. Real P2P (or
   TURN-relayed, which is still far better than the app-level WebSocket
   relay — it's a dedicated media-relay protocol, not JSON/base64 chunk
   messages bouncing through your Node process) will then work across the
   public internet.

If you never configure a TURN server, XtraShare will log a console warning
on non-LAN hostnames and keep working — just via the slower WebSocket relay
fallback — so it degrades gracefully but is **not a substitute for TURN**
if you expect good throughput between devices on different networks.

---

## Large-file downloads require HTTPS (a secure context)

Receiving very large files (multi-GB) streams the assembled file straight
to disk via a dedicated Service Worker (`apps/web/public/sw-download.js`,
`apps/web/src/services/streamDownload.ts`) instead of holding the whole
file in page memory — this is what prevents mobile Chrome from crashing
("Aw, Snap!") right at 100% on big transfers. Service Workers only run in a
**secure context**: HTTPS, or `http://localhost`. XtraShare's server has
`ENABLE_HTTPS=true` by default for exactly this reason (it also self-signs
a certificate — accept the browser's certificate warning once per device).
If you deploy behind a reverse proxy, make sure it terminates/forwards
HTTPS and that devices load the app over `https://`, not plain `http://`
by LAN IP — otherwise the app silently falls back to the older in-memory
Blob download, which can still run out of memory on very large files on
constrained (mobile) devices.
