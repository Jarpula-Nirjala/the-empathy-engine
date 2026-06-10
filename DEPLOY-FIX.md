# Fix wrong site on Render — deploy verification

Your GitHub repo has the **correct professional UI** (same as localhost:8000).
If Render shows the old "Vivek Gautam / AI Emotion Voice Generator" page, Render is **NOT running your GitHub code**.

## Quick test

Open these URLs (replace with your Render URL):

```
https://the-empathy-engine.onrender.com/health
https://the-empathy-engine.onrender.com/api/version
```

| Result | Meaning |
|--------|---------|
| `/health` → `{"status":"ok",...}` | Correct FastAPI app is live |
| `/health` → **404** | Wrong old app is still running |
| `/api/version` → `"ui":"professional-v2"` | Correct website deployed |

---

## Fix (do this in Render Dashboard)

### Step 1 — Check connected repo

**Settings → Build & Deploy → Repository**

Must be: `Jarpula-Nirjala / the-empathy-engine`  
Branch: `main`

If it shows a different repo or user, click **Disconnect** and reconnect the correct repo.

### Step 2 — Switch to Docker

**Settings → Build & Deploy → Environment**

| Setting | Required value |
|---------|----------------|
| **Environment** | **Docker** (NOT Python 3) |
| **Dockerfile Path** | `Dockerfile` |
| **Docker Context** | `.` |
| **Build Command** | *(empty)* |
| **Start Command** | *(empty)* |

If Environment is **Python 3**, Render runs old/wrong code and ignores your static frontend.

### Step 3 — Clear root directory

**Root Directory** must be **empty** (not `src` or any subfolder).

### Step 4 — Redeploy

**Manual Deploy → Deploy latest commit**

Wait for build to finish. Then test `/api/version` again.

---

## If still wrong: create a fresh service

1. **New → Web Service**
2. Connect `Jarpula-Nirjala/the-empathy-engine`
3. Environment: **Docker**
4. Instance: **Standard (2 GB RAM)**
5. Deploy

Use the **new URL** Render gives you (e.g. `the-empathy-engine-xxxx.onrender.com`).

Delete or suspend the old service that shows the Vivek Gautam page.

---

## What the correct site looks like

- Dark rose/mocha theme
- Navbar: Studio, Analysis, Features, Pipeline, FAQ
- Hero: "The Empathy Engine" with feature pills
- Charts, A/B compare, emotion picker
- **No** "Vivek Gautam" in the header
