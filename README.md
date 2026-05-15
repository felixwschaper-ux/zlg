# ZLG Tracker

Live: https://zlg-cqq.pages.dev

Dashboard tracking responses from German vehicle registration offices (Zulassungsstellen) on whether a self-employed transfer driver — without a vehicle dealership in the trade registration — would be issued a red dealer plate (rotes Dauerkennzeichen).

## What it does

- **Map + filterable table** of all 508 Zulassungsstellen, color-coded by classification.
- **Status overrides** persisted in Cloudflare KV — anyone with the URL can recategorize, edits sync to all viewers.
- **LGM conversation thread** per office: outbound campaign template + first reply (from CSV) + any follow-up messages received via webhook.
- **Send replies** directly from the modal via LGM's `/inbox/email` endpoint.
- **Auto-classification** of new replies via Claude (Haiku 4.5) — webhook-triggered.

## Architecture

```
GitHub repo (felixwschaper-ux/zlg)
        │
        └── auto-deploys to ──► Cloudflare Pages (zlg-cqq.pages.dev)
                                     │
                                     ├── static frontend (index.html, data.json)
                                     └── Pages Functions (/functions/api/…)
                                              │
                                              ├── /api/overrides       — status edits (KV)
                                              ├── /api/lgm/messages    — per-lead thread (KV cache + LGM template)
                                              ├── /api/lgm/send        — POST → LGM /inbox/email
                                              ├── /api/lgm/webhook     — receives LGM inbox events → KV
                                              ├── /api/lgm/setup-webhook — one-time webhook registration
                                              └── /api/classify        — Claude API → status override
```

## Pages Functions

| Path | Method | Purpose |
|---|---|---|
| `/api/overrides` | GET / PUT | List or upsert status overrides. Stored in `OVERRIDES` KV under key `overrides:v1`. |
| `/api/lgm/messages?leadId=X` | GET | Returns campaign template + per-lead messages stored from webhooks. |
| `/api/lgm/send` | POST | Sends an email via LGM. Body: `{leadId, message, subject?}`. |
| `/api/lgm/webhook` | POST | LGM-registered receiver. Stores incoming messages per leadId, fires classify. |
| `/api/lgm/webhook` | GET | Inspect last 20 received events (debug). |
| `/api/lgm/setup-webhook` | POST | Registers this site's webhook URL in LGM (idempotent). |
| `/api/classify` | POST | Sends a conversation to Claude, writes status override. No-op without `ANTHROPIC_API_KEY`. |

## Deployment

Already done. To redeploy after editing:

```bash
git add . && git commit -m "…" && git push
wrangler pages deploy . --project-name zlg --branch main
```

(Pages can also auto-deploy on push if you connect GitHub via the Cloudflare dashboard → Pages → Settings → Git integration.)

## One-time setup that's already done

1. ✅ Cloudflare project `zlg` created
2. ✅ KV namespace `OVERRIDES` (production + preview) created and bound in `wrangler.toml`
3. ✅ Secret `LGM_API_KEY` set
4. ✅ Webhook registered in LGM (id `dfdc65b9-…`)

## Optional next step — enable auto-classification

The `/api/classify` endpoint silently no-ops until you add an Anthropic API key:

```bash
wrangler pages secret put ANTHROPIC_API_KEY --project-name zlg
# paste your key when prompted
```

After that, every new inbound webhook event will trigger Claude to re-classify the conversation and update the status override automatically. You can still manually recategorize anytime — manual edits override auto-classifications.

## Optional next step — restrict who can send

Anyone with the dashboard URL can currently send emails via LGM. To restrict:

```bash
wrangler pages secret put SHARED_PASSWORD --project-name zlg
```

Then frontend send requests need an `X-Auth: <password>` header (frontend doesn't pass one yet — would need a small UI change to prompt for the password).

## Rebuilding `data.json`

The CSV → JSON pipeline lives in `data/`:

```bash
python3 data/geocode.py   # Geocode unique Landkreise (rate-limited Nominatim)
python3 data/build.py     # Combine CSV + cache + classifications → data.json
```
