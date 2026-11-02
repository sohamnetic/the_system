# Setup

Everything here runs on free plans, and no step needs a payment card. Parts 1 to 3 give you a working app with logins. Parts 4 to 7 are optional.

## 1. Logins and saving (Supabase)

1. Create a free project at https://supabase.com.
2. Open **SQL Editor**, then paste and **Run** each file in `supabase/migrations/`, in order.
3. Open **Project Settings > API** and copy the **Project URL** and the **anon public** key.
4. Put them in `public/config.js` as `supabaseUrl` and `supabaseAnonKey`.
5. Open **Authentication > Sign In / Providers > Email** and turn off **Confirm email**. Supabase's built-in email only reaches your own team, so other people could not confirm their accounts. Part 6 lets you turn this back on.

Never put the **service_role** key in `config.js`.

## 2. A public link (Cloudflare Pages)

1. Create a free account at https://dash.cloudflare.com.
2. Publish the app. The first run asks you to sign in:

```bash
npx wrangler pages deploy public --project-name the-system
```

3. In Supabase, open **Authentication > URL Configuration**. Set **Site URL** to your new `pages.dev` link and add the same link under **Redirect URLs**.
4. Open the link on your phone. On Android, tap **Install the app** in the Quests tab or use the browser menu. On iPhone, open it in Safari, tap Share, then **Add to Home Screen**.

Run the same command again whenever you change the app.

## 3. Keep it awake (cron-job.org)

Free Supabase projects pause after 7 days with no activity, which would lock everyone out until you resume the project by hand.

1. Create a free account at https://cron-job.org.
2. Add a job that runs once a day with this URL, using your project's code:
   `https://YOUR_PROJECT_REF.supabase.co/rest/v1/player_docs?select=key&limit=1`
3. Under the job's advanced settings, add a header named `apikey` with your **anon public** key as its value.
4. Run the job once and confirm it returns status 200.

## 4. Notifications (recommended)

1. Create the keys that identify your app:

```bash
npx web-push generate-vapid-keys
```

2. Put the **public** key in `public/config.js` as `vapidPublicKey`. Keep the private key secret.
3. Connect this folder to Supabase. `YOUR_PROJECT_REF` is the code in your Supabase project's URL:

```bash
npx supabase login
```

```bash
npx supabase link --project-ref YOUR_PROJECT_REF
```

4. Save the secrets. Choose your own long random `CRON_SECRET`:

```bash
npx supabase secrets set VAPID_PUBLIC_KEY=YOUR_PUBLIC_KEY VAPID_PRIVATE_KEY=YOUR_PRIVATE_KEY VAPID_SUBJECT=mailto:YOUR_EMAIL CRON_SECRET=YOUR_LONG_RANDOM_SECRET
```

5. Publish the reminder function:

```bash
npx supabase functions deploy send-reminders --no-verify-jwt
```

6. In the Supabase **SQL Editor**, run this with your own values:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule('system-reminders', '*/15 * * * *', $$
  select net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object('x-cron-secret', 'YOUR_LONG_RANDOM_SECRET')
  )
$$);
```

7. Publish the app again, then select **Turn on notifications** in the Quests tab.

This job also deletes any photos left over from before the app stopped storing them.

## 5. Google sign-in (optional, recommended for other people)

Google sign-in sends no email, and people who use it can't forget a password.

1. In Google Cloud Console, create an OAuth client of type **Web application**.
2. Add the redirect link shown in Supabase under **Authentication > Providers > Google**.
3. Paste the Google client ID and secret into that Supabase page and enable the provider.
4. Set `googleEnabled: true` in `public/config.js`, then publish again.

## 6. Sign-in emails (optional)

Without this, people who sign up with a password can't recover a forgotten password.

1. Create a free account at https://www.brevo.com and copy your SMTP details.
2. Enter them in Supabase under **Authentication > SMTP Settings**.
3. Turn **Confirm email** back on if you want it.
4. Set `emailEnabled: true` in `public/config.js`, then publish again.

## 7. AI (optional)

**Without this, the app still works.** Built-in rules choose Daily Orders, nothing looks at the proof, and new photos and write-ups count as Submitted at 80% XP.

On Google's free tier, what people send can be used to improve Google's products. Do not enable anything here if that isn't acceptable to you and your users.

**AI-written Daily Orders (text only):**

1. Create a free key at https://aistudio.google.com. Do not turn on billing for that project.
2. Save the key and publish the function:

```bash
npx supabase secrets set GEMINI_API_KEY=YOUR_KEY
```

```bash
npx supabase functions deploy ai
```

3. Set `plannerAi: true` in `public/config.js`, then publish again. Each person must still opt in under **Tell the System** in the Quests tab. Their goals, obstacles, life areas, quest titles and completion rates are sent once a day. Names, emails, photos, write-ups and body data are not.

**AI proof checks (sends photos to Google):**

Set the `AI_ALLOW_IMAGES` secret to `true`, then set `aiEnabled: true` in `public/config.js` and publish again. The function refuses every image until that secret is set. The app tells people each time a photo will be sent.

Each person gets 10 AI calls a day. Change that with the `AI_DAILY_LIMIT` secret. When the free quota runs out, proof counts as Submitted until it resets, so nobody gets stuck.

## Before you invite other people

- **Free plan size:** expect the free limits to hold for a small group. Check your usage in the Supabase dashboard as people join. Supabase will not charge you on the free plan; it restricts the project when you go over.
- **Hosting choice:** Cloudflare Pages is used here instead of Vercel, because sources report that Vercel's free plan is limited to personal, non-commercial use.
- **Account deletion:** there is no delete-account button yet. To remove someone, delete them under **Authentication > Users**, which also removes their saved progress.
- **Bringing in old progress:** in the earlier claude.ai version, select **Export my data**. In this app, use the import field in the Quests tab. Proof photos do not carry over.

