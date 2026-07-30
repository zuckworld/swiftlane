# Courier Tracker Demo

Static demo app for courier tracking (HTML/CSS/JS). This repository is ready to deploy to Vercel as a static site.

Quick start

1. Git (recommended)

```bash
git init
git add .
git commit -m "Initial courier tracker demo"
# create a remote on GitHub and push
git remote add origin git@github.com:<you>/<repo>.git
git push -u origin main
```

2. Deploy to Vercel (web)

- Log in to https://vercel.com and choose "New Project" → Import Git Repository.
- Choose the repository you pushed. For Framework Preset choose "Other" or "Static Site".
- Leave the Build Command empty and set Output Directory to `/` (root). Deploy.

3. Deploy via Vercel CLI

```bash
npm i -g vercel
vercel login
vercel   # follow prompts
vercel --prod   # for a production deploy
```

Configuration

- `vercel.json` is included and enables `cleanUrls` and rewrites so path-like routes such as `/details/JSQRW010202` map to `details.html?id=JSQRW010202`.

Notes

- No server-side build is required; this is a plain static site.
- If you use a custom domain, add it in the Vercel dashboard and follow DNS instructions.
