// Builds both Android editions and copies the APKs to release/.
//   node scripts/build-android.mjs            → signed release APKs (needs ~/.reveille-signing)
//   node scripts/build-android.mjs --debug    → debug APKs (no signing key needed)
//
// A release build also copies the public edition into www/downloads/Reveille.apk.
// That file is served as a plain static download from the same domain as the web
// app (vincentkovar.github.io/reveille/downloads/Reveille.apk) instead of GitHub's
// release-asset redirect, which some phones' security software (e.g. Samsung)
// silently blocks because the final URL is a signed, temporary Azure blob link.
// Commit that file and push so the live site picks it up.
import { execSync } from 'node:child_process';
import { copyFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';

const debug = process.argv.includes('--debug');
const type = debug ? 'Debug' : 'Release';
const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
const run = (cmd, cwd = '.') => execSync(cmd, { cwd, stdio: 'inherit', env: process.env });

if (!debug && !existsSync(process.env.REVEILLE_SIGNING_PROPS || `${homedir()}/.reveille-signing/keystore.properties`)) {
    console.warn('No signing key found; release APKs will be signed with the debug key.');
}
run('npx cap sync android');
run(`./gradlew assemblePortfolio${type} assemblePersonal${type} --console=plain -q`, 'android');

mkdirSync('release', { recursive: true });
for (const [flavor, name] of [['portfolio', `Reveille-${version}.apk`], ['personal', `Reveille-VK-${version}-personal.apk`]]) {
    const lower = type.toLowerCase();
    const src = `android/app/build/outputs/apk/${flavor}/${lower}/app-${flavor}-${lower}.apk`;
    const dest = `release/${debug ? name.replace('.apk', '-debug.apk') : name}`;
    copyFileSync(src, dest);
    console.log(`→ ${dest}`);
}
// A version-less copy of the public edition, uploaded to every GitHub release so this
// link always serves the newest version:
//   https://github.com/VincentKovar/reveille/releases/latest/download/Reveille.apk
if (!debug) {
    copyFileSync(`release/Reveille-${version}.apk`, 'release/Reveille.apk');
    console.log('→ release/Reveille.apk');
    mkdirSync('www/downloads', { recursive: true });
    copyFileSync(`release/Reveille-${version}.apk`, 'www/downloads/Reveille.apk');
    console.log('→ www/downloads/Reveille.apk (commit and push this)');
}
