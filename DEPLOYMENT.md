# Deploying TimeBolt to GitHub Pages

The build is fully static (`dist/` after `npm run build`) and uses relative asset paths (`base: './'` in `vite.config.ts`) plus hash-based routing, so it works at any URL — including project pages like `https://<user>.github.io/<repo>/` — with no extra configuration.

## Option A — automatic with GitHub Actions (recommended)

The repo already contains `.github/workflows/deploy.yml`. One-time setup:

1. Create a GitHub repository and push this folder to the `main` branch:

   ```bash
   git init
   git add .
   git commit -m "TimeBolt v1"
   git branch -M main
   git remote add origin https://github.com/<user>/<repo>.git
   git push -u origin main
   ```

2. In the repo on github.com, go to **Settings → Pages** and set **Source** to **GitHub Actions**.

3. Done. Every push to `main` builds and deploys. The first run starts immediately after the push; the URL appears under **Settings → Pages** (typically `https://<user>.github.io/<repo>/`).

## Option B — manual, no Actions

```bash
npm run build
```

Then either:

- **gh-pages branch:** `npx gh-pages -d dist` (installs the `gh-pages` helper on first use), then in **Settings → Pages** set Source to *Deploy from a branch* → `gh-pages` → `/ (root)`.
- **Any static host:** upload the contents of `dist/` to Netlify, Cloudflare Pages, an S3 bucket, etc.

## After deploying

Open the site once on each device you'll use. Remember that data is per-browser — use Settings → JSON backup to move data between your laptop and phone. Tracking works fully offline after the first load of the page in a session.

## Troubleshooting

- **Blank page:** confirm Pages is serving the *built* output (Actions workflow or `gh-pages` branch), not the raw source. The source `index.html` references `/src/main.tsx`, which only works through Vite.
- **404 on refresh:** can't happen with hash routing (`#/week`), but if you fork this into a different router, switch back to hash mode for Pages.
- **Old version after deploy:** hard-refresh; Pages' CDN can cache `index.html` for a few minutes.
