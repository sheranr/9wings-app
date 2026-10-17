# 9Wings Event app — Setup guide

The app has three parts:

| Part | What it is | Where it lives |
|---|---|---|
| **Android app** | The main app on your phone. Works offline. Sends alerts even when closed. | Installed from an `.apk` file |
| **Web app** | The same app in a browser (iPhone, laptop, tablet). Works offline after first open. | A free GitHub Pages link |
| **Google Sheet** | Backup copy of all data, and a way to move data to a new phone. | Your new Google account |

Setup takes about 30–40 minutes, once. A computer makes steps 2–3 much easier.

---

## Step 1 — Create the business Google account

1. Go to <https://accounts.google.com/signup> and create a new account (for example `9wingsevent@gmail.com`).
2. Sign in to this account on your phone (Settings → Accounts → Add account → Google).

## Step 2 — GitHub (builds the Android app and hosts the web app — free)

1. Go to <https://github.com/signup> and create a free account (you can use the new Gmail).
2. Click **+** (top right) → **New repository**.
   - Name: `9wings-app`
   - Choose **Public** (needed for the free web link; your customer data is **never** stored here — only the app itself).
   - Click **Create repository**.
3. Click **uploading an existing file**. Unzip `9wings-app.zip` on your computer, open the `9wings-app` folder, select **everything inside it** (including the `.github` folder) and drag it into the page. Click **Commit changes**.
   - If the `.github` folder did not upload: click **Add file → Create new file**, type the name `.github/workflows/build.yml`, paste the contents of that file from the zip, and click **Commit changes**.
4. Add the signing key (keeps app updates working):
   - Open **Settings → Secrets and variables → Actions → New repository secret**.
   - Name: `KEYSTORE_BASE64`
   - Value: open `KEYSTORE_BASE64.txt` (sent separately — **not** in the zip) and paste the whole text.
   - Click **Add secret**.
5. Turn on the web link: **Settings → Pages → Source: GitHub Actions**.
6. Start the build: **Actions** tab → **Build 9Wings app** → **Run workflow**. Wait about 5–8 minutes until both jobs are green ✓.

Results:
- **Android app:** on the repository page, click **Releases** (right side) → download **9Wings-Event.apk**.
- **Web app:** `https://YOUR-GITHUB-NAME.github.io/9wings-app/`

> Keep `9wings-release.jks` and `KEYSTORE_BASE64.txt` safe (e.g. in the business Google Drive). Without them, future updates cannot install over the old app.

## Step 3 — Google Sheet backup

1. Signed in with the business Gmail, open <https://sheets.new>. Name the sheet **9Wings Data**.
2. Click **Extensions → Apps Script**. Delete everything in the editor.
3. Paste the full contents of `apps-script/Code.gs` from the zip.
4. Near the top, change
   `const SECRET_KEY = 'CHANGE-ME-to-your-own-secret';`
   to your own secret words, e.g. `const SECRET_KEY = 'golden-swan-2026-k7';` — write it down.
5. Click **Save** (disk icon). In the function list choose **setup** and click **Run**. Google asks for permission: **Review permissions → choose the account → Advanced → Go to project (unsafe) → Allow**. (It says "unsafe" only because you wrote the script yourself.)
6. Click **Deploy → New deployment → ⚙ → Web app**.
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Click **Deploy** and copy the **Web app URL** (ends with `/exec`).
7. In the app: **More → Backup to Google Sheet** → paste the URL and the secret key → **Save** → **Test connection** → **Sync now**.

The sheet now has tabs: Customers, Bookings, Invoices, Items, Offers, Settings. They are protected — please make changes in the app, not in the sheet.

## Step 4 — Install on Android

1. On the phone, open the **Releases** page and download **9Wings-Event.apk**.
2. Open the file. If asked, allow **Install unknown apps** for your browser or Files app.
3. Open the app and tap **Allow** when it asks for notifications.
4. For reliable alerts: long-press the app icon → **App info → Battery → Unrestricted** (Samsung: "Unrestricted"; Xiaomi/Redmi: "No restrictions" and turn on **Autostart**).

**Updating later:** each new build appears in Releases. Download and install it over the old app — your data stays.

## Step 5 — Web app (iPhone, laptop, tablet)

- **iPhone:** open the web link in **Safari** → Share button → **Add to Home Screen**.
- **Android (optional):** open in Chrome → ⋮ → **Add to Home screen**.
- **Laptop:** open the link in Chrome or Edge.

The web app shows alerts when you open it. Only the Android app can alert you while closed.

---

## Daily use

- **New booking:** tap **+** → choose or add the customer → event type, date, venue → Save. "Remind me every year" is ticked automatically for weddings, engagements, birthdays and anniversaries.
- **Quotation / invoice:** open the booking → **Create quotation / invoice** → add items (suggestions come from the price list) → add payments → **Share PDF** (send straight to WhatsApp).
- **Quotation → invoice:** open the quotation → **Convert to invoice**.
- **Anniversary / birthday offers:** shown on **Home** 30 days before (and you get notifications at 30 and 7 days). Tap **Send offer**, adjust the discount (10% by default), and send in WhatsApp.
- **Calendar:** gold dot = event, pink = anniversary/birthday, black = payment due.
- **Sync:** tap the sync icon (top right of Home) → **Sync now**. A red dot means you haven't synced for 3 days.

## Using more than one device

Each device keeps its own copy of the data. Use one main device (the Android phone) for daily work and sync it. To see the latest data on another device, open **More → Backup to Google Sheet → Restore from sheet** on that device.

## New phone / lost phone

Install the app → **More → Backup to Google Sheet** → enter the link and key → **Restore from sheet**.

## Extra safety

**More → Save backup file** creates a single file with all data. Save it to Google Drive once a month.

## Changing business details

**More → Settings**: business name, phone numbers, terms, bank details, alert days, payment due days, default discount and the WhatsApp messages. Changes show on new PDFs straight away.
