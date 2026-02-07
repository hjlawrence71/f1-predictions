# Deploy To Railway (Persistent)

## 1) Push this folder to GitHub

```bash
cd "/Users/harrisonlawrence/Documents/F1 Picks Hub"
git push -u origin main
```

## 2) Create Railway project
- Open https://railway.com/new
- Choose **Deploy from GitHub repo**
- Select `hjlawrence71/f1-predictions`

## 3) Add persistent volume
- In Railway service: **Volumes** -> **Add Volume**
- Mount path: `/app/data`

## 4) Set environment variable
- In Railway service: **Variables**
- Add `DATA_DIR=/app/data`

## 5) Verify health
- Open `<your-service-url>/health`
- Expect JSON with `"ok": true`

## Notes
- `scripts/preflight.mjs` now seeds `schedule_2026.json` and `current_grid.json` into `/app/data` on first boot.
- The app keeps writing picks/results into `/app/data/db.json` and backups into `/app/data/backups`.
