# How to Get Cloudflare Turnstile Keys

To enable the captcha on your login page, you need keys from Cloudflare.

## 1. Get Keys from Cloudflare
1. Log in to the [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. Select **Turnstile** from the sidebar menu.
3. Click **Add Site**.
4. **Site Name**: Enter a name (e.g., "Sheets MySQL Sync").
5. **Domain**:
   - For local development, add: `localhost` AND `127.0.0.1`.
   - For production, add your actual domain.
6. **Widget Mode**: Select **Managed** (recommended).
7. Click **Create**.
8. Copy the **Site Key** and **Secret Key**.

## 2. Configure Your Project
Open `client/.env` and add the Site Key:

```env
VITE_TURNSTILE_SITE_KEY=0x4AAAAAA... (paste your Site Key here)
```

## 3. Configure Supabase (Backend)
To verify the captcha on the backend (optional but recommended for security):
1. Go to your [Supabase Dashboard](https://supabase.com/dashboard).
2. Navigate to **Project Settings** -> **Security & Protection** -> **Captcha Protection**.
3. Enable **"Enable Captcha Protection"**.
4. Provider: Select **Cloudflare Turnstile**.
5. Paste your **Secret Key** from Cloudflare (`0x4AAAAAA...`).
6. Click **Save**.

*Note: The app is currently configured to pass the token to `signUp`. If you enable it in Supabase, sign-ups without a valid token will fail.*
