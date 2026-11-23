# 9Wings Flora & Wedding app — Setup guide

| Part | What it is | Link |
|---|---|---|
| **Android app** | Main app on the phone. Works offline, sends reminders even when closed. | https://sheranr.github.io/9wings-app/download/ |
| **Web app** | The same app for iPhone, tablet and computer. | https://sheranr.github.io/9wings-app/ |
| **Online database** | Firebase (Google). Stores all data securely; syncs every phone and computer; works offline. | https://console.firebase.google.com |
| **App Manager** | For the developer: send messages to users, publish updates. | https://sheranr.github.io/9wings-app/admin/ |

---

## 1. Create the Firebase project (once)

1. Open https://console.firebase.google.com with the business Gmail → **Create a project** → name `9wings-app` → turn **off** Google Analytics → **Create**.
2. **Build → Authentication → Get started → Email/Password → Enable → Save.**
3. **Build → Firestore Database → Create database** → location **asia-south1 (Mumbai)** → **Start in production mode** → **Create**.
4. **Firestore Database → Rules** → delete everything, paste the contents of `firestore.rules` from this repository → **Publish**.
5. **⚙ Project settings → Your apps → </> (Web)** → nickname `9wings` → **Register app** → copy the `firebaseConfig` block.
6. Put those values into `www/js/firebase-config.js` (replace `null` with the config object) and push to GitHub. The app and web app rebuild automatically (about 3 minutes).

The Firebase free plan (Spark) is enough for a business of this size.

## 2. First sign-in — create the owner account

1. Install the new app (download page) or open the web app.
2. The first screen says **Set up your business**. Enter the owner's name, email and a password (at least 8 characters).
3. This account becomes the **owner**. Only one owner account can be created this way; after that the screen shows **Sign in**.

## 3. Move existing data

If the phone already has data from the earlier version, the dashboard shows **Move your existing data**. Tap **Move**. Clients, bookings, invoices, payments, the price list and settings (phones, terms, bank details) are copied into the online database. Your data stays on the phone as well, so nothing is lost.

You can also do this later: **More → Data & backup → Move data from this device**.

## 4. Add staff

**More → Team → Add staff member** → name, email, temporary password → **Create login**. Share the login with them (the **Copy** button copies the details and the download link).

| | Owner | Staff |
|---|---|---|
| Clients, bookings, invoices, payments, expenses, services | ✓ | ✓ |
| Delete invoices or payments | ✓ | – |
| Delete clients, bookings, expenses, services | ✓ | – |
| Remove or change a recorded payment | ✓ | – |
| Business settings, team, full backup file | ✓ | – |

To stop someone signing in: **Team → Manage → untick "Can sign in"**.

## 5. Install on phones

- **Android:** open the download page → **Download for Android** → open the file → **Install**. Allow notifications. For reliable reminders: long-press the icon → **App info → Battery → Unrestricted**.
- **iPhone:** open the web app in **Safari → Share → Add to Home Screen**.
- **Computer:** open the web app in Chrome or Edge.

---

## Daily use

- **New booking:** the **+** button → 4 steps: client → event → services & price → status. If the client paid an advance, enter it in step 3 — an invoice is created with the advance recorded.
- **Invoices:** open a booking → **Invoice**, or **Invoices → +**. Choose Quotation or Invoice, add items (or **From services** to pick services and packages). Open the invoice to **Share PDF** to WhatsApp, record payments (advance, partial, final, refund) and send a **payment reminder**.
- **Quotation accepted:** open it → **Convert**.
- **Calendar:** month, week and list views. Gold dot = event, purple = anniversary/birthday, dark = payment due.
- **Anniversary & birthday offers:** shown on the dashboard 30 days before (with phone reminders at 30 and 7 days). Tap **Send**, adjust the discount (10% by default) and send in WhatsApp.
- **Expenses:** **More → Expenses → +** — category, supplier, related booking. The dashboard and reports show profit (money received − expenses).
- **Services & packages:** **More → Services & packages** — prices fill in automatically on invoices.
- **Reports:** revenue, expenses and profit by month, bookings by type, payment methods, top clients, offer results.
- **Export:** **Reports → Export** (also on Payments and Expenses) → choose a month, a year or all time → **Excel** (sheets: Summary, Payments, Expenses, Invoices, Bookings, Balances) or a branded **PDF report**. Share it straight to WhatsApp, email or Drive.

## Working offline

Everything works without internet. Changes are saved on the device and sync automatically when the connection returns. Invoice numbers are taken from the shared counter when online; offline, the next free number on that device is used.

## Backups & recycle bin

- **Online database:** every invoice, booking and payment is stored in Firebase, so a lost phone loses nothing — sign in on another device.
- **Recycle bin (owner):** deleted invoices, bookings, clients, expenses and services go to **More → Recycle bin** for 30 days and can be restored with one tap (restoring an invoice also brings back its client and booking). After 30 days they're removed for good.
- **Automatic weekly backups (owner):** the owner's device keeps a full copy every week (last 8). On Android it's also saved as a file in **Documents/9Wings Backups**. See and restore them under **More → Data & backup → Automatic backups**. Restoring brings back anything missing and never overwrites newer changes.
- **Monthly Google Drive copy:** the dashboard reminds the owner once a month — tap **Save** and choose Google Drive.
- **Invoices keep their issued details:** each invoice stores the business details (bank, terms, phones) and client details used when it was issued, so a re-shared PDF always matches what the client received. **Use current** on an invoice updates it to today's details.

## Security

- **Sign-in required.** Nothing can be read or changed without signing in, and only people added under **Team** (and switched on) can see business data. These rules are enforced by the database itself (`firestore.rules`), not only by the app.
- **Owner-only actions:** deleting anything, removing or changing recorded payments, business settings, the team and full backup files.
- **Turning someone off** blocks them immediately when online. (A phone that stays offline keeps showing what it had already downloaded until it reconnects.)
- **Signing out** (More → My account → Sign out) removes the offline copy of the data from that phone. Ask staff to sign out before handing a phone to someone else.
- **Protection inside the app:** text typed into the app is always shown as plain text, and the app only runs its own code (Content Security Policy), so a malicious entry can't run code on someone else's screen. Links only open web pages, phone, email or WhatsApp.
- **Firebase console settings (recommended once):**
  - **Authentication → Settings → Password policy:** require at least 8 characters.
  - **Authentication → Settings → User actions:** keep *Email enumeration protection* on.
  - **Firestore → Rules:** after any update to `firestore.rules`, paste and **Publish** again.
- **Backups contain all client details** — keep backup and report files private.

## Settings (owner)

**More → Settings:** business name, slogan, phone numbers, invoice prefix, terms, bank details, thank-you line, reminder days, payment due days, reminder time, default discount and the WhatsApp offer messages.

---

## For the developer

- **Messages & updates:** App Manager → https://sheranr.github.io/9wings-app/admin/ (needs a GitHub fine-grained token for `9wings-app` with Contents and Actions read & write).
- **Every push to `main`** builds a new Android version (Releases) and updates the web app. The app shows users an **Update** notification.
- **Firebase library:** bundled in `www/vendor/firebase.js` so the app works offline. To update it: `npm install firebase esbuild && npx esbuild tools/firebase-entry.js --bundle --format=esm --minify --outfile=www/vendor/firebase.js`.
- **Before Firebase is connected** (`firebase-config.js` is `null`) the app stores data on the device only; that data can be moved into Firebase later from the dashboard prompt.
- Keep `9wings-release.jks` / `KEYSTORE_BASE64.txt` safe — without them updates can't install over the existing app.
