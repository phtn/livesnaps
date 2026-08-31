# base

A [Beast](https://www.npmjs.com/package/beast-tsrx) project powered by
[TSRX](https://tsrx.dev/) and [Octane](https://octanejs.dev/).

```bash
bun install
bun run dev
```

Edit `src/App.btsx` to get started. Declare typed props at the top of the BTSX
file; the Beast Vite plugin compiles it into native TSRX and then lets Octane
produce the browser module.

## Worker configuration

The snap-session endpoint reverse-geocodes the device location on the server.
Set these values before running the full Worker locally or deploying it:

```bash
# Local development: keep these in .env or .dev.vars (never commit them).
MAPBOX_ACCESS_TOKEN=pk....
IPINFO_LITE_TOKEN=....
R2_ACCOUNT_ID=....
R2_ACCESS_KEY_ID=....
R2_SECRET_ACCESS_KEY=....
R2_BUCKET_NAME=livesnaps
```

For the deployed Cloudflare Worker, add them as secrets (the local `.env` is
not uploaded during deployment):

```bash
bunx wrangler secret put MAPBOX_ACCESS_TOKEN --name livesnaps
bunx wrangler secret put IPINFO_LITE_TOKEN --name livesnaps
bunx wrangler secret put R2_ACCOUNT_ID --name livesnaps
bunx wrangler secret put R2_ACCESS_KEY_ID --name livesnaps
bunx wrangler secret put R2_SECRET_ACCESS_KEY --name livesnaps
```

After changing a secret, redeploy or restart the local Worker. The browser
client must call the Worker started by `bun run dev`; `bun run dev:client`
only serves the frontend assets.
