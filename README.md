# ZLG Tracker

Dashboard tracking responses from German vehicle registration offices (Zulassungsstellen) on whether a self-employed transfer driver — without a vehicle dealership in the trade registration — would be issued a red dealer plate (rotes Dauerkennzeichen).

Static frontend (Leaflet map + filterable table) hosted on Cloudflare Pages, with two Pages Functions:

- `/api/overrides` — GET/PUT status overrides, persisted in Cloudflare KV.
- `/api/lgm/messages?leadId=…` — proxies La Growth Machine API to fetch the conversation thread for a lead. Caches per-campaign message lists in KV.

## Deploy

One-time setup:

```bash
# 1) Log in to Cloudflare
wrangler login

# 2) Create the project from this directory
wrangler pages project create zlg --production-branch main

# 3) Create the KV namespaces and paste the ids into wrangler.toml
wrangler kv namespace create OVERRIDES
wrangler kv namespace create OVERRIDES --preview

# 4) Set the LGM API key as a secret (paste when prompted)
wrangler pages secret put LGM_API_KEY --project-name zlg

# (optional) Pin specific LGM campaign ids to scan, comma-separated
# wrangler pages secret put LGM_CAMPAIGN_IDS --project-name zlg
```

Subsequent deploys happen automatically on `git push` once the Pages project is connected to the GitHub repo (do this once via the Cloudflare dashboard → Pages → Settings → Build & deployments → Connect to Git).

## Local development

```bash
# Put LGM key in .dev.vars (gitignored)
echo 'LGM_API_KEY = "your-key"' > .dev.vars

# Run with Functions + KV emulation
wrangler pages dev . --kv OVERRIDES
```

Open http://localhost:8788 — Functions live at `/api/...`.

## Rebuilding `data.json`

The CSV → JSON pipeline lives in `data/`:

```bash
python3 data/geocode.py   # Geocode unique Landkreise (rate-limited Nominatim)
python3 data/build.py     # Combine CSV + cache + classifications → data.json
```
