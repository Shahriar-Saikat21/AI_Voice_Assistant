# BrainBuzz — How to Run the App

Follow the steps below to get the app running on your phone using **Expo Go**.

---

## Step 1 — Install Expo Go on Your Phone

You should have received an **APK file** via email.

1. Open the email on your **Android phone**
2. Download the APK file attachment
3. Tap the downloaded file to install it
   - If prompted, allow installation from unknown sources in your phone settings
4. Once installed, you will see the **Expo Go** app on your home screen

---

## Step 2 — Set Up the Project on Your PC

1. Copy the project folder to your PC
2. Open a terminal (Command Prompt or PowerShell) inside the project folder
3. Install dependencies by running:

```bash
npm i
```

4. Start the development server:

```bash
npx expo start
```

5. A **QR code** will appear in the terminal

---

## Step 3 — Open the App on Your Phone

1. Open the **Expo Go** app on your phone
2. Tap **"Scan QR Code"**
3. Scan the QR code shown in your terminal
4. The app will load on your phone — you're good to go!

> **Note:** Make sure your phone and PC are connected to the **same Wi-Fi network**.

---

## Troubleshooting — Changes Not Reflecting?

If you make code changes and the app doesn't update automatically, try one of these:

**Option A — Shake your phone:**
- Physically shake your device to open the developer menu
- Tap **"Reload"**

**Option B — Reload from terminal:**
- In the terminal where `npx expo start` is running, press the **`r`** key
- The app will reload with your latest changes
