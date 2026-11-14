# Deploy Unblock on Vercel (Hobby plan, private GitHub repo)

About 10 minutes. You need: the GitHub account that owns the private `unblock` repo, your Exa API key,
your Anthropic API key, and a passcode you make up for live runs.

## What happens on Vercel

- **Saved demos always work, for everyone.** The three example links on the homepage (`/?demo=marta`,
  `/?demo=brazil`, `/?demo=india`) replay from the `demo-cache/` folder in the repo. They make no paid API
  calls and need no passcode.
- **Live runs need the passcode** when `LIVE_PASSCODE` is set. A visitor who types their own sentence sees
  a small "Passcode" field and links to the demos. The server checks the passcode in `/api/run`.
- **Nothing is written to disk.** Live runs call Exa and Claude directly (no cache). Calendar files and
  watched plans are kept in the function's temporary folder, so they can disappear between visits.

## 1. Create the project

1. Go to <https://vercel.com> and click **Sign Up** (or **Log In**). Choose **Continue with GitHub**.
2. Pick the **Hobby** plan if you're asked.
3. On the dashboard, click **Add New…** (top right), then **Project**.
4. Under **Import Git Repository**, find `unblock` and click **Import**.
   - Not in the list? Click **Adjust GitHub App Permissions →**, choose your account, and under
     **Repository access** select **Only select repositories** → `unblock` → **Save**. Then go back and
     click **Import**.
5. On the **Configure Project** screen, leave these as they are:
   - Framework Preset: **Next.js** (detected automatically)
   - Root Directory: `./`
   - Build and Output Settings: the defaults (`next build`)

## 2. Add the environment variables (before the first deploy)

Still on **Configure Project**, open **Environment Variables**. For each row below, type the **Key**,
paste the **Value**, and click **Add**:

| Key                 | Value                                                     |
| ------------------- | --------------------------------------------------------- |
| `EXA_API_KEY`       | your Exa key (dashboard.exa.ai → API Keys)                 |
| `ANTHROPIC_API_KEY` | your Anthropic key (console.anthropic.com → API Keys)      |
| `LIVE_PASSCODE`     | a passcode you make up, e.g. `lake-junction-42`            |

Do **not** set `EXA_CACHE` or `LLM_CACHE` on Vercel. Without them, live runs use no cache and the demos
read only `demo-cache/`. Leave `VERCEL` alone too: Vercel sets it for you.

Optional: `MONITOR_WEBHOOK_URL` = `https://<your-project>.vercel.app/api/monitors/webhook` turns on
"Watch this plan" (Exa monitors). You can add it after step 3, once you know the address.

## 3. Deploy

1. Click **Deploy**. The build takes about 1–2 minutes.
2. When you see **Congratulations!**, click **Continue to Dashboard**, then **Visit** (or the
   `*.vercel.app` address under **Domains**).

## 4. Check that it works

1. **Demo:** on the homepage, click **Czech, job and a master's in Helsinki**. The saved plan plays back
   in about 10 seconds. Try the other two examples as well.
2. **Gate:** go back to the homepage, type your own sentence and click **Plan my move**. You should see
   "Live planning is limited during the hackathon. Try a saved demo:" and a **Passcode** field.
3. **Live run:** enter your passcode and click **Plan my move** again. A live plan takes 30–75 seconds.
   The passcode is remembered until you close the tab.

## 5. Afterwards

- **Every push to `master` redeploys** automatically. Other branches get their own preview addresses.
- **To change a variable:** Project → **Settings** → **Environment Variables** → edit it. Then go to
  **Deployments** → **⋯** on the latest one → **Redeploy**. New values only apply after a redeploy.
- **To turn off live runs completely:** set `LIVE_PASSCODE` to a long random value nobody knows.
- **To allow live runs without a passcode:** delete `LIVE_PASSCODE` and redeploy (this spends your API
  credits).
- **Logs:** Project → **Logs**. API keys are never logged.
- **Time limit:** the API routes allow up to 300 seconds (`maxDuration`). While a run works, the stream
  sends a keep-alive line every 15 seconds.

## Troubleshooting

- **A demo shows "Step extraction was incomplete":** `demo-cache/` is out of date. Locally, run
  `npm run warm-demo -- marta brazil india` (this makes live calls), commit `demo-cache/` and push.
  `npm test` checks that each example replays from `demo-cache/` alone (`tests/run/deploy.test.ts`).
- **Live run says "Something went wrong":** check `EXA_API_KEY` and `ANTHROPIC_API_KEY` in Settings →
  Environment Variables, then redeploy.
- **Build fails:** open the failed deployment and read **Building**. Run `npm run build` locally to
  reproduce it.
