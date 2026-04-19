# MEMORIA

MEMORIA is a mobile memorization app built with Expo React Native. It lets users save one card at a time, study in both directions, and keep cards synced with Google login when Supabase is configured.

## What is included

- A centered one-card composer for quick save flow
- Local persistence with `AsyncStorage`
- Random quiz mode that can ask `front -> back` or `back -> front`
- Case-insensitive answer checking
- Saved card edit and delete screen
- Dark, night-mode inspired UI
- Launch screen with `MEMORIA` branding
- Google sign-in ready Supabase sync scaffold for cross-device access
- `EAS` config for future Android release builds

## Project structure

- `App.js`: main mobile UI, launch screen, and app flow
- `src/lib/supabase.js`: Supabase client and session persistence
- `src/utils/memory.js`: pair, sync, and quiz helpers
- `supabase/schema.sql`: database table and RLS policies

## Install

```bash
npm install
npx expo install --fix
```

## Run

```bash
npm run start
```

Then open the Android emulator, or scan the QR code with Expo Go.

## Google account sync setup

1. Create a Supabase project.
2. Run the SQL in [supabase/schema.sql](./supabase/schema.sql).
3. In Supabase Auth, enable the Google provider.
4. In Google Cloud Console, create a Web OAuth client and connect it to Supabase.
5. Add a `.env` file using [.env.example](./.env.example).
6. Add `memoria://auth/callback` to the Supabase redirect allow list.
7. Add the same redirect URI to your Google / Supabase auth setup before testing an APK.

## Android release path

1. Replace `com.memoria.app` in `app.json` with your final package name if needed.
2. Install EAS CLI if needed: `npm install -g eas-cli`
3. Log in to Expo: `eas login`
4. Build Android App Bundle: `eas build --platform android --profile production`
5. Submit the generated `.aab` to Google Play Console.

## Git branch strategy

Use `main` for stable releases and `develop` for ongoing feature work.

Example:

```bash
git init -b main
git add .
git commit -m "Initial Memora app"
git branch develop
git checkout develop
```

## Notes

- The app works locally even without Supabase credentials.
- When Supabase is configured, Google login is used to sync cards across devices.
- You still need to prepare Play Store assets such as app icon, screenshots, privacy policy, and store description before publishing.
