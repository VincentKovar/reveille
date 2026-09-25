/* ----------------------------------------------------
 * FIRST-RUN SETUP
 * A short guided flow: welcome → voice (API key) → first alarm →
 * lock-screen permissions (Android) or nightstand tips (browser) → test.
 * ---------------------------------------------------- */
import { WEEKDAYS, WEEKEND, EVERY_DAY } from './schedule.js';

export function runSetup(api) {
    return new Promise((resolve) => {
        const root = document.getElementById("setup");
        const body = document.getElementById("setupBody");
        const progress = document.getElementById("setupProgress");
        const steps = [welcome, voice, alarm, api.isNative ? permissions : nightstand, test];
        let index = 0;

        const done = () => {
            root.hidden = true;
            api.finish();
            resolve();
        };

        function show(i) {
            index = i;
            progress.innerHTML = steps.map((_, n) => `<li class="${n <= i ? "done" : ""}"></li>`).join("");
            progress.setAttribute("aria-label", `Step ${i + 1} of ${steps.length}`);
            steps[i]();
            body.querySelector("h1")?.focus();
            root.scrollTop = 0;
        }
        const next = () => (index < steps.length - 1 ? show(index + 1) : done());

        function render(content, actions) {
            body.innerHTML = `<div class="setup-content">${content}</div><div class="setup-actions">${actions}</div>`;
        }

        /* ---- 1. Welcome ---- */
        function welcome() {
            render(`
                <h1 id="setupHeading" tabindex="-1">Wake up to a poem</h1>
                <p class="lede">Instead of a beeping alarm, Reveille reads you a short poem while the screen brightens like a sunrise.</p>
                <blockquote class="setup-sample">The fog comes<br>on little cat feet.<cite>Carl Sandburg, "Fog"</cite></blockquote>
                <p class="hint">Setup takes about two minutes.</p>`,
                `<button class="btn btn-primary" data-next>Get started</button>
                 <button class="btn btn-skip" data-skip>Skip setup</button>`);
        }

        /* ---- 2. Voice ---- */
        function voice() {
            render(`
                <h1 id="setupHeading" tabindex="-1">Choose a voice</h1>
                <p class="lede">A free Google Gemini key gives you a natural reading voice and a new poem every day.</p>
                <ol class="steps">
                    <li>Open <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener"><strong>Google AI Studio</strong></a> and sign in with a Google account.</li>
                    <li>Tap <strong>Create API key</strong>, then copy the key.</li>
                    <li>Paste it here and tap <strong>Check</strong>.</li>
                </ol>
                <div class="inline-form">
                    <input type="password" id="setupKey" placeholder="Starts with AIza" autocomplete="off" spellcheck="false" value="${api.escapeHtml(api.getKey())}">
                    <button class="btn btn-quiet" id="setupCheck" type="button">Check</button>
                </div>
                <p class="hint" id="setupKeyStatus">Your key stays on this phone. It's only ever sent to Google.</p>`,
                `<button class="btn btn-primary" data-next id="setupVoiceNext">Continue</button>
                 <button class="btn btn-skip" data-next data-nokey>Skip and use my phone's built-in voice</button>`);

            const input = body.querySelector("#setupKey");
            const status = body.querySelector("#setupKeyStatus");
            body.querySelector("#setupCheck").addEventListener("click", async () => {
                api.setKey(input.value);
                const ok = await api.verifyKey(status);
                if (ok) body.querySelector("#setupVoiceNext").focus();
            });
            input.addEventListener("change", () => api.setKey(input.value));
        }

        /* ---- 3. First alarm ---- */
        function alarm() {
            let days = [...WEEKDAYS];
            render(`
                <h1 id="setupHeading" tabindex="-1">Set your first alarm</h1>
                <input type="time" id="setupTime" class="time-input" value="06:45" aria-label="Wake-up time">
                <fieldset class="days">
                    <legend>Repeat</legend>
                    <div class="day-chips" id="setupDays"></div>
                    <div class="presets" id="setupPresets">
                        <button type="button" data-preset="once">Once</button>
                        <button type="button" data-preset="weekdays">Weekdays</button>
                        <button type="button" data-preset="weekends">Weekends</button>
                        <button type="button" data-preset="daily">Every day</button>
                    </div>
                </fieldset>
                <p class="hint">You can add more alarms later.</p>`,
                `<button class="btn btn-primary" id="setupSaveAlarm">Save alarm</button>
                 <button class="btn btn-skip" data-next>${api.hasAlarms() ? "Keep my existing alarms" : "I'll do this later"}</button>`);

            const chips = body.querySelector("#setupDays");
            const draw = () => {
                const letters = [["M", 1, "Monday"], ["T", 2, "Tuesday"], ["W", 3, "Wednesday"], ["T", 4, "Thursday"], ["F", 5, "Friday"], ["S", 6, "Saturday"], ["S", 0, "Sunday"]];
                chips.innerHTML = letters.map(([l, d, n]) => `<button type="button" data-day="${d}" aria-pressed="${days.includes(d)}" aria-label="${n}">${l}</button>`).join("");
            };
            draw();
            chips.addEventListener("click", (e) => {
                const d = Number(e.target.closest("[data-day]")?.dataset.day);
                if (Number.isNaN(d)) return;
                days = days.includes(d) ? days.filter(x => x !== d) : [...days, d];
                draw();
            });
            body.querySelector("#setupPresets").addEventListener("click", (e) => {
                const p = e.target.closest("[data-preset]")?.dataset.preset;
                if (!p) return;
                days = { once: [], weekdays: [...WEEKDAYS], weekends: [...WEEKEND], daily: [...EVERY_DAY] }[p];
                draw();
            });
            body.querySelector("#setupSaveAlarm").addEventListener("click", () => {
                const [h, m] = body.querySelector("#setupTime").value.split(":").map(Number);
                if (Number.isNaN(h)) return;
                api.addAlarm(h, m, days);
                next();
            });
        }

        /* ---- 4a. Android permissions ---- */
        async function permissions() {
            render(`
                <h1 id="setupHeading" tabindex="-1">Let it ring on the lock screen</h1>
                <p class="lede">Android asks before an app can wake you. Tap <strong>Allow</strong> on each row. Some rows open a settings page; switch Reveille on there, then come back.</p>
                <ul class="perm-list" id="setupPerms"></ul>`,
                `<button class="btn btn-primary" data-next>Continue</button>`);
            const list = body.querySelector("#setupPerms");
            const refresh = async () => {
                const perms = await api.getPermissions();
                if (perms && document.body.contains(list)) list.innerHTML = api.permissionRowsHtml(perms);
            };
            list.addEventListener("click", async (e) => {
                const b = e.target.closest("[data-fix]");
                if (b) { await api.fixPermission(b.dataset.fix); setTimeout(refresh, 900); }
            });
            document.addEventListener("visibilitychange", refresh);
            await refresh();
        }

        /* ---- 4b. Browser / iPhone ---- */
        function nightstand() {
            const iOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
            render(`
                <h1 id="setupHeading" tabindex="-1">Keep it on your nightstand</h1>
                <p class="lede">A web app can't wake a locked phone, so Reveille rings only while it's open on screen.</p>
                <ol class="steps">
                    ${iOS ? `<li><strong>Add to Home Screen:</strong> tap the Share button in Safari, then <strong>Add to Home Screen</strong>.</li>` : `<li><strong>Install it:</strong> open your browser menu and choose <strong>Install app</strong> or <strong>Add to Home Screen</strong>.</li>`}
                    <li><strong>At bedtime,</strong> open Reveille and tap <strong>Start nightstand mode</strong>.</li>
                    <li><strong>Plug in your phone</strong> and turn the volume up.</li>
                </ol>`,
                `<button class="btn btn-primary" data-next>Got it</button>`);
        }

        /* ---- 5. Test ---- */
        function test() {
            render(`
                <h1 id="setupHeading" tabindex="-1">Try a wake-up</h1>
                <p class="lede">Hear exactly what your mornings will sound like, then tap <strong>I'm up</strong> to finish.</p>
                <p class="hint">If the voice can't start within 30 seconds, a backup chime rings and slowly gets louder. You'll always wake up.</p>`,
                `<button class="btn btn-primary" id="setupTest"><svg><use href="#i-play"/></svg>Play a test wake-up</button>
                 <button class="btn btn-skip" data-finish>Finish</button>`);
            body.querySelector("#setupTest").addEventListener("click", () => {
                root.hidden = true;
                api.startTestRing();
                // Finish once the test ring is dismissed.
                const ring = document.getElementById("ringing");
                const obs = new MutationObserver(() => {
                    if (ring.hidden) { obs.disconnect(); done(); }
                });
                obs.observe(ring, { attributes: true, attributeFilter: ["hidden"] });
            });
        }

        body.onclick = (e) => {
            if (e.target.closest("[data-next]")) next();
            else if (e.target.closest("[data-finish]")) done();
            else if (e.target.closest("[data-skip]")) done();
        };

        root.hidden = false;
        show(0);
    });
}
