# bolt-proxy

Cloudflare Worker that proxies Bolt widget requests to the Anthropic API.

## Deploy

```bash
cd bolt-proxy

# One-time login
wrangler login

# Store the API key as a secret
wrangler secret put ANTHROPIC_API_KEY
# paste your key when prompted

# Deploy
wrangler deploy
```

The Worker will be published at:
`https://bolt-proxy.<your-subdomain>.workers.dev`

After first deploy, update `WORKER_URL` in `/js/bolt-widget.js` to the printed URL and commit the change.

## Update the system prompt

Edit `src/worker.js` → `SYSTEM_PROMPT`, then `wrangler deploy`.
