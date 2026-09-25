# Use Reveille on an iPhone

About 5 minutes. No technical knowledge needed.

## First, one honest limitation

Apple only allows apps from the App Store to wake a locked iPhone. Reveille isn't in the App Store, so on iPhone it runs as a **web app**: it works and looks like an app, but **it only rings while it's open on screen**.

That's the classic bedside alarm clock setup, and it works well:

> **At bedtime:** open Reveille → tap **Start nightstand mode** → plug in your phone → leave it face-up.

If you forget and lock your phone, the alarm won't ring. For peace of mind, keep a backup alarm in Apple's Clock app a few minutes later until you trust your routine.

---

## Step 1: Add Reveille to your Home Screen

1. Open **Safari** on your iPhone. (Use Safari; other browsers can't do this on older iOS versions.)
2. Go to **[TBA: your website link]** (or `https://vincentkovar.github.io/reveille/`).
3. Tap the **Share** button, the square with an arrow pointing up (at the bottom of the screen, or top right on iPad).
4. Scroll down and tap **Add to Home Screen**.
5. Tap **Add** in the top right.

Reveille now has its own icon. **Always open it from that icon**, not from Safari. It runs full screen and keeps working offline.

## Step 2: The setup guide

The first time you open it, Reveille walks you through setup.

### Choose a voice (optional, but recommended)

With a free **Gemini API key**, a natural voice reads your poem and you get a new poem every day. Without one, the iPhone's built-in voice reads from the built-in poem collection.

1. Tap **Google AI Studio** on the setup screen and sign in with a Google account.
2. Tap **Create API key**, then **Copy**.
3. Go back to Reveille, paste the key, and tap **Check**.

The key is stored only on your iPhone and sent only to Google. It's free for personal use. Don't share it; treat it like a password.

### Set your first alarm

Choose a time and which days, then tap **Save alarm**.

### Try a wake-up

Tap **Play a test wake-up** to hear it. Tap **I'm up** to finish.

## Step 3: Every night

1. Plug in your iPhone.
2. Turn the volume up with the side buttons. The **Ring/Silent switch** doesn't matter on iOS 16.4 and later, but older iOS versions mute Reveille in silent mode.
3. Open Reveille from the Home Screen icon.
4. Tap **Start nightstand mode**. The screen shows a dim clock and stays on all night.
5. To leave nightstand mode, **tap the screen twice**.

> **If the screen still goes dark:** Settings → Display & Brightness → Auto-Lock → **Never** (switch it back in the morning), or keep the phone on its charger. Nightstand mode asks the iPhone to keep the screen awake, but some iOS versions ignore that request.

---

## Using Reveille

- **Add an alarm:** tap **+** on the Alarms screen.
- **Change or delete an alarm:** tap its time.
- **Choose tomorrow's poem:** tap **Choose another**, or go to **Poems** → **Wake to this**.
- **Find a poem for a mood:** on **Poems**, type a mood and tap **Find** (needs a Gemini key).
- **Journal:** after you tap **I'm up**, write down what the poem left you with.

### The fail-safe

If the voice hasn't started within 30 seconds, or the poem ends and you haven't tapped anything within 90 seconds, a bell chime starts and gets louder until you tap **I'm up** or **Snooze**.

## Questions

**Can I use Chrome instead of Safari?** You can visit the page in any browser, but add it to your Home Screen from Safari for the best results.

**Updating:** it updates itself. When a new version is published, it arrives the next time you open the app (sometimes the time after).

**Removing it:** long-press the icon → **Remove App** → **Delete from Home Screen**. To also erase your journal and key: Settings → Safari → Advanced → Website Data → search "reveille" → delete.

**Privacy:** no account, no tracking, no analytics. Everything stays on your iPhone. The only thing that leaves it is the request to Google's Gemini, and only if you add a key.
