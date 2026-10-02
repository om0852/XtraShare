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
