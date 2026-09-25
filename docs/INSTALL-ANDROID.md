# Install Reveille on an Android phone

About 10 minutes. No technical knowledge needed.

Reveille isn't in the Google Play Store. You download it straight from the web, the way you'd download a PDF. Android calls this "installing an unknown app" and asks you to confirm once.

**You'll need:**
- An Android phone running Android 8 or newer (almost any phone from 2018 on)
- Optional: a Google account, for the free Gemini key that gives Reveille a natural reading voice

---

## Step 1: Download the app

1. On your phone, open the download page: **[TBA: your website link]**
   (or the GitHub Releases page: `https://github.com/VincentKovar/reveille/releases/latest`)
2. Tap **Download for Android**. The file is called something like `Reveille-2.0.0.apk`.
3. If Chrome warns *"This type of file can harm your device"*, tap **Download anyway**. That's Chrome's standard warning for every app that doesn't come from the Play Store.

## Step 2: Install it

1. When the download finishes, tap **Open** at the bottom of the screen.
   Missed it? Open the **Files** app → **Downloads** → tap the `Reveille` file.
2. The first time, Android says *"For your security, your phone is not allowed to install unknown apps from this source."*
   - Tap **Settings**
   - Turn on **Allow from this source**
   - Tap the back arrow
3. Tap **Install**.
4. If **Google Play Protect** says it doesn't recognize the developer, tap **More details** → **Install anyway**.
   This happens with any app that isn't in the Play Store. Reveille's code is public on GitHub for anyone to read.
5. Tap **Open**.

> **Tip:** After installing, you can switch **Allow from this source** back off: Settings → Apps → Special app access → Install unknown apps → Chrome.

## Step 3: The setup guide

Reveille walks you through four short screens the first time you open it.

### 3a. Choose a voice (optional, but recommended)

With a free **Gemini API key**, a natural voice reads your poem and Reveille finds you a new poem every day. Without one, your phone's built-in voice reads from the built-in poem collection.

To get a key:

1. On the "Choose a voice" screen, tap **Google AI Studio**. It opens in your browser.
2. Sign in with your Google account and accept Google's terms if asked.
3. Tap **Create API key**. If it asks you to pick a project, choose the one it suggests or tap **Create project**.
4. When the key appears (a long code starting with `AIza`), tap **Copy**.
5. Switch back to Reveille, tap the key box, paste, and tap **Check**.
6. You should see *"Key works. Gemini will read your poems."* Tap **Continue**.

**About the key:**
- It's free for personal use. Google's free tier covers far more than one poem a day.
- It's stored only on your phone. Reveille sends it to Google and nowhere else.
- Treat it like a password: don't post it online. If you think it leaked, delete it in Google AI Studio and make a new one.

No key? Tap **Skip and use my phone's built-in voice**. You can add a key any time in **Settings**.

### 3b. Set your first alarm

Pick a time and the days it repeats (Weekdays is selected to start). Tap **Save alarm**.

### 3c. Let it ring on the lock screen

Android asks before an app can wake you. Tap **Allow** on any row that has an Allow button:

| Row | What happens when you tap Allow |
|---|---|
| **Notifications** | A pop-up appears. Tap **Allow**. |
| **Full-screen alarm** | A settings page opens. Switch Reveille **on**, then tap back. |
| **Alarms and reminders** | A settings page opens. Switch Reveille **on**, then tap back. |

On most phones only Notifications needs you; the other two are usually already on. When every row shows a check mark, tap **Continue**.

### 3d. Try a wake-up

Tap **Play a test wake-up** to hear exactly what your mornings will sound like. Tap **I'm up** to finish.

---

## Using Reveille

- **Add an alarm:** tap **+** on the Alarms screen.
- **Change or delete an alarm:** tap its time.
- **Turn an alarm off for a while:** use the switch next to it.
- **Choose tomorrow's poem:** tap **Choose another**, or go to **Poems** and tap **Wake to this** on any poem.
- **Find a poem for a mood:** on **Poems**, type something like *"first snow, empty street"* and tap **Find** (needs a Gemini key).
- **Journal:** after you tap **I'm up**, Reveille opens the Journal so you can jot down what the poem left you with.

### What a wake-up is like

1. At alarm time the screen lights up, even if the phone is locked.
2. A soft sound starts and the poem is read aloud, getting gradually louder over about 20 seconds.
3. The screen slowly brightens like a sunrise and each line lights up as it's read.
4. Tap **I'm up** to stop, or **Snooze** to hear it again in 9 minutes (you can change the snooze length in Settings).
5. You can also use the **Snooze** and **I'm up** buttons in the notification without unlocking.

### The fail-safe

Reveille is built to never leave you asleep:
- If the voice hasn't started **30 seconds** after the alarm time (no internet, no voice installed, anything), a bell chime starts and gets louder over a minute.
- If the poem finishes and you haven't tapped anything within **90 seconds**, the chime starts.
- The chime keeps going until you tap **I'm up** or **Snooze**. It stops on its own after 30 minutes.

**Volume:** Reveille uses your phone's **alarm volume**, not media volume, just like the built-in Clock app. It plays even in silent mode. Check it once: press a volume button, tap the **⋯** or settings icon on the volume slider, and make sure **Alarm volume** is up.

---

## If an alarm didn't ring

Work through these in order:

1. **Open Reveille → Settings → Alarm permissions.** Every row should have a check mark. Tap **Allow** on any that don't.
2. **Alarm volume.** See the volume tip above.
3. **Samsung, Xiaomi, OnePlus, Huawei, Oppo:** these phones sometimes shut down apps to save battery.
   - Long-press the Reveille icon → **App info** → **Battery** → choose **Unrestricted** (or "No restrictions").
   - Samsung: also open Settings → Battery → Background usage limits and make sure Reveille isn't under **Sleeping apps** or **Deep sleeping apps**.
   - More help for your model: [dontkillmyapp.com](https://dontkillmyapp.com)
4. **Don't "force stop" Reveille.** Swiping it away from recent apps is fine. **Force stop** in Settings cancels all its alarms until you open it again (that's how Android works for every app).
5. After restarting your phone, alarms come back on their own. There's no need to open the app.

## Other questions

**"Google didn't accept the API key"**: paste it again in **Settings**. Make sure you copied the whole thing (it starts with `AIza`).

**"You've hit today's free Gemini limit"**: rare with normal use; it resets within a day. Your phone's voice reads the poem in the meantime.

**Can I use it with no internet?** Yes. Whenever you open Reveille (or switch away from it), it records your next poem ahead of time, so the Gemini voice plays even if your Wi-Fi is down at wake-up. Opening the app once in the evening is enough. With no key it works fully offline.

**Updating:** download the new `.apk` from the same page and install it over the top. Your alarms, journal, and key stay put.

**Uninstalling:** long-press the icon → **Uninstall**. This erases your journal too, so copy out anything you want to keep first.

**Privacy:** Reveille has no account, no tracking, and no analytics. Everything stays on your phone. The only thing that leaves it is the request to Google's Gemini (the poem text and your key), and only if you add a key.
