# Deploy Worship Leader's Resource

Your app is ready to deploy. Choose one of the options below.

---

## Prerequisites

1. **GitHub** – Push your code to a GitHub repository.
2. **Environment variables** – You'll need these in your hosting platform:
   - `VITE_SUPABASE_URL` – `https://cpqenpsibznmswkiahhv.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` – Your Supabase anon key (from `.env`)

---

## Option 1: Vercel (recommended)

1. Go to [vercel.com](https://vercel.com) and sign in (use GitHub).
2. Click **Add New** → **Project**.
3. Import your GitHub repository.
4. Vercel will detect Vite. Confirm:
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
5. Add environment variables:
   - `VITE_SUPABASE_URL` → your Supabase URL
   - `VITE_SUPABASE_ANON_KEY` → your Supabase anon key
6. Click **Deploy**.
7. You’ll get a URL like `your-project.vercel.app`. You can add a custom domain in Project Settings → Domains.

---

## Option 2: Netlify

1. Go to [netlify.com](https://netlify.com) and sign in (use GitHub).
2. Click **Add new site** → **Import an existing project**.
3. Choose your GitHub repository.
4. Netlify will use `netlify.toml`. Confirm:
   - **Build command:** `npm run build`
   - **Publish directory:** `dist`
5. Add environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
6. Click **Deploy site**.
7. Add a custom domain in Site settings → Domain management.

---

## Option 3: Other (Cloudflare Pages, GitHub Pages, etc.)

1. Run `npm run build` locally.
2. The output is in the `dist/` folder.
3. Upload `dist/` to your host.
4. Configure:
   - All routes redirect to `/index.html` (for React Router).
   - Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as build-time env vars.

---

## Custom domain

- **Vercel:** Project Settings → Domains → Add.
- **Netlify:** Site settings → Domain management → Add custom domain.

If you use Vercel or Netlify, follow their DNS instructions for your registrar.
