# Wave Storyboard

Drop a track, paste lyrics, get a director's storyboard — powered by Claude.

## Stack

- **Frontend**: React + Vite
- **Backend**: Cloudflare Pages Function (`/functions/api/generate.js`)
- **AI**: Anthropic Claude Sonnet via server-side proxy

---

## Deploy to Cloudflare Pages

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "init"
gh repo create wave-storyboard --public --push
# or: git remote add origin https://github.com/YOU/wave-storyboard && git push -u origin main
```

### 2. Connect to Cloudflare Pages

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** → **Create application** → **Pages**
2. Connect your GitHub repo
3. Build settings:
   - **Framework preset**: Vite
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`

### 3. Add your API key

In the Cloudflare Pages dashboard:
- Go to **Settings** → **Environment variables**
- Add: `ANTHROPIC_API_KEY` = `sk-ant-...` (mark as **Encrypted**)
- Add it under both **Production** and **Preview**

### 4. Deploy

Cloudflare will build and deploy automatically on every `git push`.

---

## Local Development

You need [Wrangler](https://developers.cloudflare.com/workers/wrangler/) to run the Pages Function locally.

```bash
npm install
cp .env.example .env.local
# Edit .env.local and add your real ANTHROPIC_API_KEY

# Terminal 1 — Vite dev server
npm run dev

# Terminal 2 — Wrangler Pages dev (runs the function on :8788)
npx wrangler pages dev dist --binding ANTHROPIC_API_KEY=sk-ant-...
```

Then open `http://localhost:5173`. Vite proxies `/api` → `:8788`.

---

## Project Structure

```
wave-storyboard/
├── functions/
│   └── api/
│       └── generate.js     ← Cloudflare Pages Function (API proxy)
├── src/
│   ├── App.jsx             ← Main React app
│   └── main.jsx            ← Entry point
├── public/
│   └── favicon.svg
├── index.html
├── vite.config.js
└── package.json
```
