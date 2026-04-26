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

This starts the app in `dev client + tunnel` mode so you can keep checking Google login on a real phone without reinstalling every time.

Other useful options:

```bash
npm run start:lan
npm run start:go
npm run build:dev
```

- `npm run start`: recommended default for repeated real-device testing, including Google login
- `npm run start:lan`: same dev build flow on the local network
- `npm run start:go`: fallback Expo Go mode for UI-only checks
- `npm run build:dev`: creates the Android development build you install once on the phone

## Fast Google login testing after each edit

1. Create `.env` from `.env.example` and fill in the real Supabase values.
2. Build and install the dev build once:

```bash
npm run build:dev
```

3. Open the installed dev build on the phone.
4. Start the Metro server:

```bash
npm run start
```

5. After that, most UI / logic edits only need a save plus Fast Refresh. You do not need to rebuild the APK each time.

Rebuild the dev build only when native config changes, for example:
- app scheme or package name changes
- a new native Expo library is added
- config plugins or native permissions change

## Google account sync setup

1. Create a Supabase project.
2. Run the SQL in [supabase/schema.sql](./supabase/schema.sql).
3. In Supabase Auth, enable the Google provider.
4. In Google Cloud Console, create a Web OAuth client and connect it to Supabase.
5. Add a `.env` file using [.env.example](./.env.example).
6. Add `memoria://auth/callback` to the Supabase redirect allow list.
7. Add the same redirect URI to your Google / Supabase auth setup before testing a dev build or APK.

## Admin role setup on Supabase

The app keeps normal user cards private. The admin role opens an inquiry-management panel plus basic usage metrics for signed-in cloud users.

1. Run the updated [supabase/schema.sql](./supabase/schema.sql) in your Supabase SQL editor.
2. Sign in to the app at least once so your `user_profiles` row is created.
3. In Supabase SQL editor, promote your own account:

```sql
insert into public.user_profiles (id, email, role)
values ('YOUR_AUTH_USER_UUID', 'your-email@example.com', 'admin')
on conflict (id) do update
set role = 'admin',
    email = excluded.email,
    updated_at = timezone('utc', now());
```

4. Reopen the app. The `앱 정보` tab will show the admin inquiry inbox, where you can review all support requests and update their status.
5. If you pull newer backend changes later, rerun `supabase/schema.sql` so the latest policies, triggers, and metrics tables are applied.

## Cloud OCR setup for Korean / Japanese / English handwriting

The photo import scaffold is currently kept in the codebase but hidden from the app UI.
To bring it back later, flip `photoImport` to `true` in [src/config/features.js](./src/config/features.js).

The app now tries `Google Cloud Vision OCR` first for photo card import, and falls back to on-device OCR only if the cloud function is not available.

1. In Google Cloud Console, create or choose a project.
2. Enable the `Cloud Vision API`.
3. Create an API key and restrict it to `Cloud Vision API`.
4. Install and log in to the Supabase CLI if needed.
5. Link the local project to your Supabase project:

```bash
supabase link --project-ref your-project-ref
```

6. Save the Vision API key as a Supabase function secret:

```bash
supabase secrets set GOOGLE_CLOUD_VISION_API_KEY=your_google_cloud_vision_api_key
```

7. Deploy the included OCR function:

```bash
supabase functions deploy ocr-photo-cards
```

8. Keep the existing `.env` values for Supabase in the app. Once the function is deployed, the photo import flow will automatically try cloud OCR first.

Files involved:

- `supabase/functions/ocr-photo-cards/index.ts`: server OCR proxy for Google Cloud Vision
- `src/lib/photo-ocr.js`: app-side cloud-first OCR flow with local fallback
- `src/utils/memory.js`: turns recognized text blocks into left/right card pairs

## Android release path

1. Replace `com.memoria.app` in `app.json` with your final package name if needed.
2. Install EAS CLI if needed: `npm install -g eas-cli`
3. Log in to Expo: `eas login`
4. Build an installable APK for device testing: `eas build --platform android --profile preview`
5. Build Android App Bundle for Play Store release: `eas build --platform android --profile production`
6. Submit the generated `.aab` to Google Play Console.

## Google login checklist for APK testing

1. Create a local `.env` file from `.env.example` and fill in the real Supabase URL / Anon Key.
2. In Supabase Auth, enable Google provider.
3. Add `memoria://auth/callback` to Supabase Redirect URLs.
4. Add the same redirect URI to the Google OAuth setup used by Supabase.
5. Build with `eas build --platform android --profile preview` and install the APK from the generated EAS link.

## Recommended daily workflow

1. Keep the dev build installed on your phone.
2. Run `npm run start`.
3. Edit code and save.
4. Confirm the change immediately in the dev build, including Google login flow when needed.
5. Only make a new build when a native setting changes.

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
