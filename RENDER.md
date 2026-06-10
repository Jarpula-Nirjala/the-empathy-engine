# Deploy The Empathy Engine on Render (Docker)

## Why the build failed before

Render deployed commit `be8f4cd` which had **no Dockerfile**.  
The Dockerfile was added in commit `c555994`. You must redeploy the **latest** `main` branch.

---

## Step 1 — Verify GitHub has the Dockerfile

Open: https://github.com/Jarpula-Nirjala/the-empathy-engine/blob/main/Dockerfile

You should see the Docker build file at the repo root.

---

## Step 2 — Render service settings

Go to **Render Dashboard → the-empathy-engine → Settings**

| Setting | Value |
|---------|--------|
| **Environment** | **Docker** |
| **Branch** | `main` |
| **Region** | Oregon (US West) |
| **Root Directory** | *(empty)* |
| **Dockerfile Path** | `Dockerfile` |
| **Docker Context** | `.` |
| **Instance Type** | **Standard — 2 GB RAM ($25/mo)** |

Clear any **Build Command** and **Start Command** fields — Docker uses the Dockerfile instead.

**Health Check Path:** `/health`

---

## Step 3 — Environment variables

| Key | Value |
|-----|--------|
| `PYTHONUNBUFFERED` | `1` |
| `HF_HOME` | `/app/.cache/huggingface` |
| `TRANSFORMERS_CACHE` | `/app/.cache/huggingface` |
| `NLTK_DATA` | `/app/.cache/nltk` |
| `LOG_LEVEL` | `INFO` |

Render injects `PORT` automatically — do not set it manually.

---

## Step 4 — Redeploy latest commit

1. Go to **Manual Deploy** (top right)
2. Select **Deploy latest commit**
3. Wait **15–25 minutes** (first Docker build downloads PyTorch + emotion model)

---

## Step 5 — Verify

```bash
curl https://YOUR-SERVICE.onrender.com/health
```

Expected:
```json
{"status":"ok","model_loaded":true,"backend":"transformers"}
```

Open the site root `/` for the full UI.

---

## Alternative: Blueprint (one-click)

1. **New → Blueprint**
2. Connect `Jarpula-Nirjala/the-empathy-engine`
3. Render reads `render.yaml` and creates the service
4. Click **Apply**

---

## Troubleshooting

| Error | Fix |
|-------|-----|
| `open Dockerfile: no such file or directory` | Redeploy latest `main` — Dockerfile must exist on GitHub |
| Out of memory (OOM) | Upgrade to **Standard 2 GB** — not Free/Starter |
| Build timeout | Normal on first build; retry deploy |
| `model_loaded: false` | Check logs; ensure outbound internet for HuggingFace |
| Audio fails | gTTS needs internet; ffmpeg is bundled in Docker image |

---

## Local Docker test

```bash
docker build -t empathy-engine .
docker run -p 8000:8000 empathy-engine
```

Open http://localhost:8000
