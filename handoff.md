# MEMORIA / 메모리아 Handoff

Last updated: 2026-05-29 KST

이 문서는 다음 채팅 또는 다른 작업자가 `D:\github\APP\memorize_app2` 프로젝트를 바로 이어받기 위한 최신 상태 요약이다. 이전 `handoff.md`는 이 내용으로 새로 덮어썼다.

## 1. 한 줄 요약

MEMORIA는 Expo SDK 54 / React Native 기반의 실제 모바일 암기 앱이다. 사용자가 앞면/뒷면 카드쌍을 만들고 폴더로 정리한 뒤, 암기 탭에서 문제를 풀고 기록/오답/일일 목표를 관리한다. Google 로그인 시 Supabase로 카드, 폴더, 학습 상태, 일일 목표, 문의 기록 등을 동기화한다.

## 2. 현재 Git / 릴리스 상태

- 작업 폴더: `D:\github\APP\memorize_app2`
- 기본 작업 브랜치: `develop`
- 현재 최신 기능 변경: Google direct auth redirect를 Android client ID 기반 reverse-DNS scheme으로 전환
- 현재 `develop`, `origin/develop`은 이 문서 갱신 전 기준 `4650076` 기반이며, 이번 수정 커밋이 바로 다음 커밋으로 추가될 예정이다.
- 현재 `main`, `origin/main`은 이전 릴리스 커밋 `03f7898`에 머물러 있다.
- 현재 추적되지 않은 파일: `want.png`
  - 사용자가 둔 참고 파일로 보인다.
  - 별도 요청 전에는 건드리지 말 것.

최근 성공한 릴리스 빌드:

- EAS build ID: `6539f525-e33c-44f0-858d-a8cea15fb13a`
- Profile: `production`
- Distribution: `store`
- App versionName: `1.0.3`
- Android versionCode: `10`
- Commit: `c6ec4e9c9b7dfb859977a8df754d0082e90cbd66`
- AAB: https://expo.dev/artifacts/eas/duZy4o5t6LMbyXqq5iiqTm.aab
- Logs: https://expo.dev/accounts/zinnn/projects/memoria/builds/6539f525-e33c-44f0-858d-a8cea15fb13a

중요한 배경:

- 이전 AAB는 `versionCode 9`였고, 이번 내부 테스트용 수정 빌드에서 `10`으로 증가했다.
- Google Play에서 실제로 막는 것은 `versionName`이 아니라 정수 `versionCode`다.
- 새 빌드는 EAS production의 `autoIncrement`로 `9 -> 10` 증가했다.
- `versionName`은 이번 내부 테스트용 기능 수정 빌드에서 `1.0.3`으로 올렸다.
- 2026-05-21 관리자 문의 노출 수정 후 `1.0.4` production AAB 생성을 시도했지만, Expo/EAS 무료 플랜 Android 월간 빌드 한도 소진으로 실패했다.
  - EAS 메시지: Android builds from the Free plan this month used, reset on Mon Jun 01 2026.
  - 빌드 목록에는 새 실패 빌드가 생성되지 않았고, 최신 성공 AAB는 여전히 `1.0.3 / versionCode 10`이다.
  - EAS가 실패 직전 remote `versionCode`를 `10 -> 11`로 증가시켰다고 출력했으므로, 다음 성공 빌드에서 실제 versionCode를 반드시 확인해야 한다.
- 2026-05-28 아이콘/알림 수정 후 `1.0.5` production AAB 생성을 다시 시도했지만, 같은 EAS 무료 플랜 Android 월간 빌드 한도 소진으로 실패했다.
  - EAS가 실패 직전 remote `versionCode`를 `11 -> 12`로 증가시켰다고 출력했다.
  - 새 AAB URL은 생성되지 않았다.
  - 최신 성공 AAB는 여전히 `1.0.3 / versionCode 10`이다.
- 2026-05-28 튜토리얼/문제 수 버튼/Google direct auth 준비 수정 후 앱 버전을 `1.0.6`으로 올렸다.
  - AAB는 아직 새로 만들지 않았다.
- 2026-05-28 Google direct auth의 Android redirect를 기존 dev build가 받을 수 있는 `memoria:/oauthredirect`로 수정했다.
  - 새 APK를 만들지 않고 JS/Metro reload로 확인 가능한 변경이다.
- 2026-05-28 Google에서 `memoria:/oauthredirect`를 계속 `invalid_request`로 거절해 Android OAuth redirect를 패키지명 기반 `com.youwon35.memoria:/oauthredirect`로 바꿨다.
  - `app.json` scheme에 기존 `memoria`와 새 `com.youwon35.memoria`를 둘 다 등록했다.
  - 네이티브 manifest 변경이므로 새 dev build APK를 생성했다.
- 2026-05-29 Google 동의 화면 이후 앱으로 돌아오지 않고 Google 웹페이지에 머무는 현상이 계속되어 Android OAuth redirect를 Google Android client ID 기반 reverse-DNS scheme으로 다시 바꿨다.
  - 새 redirect URI: `com.googleusercontent.apps.852267252395-oaqdf00qj7j0fkgi08pgh01vggggvjoj:/oauthredirect`
  - `app.json` scheme에 위 scheme을 추가했다.
  - 네이티브 manifest 변경이므로 새 dev build APK를 생성했다.

현재 실기기 확인용 dev build:

- 파일: `D:\github\APP\memorize_app2\.expo\local-builds\memoria-dev-1.0.8-google-client-scheme-debug.apk`
- App versionName: `1.0.8`
- 빌드 방식: `expo prebuild --platform android --no-install` 후 로컬 Gradle `:app:assembleDebug`
- 파일 크기: 약 146.6 MB
- dev build이므로 설치 후 JS 확인에는 Metro 서버가 필요하다.
- APK manifest scheme 확인:
  - `memoria`
  - `com.youwon35.memoria`
  - `com.googleusercontent.apps.852267252395-oaqdf00qj7j0fkgi08pgh01vggggvjoj`
  - `exp+memoria`
- APK 서명 SHA-1: `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`

## 3. 기술 스택

- Expo SDK: `~54.0.34`
- React Native: `0.81.5`
- React: `19.1.0`
- Expo dev client 사용
- 일반 Expo Go만으로는 네이티브 모듈 변경 확인이 충분하지 않다. 최신 development build 설치 후 Metro에 연결해 테스트하는 구조다.

주요 패키지:

- `@react-native-async-storage/async-storage`
- `@supabase/supabase-js`
- `expo-auth-session`
- `expo-crypto`
- `expo-dev-client`
- `expo-document-picker`
- `expo-file-system`
- `expo-linear-gradient`
- `expo-notifications`
- `expo-secure-store`
- `expo-web-browser`
- `react-native-safe-area-context`
- `react-native-url-polyfill`
- `xlsx`
- `jszip`

## 4. 주요 명령어

```powershell
npm start
npm run start:lan
npm run start:tunnel
npm run start:go
npm run android
npm run build:dev
npm run build:preview
npm run build:production
npm run submit:production
```

검증 때 자주 쓰는 명령:

```powershell
npx tsc --noEmit
git diff --check
npx expo export --platform android --output-dir .expo-export --clear
npx expo-doctor
```

`expo export` 후 생성되는 `.expo-export`는 작업 폴더 내부 경로인지 확인한 뒤 삭제한다.

EAS production AAB 빌드:

```powershell
npx eas-cli build --platform android --profile production --non-interactive --no-wait
```

EAS 상태 확인:

```powershell
npx eas-cli build:list --platform android --limit 1 --json
```

## 5. 설정 파일

### `package.json`

- `name`: `memorize_app2`
- `version`: `1.0.8`
- `main`: `node_modules/expo/AppEntry.js`
- `private`: `true`

### `app.json`

- Expo app name: `MEMORIA`
- slug: `memoria`
- version: `1.0.8`
- scheme:
  - `memoria`
  - `com.youwon35.memoria`
  - `com.googleusercontent.apps.852267252395-oaqdf00qj7j0fkgi08pgh01vggggvjoj`
- owner: `zinnn`
- EAS project id: `6caf9ed8-f402-4743-8222-5e05fcedb0f2`
- Android package: `com.youwon35.memoria`
- iOS bundle id: `com.youwon35.memoria`
- app icon: `./app-icon.png`
- native splash:
  - image: `./assets/splash_full_preview.png`
  - resizeMode: `contain`
  - backgroundColor: `#F7F5FF`
- Android adaptive icon:
  - foreground: `./assets/adaptive-icon.png`
  - backgroundColor: `#B8AEFF`
- Expo notifications plugin:
  - plugin: `expo-notifications`
  - notification color: `#8E7BFF`

### `eas.json`

- CLI version: `>= 16.0.0`
- `appVersionSource`: `remote`
- `development`: dev client enabled, internal distribution
- `preview`: internal distribution, Android APK
- `production`: `autoIncrement: true`

## 6. EAS / 환경변수 / Google 로그인

Google 로그인 버튼이 비활성화되어 `Google 로그인 설정 필요`라고 보였던 원인은 EAS production 환경에 Supabase 환경변수가 없었기 때문이다. 현재는 EAS production 환경에 아래 값들이 등록되어 있다.

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_APP_SCHEME=memoria`

코드상 Google 로그인 설정 판정:

- 파일: `src/lib/supabase.js`
- `isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)`
- 이 값이 false이면 시작 화면 Google 버튼이 비활성화된다.

OAuth redirect:

- 앱 scheme: `memoria`
- redirect URI 흐름: `memoria://auth/callback`
- Supabase Dashboard의 Auth URL Configuration 또는 Google provider 설정에 `memoria://auth/callback`이 허용 redirect URL로 들어가 있어야 production 앱에서 로그인 완료까지 성공한다.
- Google ID token direct auth의 Android redirect URI는 `com.googleusercontent.apps.852267252395-oaqdf00qj7j0fkgi08pgh01vggggvjoj:/oauthredirect`다.
- Google Cloud Android OAuth client는 package `com.youwon35.memoria`, SHA-1 `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`, custom URI scheme 사용 허용 상태여야 한다.

Google 로그인 도메인 표시 이슈:

- 현재 기본 로그인은 Supabase OAuth URL을 통해 Google 계정 선택 화면으로 들어가므로 Google 화면에 `jjazbqqvfhouhcildkzk.supabase.co(으)로 이동`이 표시될 수 있다.
- 앱 코드만으로 Supabase hosted OAuth의 이 도메인 표기를 숨길 수는 없다.
- 2026-05-28에 Google ID token을 직접 받아 `supabase.auth.signInWithIdToken`으로 로그인하는 우회 경로를 추가했다.
- Android에서 이 direct 경로를 실제 사용하려면 Google Cloud의 Android OAuth client ID를 `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`로 넣어 새 dev/production build를 만들어야 한다.
- 현재 로컬 `.env`에는 `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`가 들어가 있으며, `1.0.8` dev build는 `com.googleusercontent.apps.852267252395-oaqdf00qj7j0fkgi08pgh01vggggvjoj:/oauthredirect`를 받을 수 있다.
- iOS/web까지 direct 경로를 쓰려면 각각 `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`도 준비한다.
- 위 값이 없으면 기존 Supabase OAuth 로그인으로 fallback된다.

보안 메모:

- `EXPO_PUBLIC_SUPABASE_ANON_KEY`는 클라이언트 공개 anon key다.
- Supabase service role key 같은 서버 전용 비밀키를 앱 코드, `.env`, EAS public env에 넣으면 안 된다.

## 7. 주요 파일 구조

핵심 파일:

- `App.js`
  - 화면 대부분, 상태, 폴더/카드 로직, 튜토리얼, Google 로그인, Supabase 동기화, 계정 삭제 흐름이 들어 있는 메인 파일
- `src/i18n.js`
  - 한국어/영어/일본어 번역 전체
- `src/lib/supabase.js`
  - Supabase client 생성, SecureStore/AsyncStorage 기반 auth storage, PKCE 설정
- `src/utils/import-files.js`
  - TXT/CSV/XLS/XLSX/DOCX 파일에서 카드쌍 import
- `src/utils/memory.js`
  - 답안 정규화, 학습 통계, 학습 상태 병합 로직
- `scripts/start-dev-build.ps1`
  - dev build용 Expo 시작 스크립트
- `docs/privacy-policy-ko.md`
  - Google Play에 공개 URL로 올릴 개인정보처리방침 초안
- `docs/data-deletion-ko.md`
  - Google Play 계정/데이터 삭제 안내 URL용 문서
- `store/google-play-listing.md`
  - Play Store 등록 정보 초안
- `supabase/schema.sql`
  - 전체 Supabase schema
- `supabase/migrations/20260514_add_memory_folders.sql`
  - 폴더 테이블 관련 migration
- `supabase/migrations/20260519_add_memory_user_state.sql`
  - 학습 상태/일일 목표 동기화 테이블 및 삭제 policy 관련 migration

주요 자산:

- `app-icon.png`: 앱 아이콘
- `assets/adaptive-icon.png`: Android adaptive icon foreground
- `assets/splash_full_preview.png`: native splash와 Figma 전체 프리뷰
- `assets/background_decor.png`: 시작/튜토리얼 인트로 배경 장식
- `assets/background_decor.svg`: Figma 배경 장식 원본 계열
- `assets/ghost_character.png`: 시작/튜토리얼 인트로 캐릭터
- `assets/ghost_character.png.svg`: Figma 캐릭터 원본 계열
- `assets/total.svg`: Figma 전체 원본 계열
- `assets/google-g.png`: Google 로그인 버튼용 공식 스타일 컬러 G 아이콘

## 8. 브랜딩 / 시작 화면 / 튜토리얼 인트로 주의사항

사용자는 캐릭터 비율, 입 모양, 카드 위치, 점선 원, 하단 버튼 위치에 매우 민감하다. 새로 그린 듯한 변형이나 AI 이미지의 울퉁불퉁한 경계를 싫어했다.

현재 원칙:

- 캐릭터는 Figma 출력물인 `assets/ghost_character.png`를 기준으로 사용한다.
- 배경은 `assets/background_decor.png`를 사용한다.
- 전체 화면 PNG 한 장을 `cover`로 확대하는 방식은 쓰지 않는다.
- 시작 화면과 튜토리얼 인트로는 배경 장식과 캐릭터를 분리해 배치한다.
- 캐릭터 주변 점선 원은 앱에서 dashed border로 렌더링한다.
- 캐릭터/점선/버튼 배치는 `react-native-safe-area-context`와 `createIntroLayoutMetrics`로 화면 크기와 safe area를 고려한다.
- `MEMORIA` 텍스트는 이미지 안 글자가 아니라 네이티브 `Text`로 렌더링해 글자 깨짐을 줄인다.
- 시작 화면 우측 상단에는 아주 작게 `v1.0.6` 같은 앱 버전을 표시한다.
- 하단 Google/게스트 버튼은 Android 내비게이션 바와 겹치지 않도록 safe area를 고려한다.

`App.js` 상단 자산 연결:

```js
const GOOGLE_G_ICON = require("./assets/google-g.png");
const MEMORIA_CHARACTER_IMAGE = require("./assets/ghost_character.png");
const MEMORIA_BACKGROUND_IMAGE = require("./assets/background_decor.png");
const APP_VERSION = require("./app.json").expo.version;
```

Google 버튼:

- 버튼 텍스트는 한국어 기준 `Google 계정으로 계속하기`
- Google 로고는 `assets/google-g.png`
- Google 로그인 설정이 없으면 `Google 로그인 설정 필요`로 비활성화된다.

## 9. 앱 내부 주요 상수와 저장 키

`App.js`의 주요 키:

```js
const STORAGE_KEY = "@memoria/cards";
const FOLDERS_STORAGE_KEY = "@memoria/folders";
const DAILY_STUDY_GOAL_KEY = "@memoria/daily-study-goal";
const THEME_MODE_KEY = "@memoria/theme-mode";
const LANGUAGE_KEY = "@memoria/language";
const STUDY_STATS_KEY = "@memoria/study-stats";
const TUTORIAL_SEEN_KEY = "@memoria/tutorial-seen-v5";
const SUPPORT_REQUESTS_KEY = "@memoria/support-requests";
const STUDY_REMINDERS_ENABLED_KEY = "@memoria/study-reminders-enabled";
const STUDY_REMINDER_IDS_KEY = "@memoria/study-reminder-ids";
const STUDY_REMINDER_LAST_OPENED_KEY = "@memoria/study-reminder-last-opened";
const LEGACY_STORAGE_KEYS = ["@memora/study-pairs"];
```

기본값:

- root folder id: `root`
- 기본 일일 목표: 5
- 기본 문제 수: 10
- session history 최대치: 60

## 10. 메인 탭 구조

탭은 5개다.

1. 저장
   - 한 장씩 카드 저장
   - 파일 가져오기
   - 폴더 생성/선택
   - 카드 저장 전 중복/오류 처리

2. 암기
   - 폴더 범위 선택
   - 문제 수 선택: 5 / 10 / 20 / 전체
   - 출제 방향 선택: 양방향 / 앞면만 / 뒷면만
   - 오답만 다시 풀기
   - 학습 상태와 오답 기록 갱신

3. 기록
   - 오늘 학습 요약
   - 최근 암기 기록
   - 날짜별 기록
   - 오답 복습 진입

4. 보관함
   - 카드 목록
   - 카드 수정/삭제
   - 폴더 수정/삭제
   - 정렬

5. 앱 정보
   - Google 로그인/로그아웃
   - 관리자 표시
   - 계정 / 데이터 삭제
   - 라이트/다크 모드
   - 언어: 한국어 / English / 日本語
   - 학습 알림 ON/OFF
   - 문의하기
   - 튜토리얼 다시보기
   - 앱 버전
   - 개인정보 처리방침 / 이용약관 / 오픈소스 라이선스

## 11. 튜토리얼 상태

튜토리얼은 긴 실습형 단계가 아니라 현재 5개 탭 설명 중심으로 단순화되어 있다.

순서:

1. 저장 탭
2. 암기 탭
3. 기록 탭
4. 보관함 탭
5. 앱 정보 탭

중요 동작:

- 튜토리얼 시작 화면은 유지한다.
- 튜토리얼 시작 화면은 시작 화면과 같은 캐릭터/배경 자산을 쓴다.
- 강조된 UI 자체를 눌러 진행하지 않는다.
- 사용자는 `다음으로` 버튼으로만 진행한다.
- 마지막 단계 버튼은 `튜토리얼 종료`다.
- 튜토리얼 완료 저장 키는 `@memoria/tutorial-seen-v5`다.

## 12. 파일 가져오기 상태

지원 확장자:

- `txt`
- `csv`
- `xls`
- `xlsx`
- `docx`

구현 파일:

- `src/utils/import-files.js`

형식:

- TXT/DOCX:
  - 앞면 한 줄, 뒷면 다음 줄
  - 빈 줄로 카드와 카드를 구분
- CSV/XLS/XLSX:
  - 1열에 앞면
  - 2열에 뒷면
  - 현재는 첫 시트, 첫 두 열 기준으로 읽는다.

현재 UX:

- 파일 선택 후 즉시 저장하지 않는다.
- 미리보기 모달에서 저장 예정, 중복 제외, 형식 오류, 읽은 항목, 저장 위치, 예시 3개를 보여준다.
- 저장 확정 시 `prepareEntryBatch` 기준으로 미리보기와 같은 판정 기준을 사용한다.
- 형식이 맞지 않으면 앱 커스텀 팝업 느낌의 안내가 뜬다.

주의:

- 사용자는 대량 가져오기를 1열/2열 방식으로 이해하고 있다.
- 행이 많아도 이 구조면 대량 저장 가능하다.
- 다만 여러 시트 선택, 열 매핑, 헤더 자동 인식 같은 고급 UX는 아직 없다.

## 13. OCR / 카메라 상태

- 과거에 있던 사진 OCR 저장 기능은 제거되었다.
- 카메라, OCR, ImagePicker, ML Kit 관련 흐름은 현재 앱 기능에서 제외된 상태다.
- 다시 추가하려면 기능 플래그와 개인정보/권한 안내까지 함께 설계해야 한다.

## 14. 답안 판정 / 학습 상태

구현 파일:

- `src/utils/memory.js`

현재 답안 판정:

- 정규화 후 비교
- 앞뒤 공백, 중복 공백, 대소문자 등은 어느 정도 처리한다.
- 내부 띄어쓰기 자체를 완전히 무시하는 수준은 아니다.

의견 메모:

- 기본은 너무 빡빡하지 않게 공백/대소문자 정도는 봐주는 쪽이 좋다.
- 장기적으로는 `엄격 모드`와 `관대한 모드`를 옵션으로 나누는 것이 좋다.

학습 상태:

- `study_stats`에는 카드별 통계와 세션 기록이 들어간다.
- 원격 동기화 시 `mergeStudyStats`로 로컬/원격 학습 상태를 병합한다.
- `memory_user_state` 테이블이 있어야 계정 간 학습 기록, 오답 기록, 일일 목표 동기화가 제대로 동작한다.

## 15. Supabase DB 구조

주요 테이블:

- `user_profiles`
  - 사용자 프로필, role
- `app_usage_events`
  - 로그인 사용자의 앱 실행 기록
- `memory_pairs`
  - 카드 앞면/뒷면, folder_id
- `memory_folders`
  - 폴더 구조
- `memory_user_state`
  - `daily_study_goal`
  - `study_stats`
- `support_inquiries`
  - 문의하기 내용과 처리 상태

관리자 관련:

- `user_profiles.role = 'admin'`
- `get_admin_dashboard_metrics()` RPC
- 앱 정보 탭에서 관리자 문의함/운영 지표가 보이는 구조

중요 migration:

- `supabase/migrations/20260519_add_memory_user_state.sql`
- Supabase 프로젝트에 이 migration 또는 최신 `supabase/schema.sql`이 적용되어 있어야 한다.
- 이 migration에는 `memory_user_state` RLS와 support/app usage 삭제 policy도 포함되어 있다.

## 16. 계정 / 데이터 삭제

앱 정보 탭 문구:

- Google 계정 자체는 삭제되지 않는다.
- 메모리아에 저장된 데이터만 삭제된다.

삭제 대상:

- 저장 카드
- 폴더
- 학습 기록
- 오답 기록
- 일일 목표
- 문의 기록
- 동기화 데이터
- 앱 실행 기록

구현 함수:

- `deleteMemoriaAccountData`

원격 삭제 대상:

- `memory_pairs`
- `memory_folders`
- `memory_user_state`
- `app_usage_events`
- `support_inquiries`

문서:

- `docs/privacy-policy-ko.md`
- `docs/data-deletion-ko.md`

현재 공개 문서 placeholder는 `youwon35`, `youwon35@gmail.com`으로 교체되어 있다. Google Play에 노출할 공식 개발자명/고객지원 이메일이 다르면 출시 전 이 값들을 통일해야 한다.

## 17. 개인정보 / 약관 / Play 등록 정보

최근 점검에서 실제 동작과 맞춘 부분:

- 앱 내 개인정보 처리방침 한국어/영어/일본어 문구 보강
- 일일 목표, 문의 기록, 앱 실행 기록, 동기화 데이터까지 삭제 범위에 명시
- 오픈소스 라이선스 문구에서 `배포 전 점검`처럼 보이는 표현 제거
- `docs/privacy-policy-ko.md`와 `docs/data-deletion-ko.md`의 placeholder 제거
- `store/google-play-listing.md`의 출시 노트와 데이터 삭제 요청 가능 문구 갱신

출시 전 해야 할 일:

- 개인정보처리방침 문서를 실제 공개 URL로 게시
- 계정/데이터 삭제 안내 문서를 실제 공개 URL로 게시
- Play Console의 Data safety 답변을 앱 동작과 맞게 입력
- 고객지원 이메일/개발자명 표기를 최종 결정

## 18. 다국어 상태

파일:

- `src/i18n.js`

지원 언어:

- 한국어
- English
- 日本語

앱 이름:

- ko: `메모리아`
- en: `Memoria`
- ja: `メモリア`

주의:

- `src/i18n.js`가 매우 크다.
- 번역 수정 시 중괄호 placeholder와 키 이름을 망가뜨리지 않게 조심해야 한다.
- 한국어에서 `Memoria`와 `메모리아` 표기가 섞이지 않도록 의도적으로 확인한다.

## 19. 출시 / 브랜치 운영 방식

현재 합의한 흐름:

1. 평소 개발은 `develop`에서 한다.
2. 충분히 검증되면 버전 필요 여부를 판단한다.
3. Play Console에 새 AAB를 올려야 하면 Android `versionCode`는 반드시 증가해야 한다.
4. 사용자에게 보이는 `versionName`은 꼭 매번 올릴 필요는 없다.
5. 정식 릴리스로 삼을 때 `main`에도 같은 커밋을 반영한다.

현재 `eas.json` 설정상 production build는 versionCode를 자동 증가한다.

릴리스 전 검증 추천:

```powershell
npx tsc --noEmit
git diff --check
npx expo export --platform android --output-dir .expo-export --clear
npx expo-doctor
npx eas-cli build --platform android --profile production --non-interactive --no-wait
```

실기기에서 꼭 볼 것:

- 신규 설치 첫 실행
- 시작 화면 Google 버튼 활성화 여부
- Google 로그인 완료 여부
- 게스트 시작
- 튜토리얼 시작/종료
- 파일 가져오기 미리보기
- 카드 저장/암기/기록/오답
- 계정 / 데이터 삭제
- Android launcher icon이 잘리지 않는지

## 20. 최근 완료된 큰 작업 흐름

최근 작업 흐름 요약:

- 튜토리얼을 5개 탭 중심으로 단순화
- 튜토리얼 overlay 강조 클릭을 막고 `다음으로` 버튼 중심으로 진행
- 튜토리얼 종료 팝업을 앱 커스텀 모달 디자인으로 통일
- 시작 화면과 튜토리얼 인트로를 Figma 자산 기반으로 재구성
- 캐릭터/배경을 분리하고 safe area 기반 반응형 배치 적용
- 캐릭터 주변 점선 원 위치 조정
- Google 로그인 버튼에 공식 스타일 컬러 G 아이콘 적용
- Google 로그인 production 환경변수 누락 수정
- 학습 기록/오답 기록/일일 목표를 `memory_user_state`로 동기화
- 계정 삭제 시 원격 카드/폴더뿐 아니라 학습 상태, 문의, 앱 실행 기록까지 삭제하도록 보강
- 파일 가져오기 전 미리보기 추가
- TXT 예시 옆에 XLS/Excel 예시 UI 추가
- 개인정보/데이터 삭제 문구와 Play 등록 정보 초안 정리
- production AAB `1.0.1 / versionCode 8` 생성
- 2026-05-20 내부 테스트 저장 실패 수정
  - `saveEntryBatch`가 함수 밖 변수 `existingPairs`를 참조해 단일 카드 저장과 파일 가져오기 저장이 중단될 수 있던 문제를 수정했다.
  - 원인은 Supabase DB보다 앱 저장 로직의 스코프 오류에 가까웠다. Supabase 저장이 실패해도 로컬 저장까지는 이어질 수 있게 기존 카드 목록을 `prepareEntryBatch` 결과로 명시 전달한다.
- 보관함 다중 선택 삭제 추가
  - 카드 왼쪽 체크 버튼으로 여러 카드를 선택할 수 있다.
  - 보관함 상단 선택 바에서 전체 선택, 선택 해제, 선택 삭제를 할 수 있다.
  - Google 로그인 상태에서 cloud 카드가 선택되면 `memory_pairs`에서도 선택 카드들을 삭제한다.
- production AAB `1.0.2 / versionCode 9` 생성
  - EAS build ID: `cfa0066e-5ffa-47e7-b88d-47fb1aa39a6e`
  - AAB: https://expo.dev/artifacts/eas/rD2FNeHu4EaUXitKJ9ZYTq.aab
  - Commit: `cfd951f8ce58f87e7314dcc6c8e29fee90b4de0b`
- 2026-05-20 파일 가져오기 예시/보관함 선택 흐름 개선
  - 파일 가져오기 안내 미리보기에서 하단 형식 힌트 문구를 제거했다.
  - 예시 텍스트를 추상 placeholder가 아니라 실제 카드 예시 `안녕 / Hello`, `해 / Sun`으로 교체했다.
  - 예시 파일명 표기에서 `/` 구분자를 없애고 `cards-example.txt`, `cards-example.xls`를 간격으로 나눠 보여준다.
  - 보관함은 기본 상태에서 체크박스를 보이지 않게 하고, `여러개 선택` 버튼을 누른 뒤에만 다중 선택 UI가 열린다.
  - 선택 모드에서는 전체 선택, 선택 삭제, 취소, 선택 카드 폴더 이동을 지원한다.
- production AAB `1.0.3 / versionCode 10` 생성
  - EAS build ID: `6539f525-e33c-44f0-858d-a8cea15fb13a`
  - AAB: https://expo.dev/artifacts/eas/duZy4o5t6LMbyXqq5iiqTm.aab
  - Commit: `c6ec4e9c9b7dfb859977a8df754d0082e90cbd66`
- 2026-05-21 앱 정보 탭 관리자 전용 정보 노출 수정
  - 로그아웃/일반 사용자 상태에서 문의하기 카드 아래 `최근 문의` 목록이 보이지 않도록 제거했다.
  - 관리자 여부를 단순 `role === admin`이 아니라 `로그인 세션 존재 + admin role`로 판단하도록 강화했다.
  - 로그아웃 시 관리자 지표, 관리자 문의 목록, 관리자 필터 상태, 로컬 문의 기록 상태를 즉시 비우도록 했다.
  - 앱 정보 탭 기준 일반 사용자에게 남는 항목은 로그인/로그아웃, 계정/데이터 삭제(로그인 시), 화면 모드, 언어, 문의하기 작성 폼, 튜토리얼 다시보기, 앱 버전/정책/라이선스다.
  - 관리자만 보는 항목은 관리자 배지, 운영 지표, 관리자 문의함, 전체 문의 상태 변경 UI다.
  - 앱 버전을 `1.0.4`로 올렸다.
- production AAB `1.0.4` 생성 시도
  - 기능 커밋: `aa54d059e2b13053b42dca8680f34be8c4199a8c`
  - EAS가 versionCode를 `10 -> 11`로 증가시킨 뒤 무료 플랜 Android 빌드 한도 소진으로 실패했다.
  - 새 AAB URL은 생성되지 않았다.
  - 다음 시도는 EAS 플랜 업그레이드 또는 2026-06-01 한도 리셋 이후 가능하다.
- 2026-05-28 앱 아이콘과 학습 알림 추가
  - `app-icon.png`, `assets/adaptive-icon.png`의 옅은 보라색 배경을 더 진한 보라 계열로 보정해 런처에서 캐릭터와 카드가 더 잘 분리되게 했다.
  - `expo-notifications`를 추가하고, Android notification channel과 로컬 예약 알림 스케줄러를 구현했다.
  - 앱 정보 탭에 학습 알림 ON/OFF 스위치를 추가했다.
  - 알림을 켜면 권한을 요청하고, 마지막 앱 실행 시점을 기준으로 1, 2, 3, 5, 8, 14, 21, 30일 뒤 오후 8시에 알림을 예약한다.
  - 앱을 다시 열면 미접속 기간이 리셋되어 예약 알림도 다시 계산된다.
  - 알림을 끄면 저장된 예약 알림 ID와 `memoria-study-reminder-` prefix의 예약 알림을 취소한다.
  - 앱 버전을 `1.0.5`로 올렸다.
  - `metro.config.js`를 Expo 기본 Metro config 확장 형태로 추가해 `expo-doctor`의 Metro config 검사를 통과시켰다.
  - 검증: `npx tsc --noEmit`, `git diff --check`, `npx expo install --check`, `npx expo-doctor`, `npx expo export --platform android --output-dir .expo-export --clear` 통과.
- production AAB `1.0.5` 생성 시도
  - 기능 커밋: `06dc2557dd91e6c8c20fe0499ee66a3f244df6bd`
  - EAS가 versionCode를 `11 -> 12`로 증가시킨 뒤 무료 플랜 Android 빌드 한도 소진으로 실패했다.
  - 새 AAB URL은 생성되지 않았다.
  - 대신 로컬 dev build APK를 생성했다: `D:\github\APP\memorize_app2\.expo\local-builds\memoria-dev-1.0.5-reminders-debug.apk`
  - 다음 AAB 시도는 EAS 플랜 업그레이드 또는 2026-06-01 한도 리셋 이후 가능하다.
- 2026-05-28 튜토리얼 인트로/문제 수 버튼/Google 로그인 준비 개선
  - 튜토리얼 인트로의 `M E M O R I A` 아래에 `오신것을 환영해요!` 문구를 추가했다.
  - 튜토리얼 인트로 시작 버튼 문구를 `시작하기`에서 `튜토리얼 시작하기`로 바꿨다.
  - 문제 수 preset 버튼의 활성 판정을 exact match 기반으로 바꿨다. 가능한 문제가 6개일 때 `10`이나 `20`을 눌러 6문제로 clamp되어도 10/20 버튼이 같이 보라색이 되지 않는다.
  - `전체` 버튼은 현재 문제 수가 가능한 전체 수와 같고, 5/10/20 preset과 겹치지 않을 때만 활성화된다.
  - Google ID token direct 로그인 경로를 준비했다. `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`가 있으면 Supabase OAuth URL 대신 Google provider에서 받은 ID token으로 Supabase 세션을 만든다.
  - 현재 `.env`에는 Google client ID가 없으므로 기본 동작은 기존 Supabase OAuth fallback이다.
  - 앱 버전을 `1.0.6`으로 올렸다.
  - 검증: `npx tsc --noEmit`, `git diff --check`, `npx expo install --check`, `npx expo export --platform android --output-dir .expo-export --clear`, `npx expo-doctor` 통과.
  - 로컬 dev build APK: `D:\github\APP\memorize_app2\.expo\local-builds\memoria-dev-1.0.6-tutorial-quiz-auth-debug.apk`
- 2026-05-28 Google direct auth redirect 수정
  - 기존 direct auth가 Supabase fallback용 redirect인 `memoria://auth/callback`을 Google AuthSession에도 넘겨 Google에서 `invalid_request`가 날 수 있었다.
  - Android OAuth direct auth의 redirect를 현재 APK manifest에 등록된 `memoria` scheme 기반 `memoria:/oauthredirect`로 바꿨다.
  - Supabase fallback OAuth는 기존처럼 `memoria://auth/callback`을 유지한다.
  - Google에서 계속 `invalid_request`가 나면 Android OAuth client 상세에서 custom URI scheme 허용 옵션이 켜져 있는지 확인해야 한다.
  - 새 APK는 만들지 않았다. 기존 1.0.6 dev build에서 Metro를 재시작/새로고침하면 반영된다.
  - 검증: `npx tsc --noEmit`, `git diff --check`, `npx expo install --check`, `npx expo export --platform android --output-dir .expo-export --clear` 통과.
- 2026-05-28 Google direct auth Android scheme 재수정 및 1.0.7 dev build 생성
  - 사용자가 Google Cloud Android OAuth client에 package `com.youwon35.memoria`, SHA-1 `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`, custom URI scheme 허용을 설정했지만 Google이 `memoria:/oauthredirect`를 계속 `invalid_request`로 거절했다.
  - Android OAuth direct auth redirect를 패키지명 기반 `com.youwon35.memoria:/oauthredirect`로 바꿨다.
  - `app.json`의 `scheme`을 배열로 바꿔 기존 Supabase fallback용 `memoria`와 Google direct auth용 `com.youwon35.memoria`를 동시에 등록했다.
  - 앱 버전을 `1.0.7`로 올렸다.
  - 새 로컬 dev build APK를 생성했다: `D:\github\APP\memorize_app2\.expo\local-builds\memoria-dev-1.0.7-google-scheme-debug.apk`
  - `aapt`로 APK manifest를 확인했고 `memoria`, `com.youwon35.memoria`, `exp+memoria` scheme이 등록되어 있다.
  - `apksigner --print-certs`로 확인한 APK SHA-1은 `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`라서 사용자가 Google Cloud에 넣은 값과 일치한다.
  - 검증: `npx tsc --noEmit`, `git diff --check`, `npx expo install --check`, `npx expo-doctor`, `npx expo export --platform android --output-dir .expo-export --clear`, `expo prebuild`, `android\gradlew.bat -p android :app:assembleDebug` 통과.
- 2026-05-29 Google direct auth code 교환 보강
  - 사용자가 Google 동의 화면에서 `계속`을 누른 뒤 Google 로딩 화면까지 진행되는 것을 확인했다.
  - Android Google AuthSession은 native app에서 기본적으로 `response_type=code`를 사용하므로, `promptGoogleIdTokenAsync()`가 즉시 `id_token`을 주지 않고 먼저 `code`를 돌려줄 수 있다.
  - 기존 코드는 `promptGoogleIdTokenAsync()` 반환값에서 바로 `id_token`을 찾았기 때문에, Google redirect가 성공해도 Supabase `signInWithIdToken`까지 안정적으로 이어지지 않을 수 있었다.
  - `AccessTokenRequest`를 사용해 Google이 돌려준 authorization code를 직접 `id_token`/`access_token`으로 교환한 뒤 Supabase `signInWithIdToken`에 넘기도록 보강했다.
  - Expo Google hook의 자동 code exchange와 중복되지 않도록 `shouldAutoExchangeCode: false`를 설정했다.
  - native scheme 변경이 아니므로 새 APK는 만들지 않았다. 기존 `1.0.7` dev build에서 Metro를 재시작하면 반영된다.
  - 검증: `npx tsc --noEmit`, `git diff --check`, `npx expo install --check`, `npx expo export --platform android --output-dir .expo-export --clear` 통과.
- 2026-05-29 Google client ID 기반 redirect scheme 및 1.0.8 dev build 생성
  - 사용자가 Google 동의 후에도 앱으로 돌아오지 않고 Google 웹페이지에 머무는 현상을 다시 보고했다.
  - 이 단계에서는 Google 인증 자체보다 Android가 redirect 딥링크를 앱에 전달하지 못하는 문제가 더 유력하다고 판단했다.
  - Android OAuth direct auth redirect scheme을 Google Android client ID에서 파생한 reverse-DNS scheme으로 바꿨다.
  - 새 redirect URI: `com.googleusercontent.apps.852267252395-oaqdf00qj7j0fkgi08pgh01vggggvjoj:/oauthredirect`
  - `app.json` scheme에 기존 `memoria`, `com.youwon35.memoria`와 함께 `com.googleusercontent.apps.852267252395-oaqdf00qj7j0fkgi08pgh01vggggvjoj`를 추가했다.
  - 앱 버전을 `1.0.8`로 올렸다.
  - 새 로컬 dev build APK를 생성했다: `D:\github\APP\memorize_app2\.expo\local-builds\memoria-dev-1.0.8-google-client-scheme-debug.apk`
  - `aapt`로 APK manifest를 확인했고 `memoria`, `com.youwon35.memoria`, `exp+memoria`, `com.googleusercontent.apps.852267252395-oaqdf00qj7j0fkgi08pgh01vggggvjoj` scheme이 등록되어 있다.
  - `apksigner --print-certs`로 확인한 APK SHA-1은 `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`라서 Google Cloud Android client에 등록된 값과 일치한다.
  - 검증: `npx tsc --noEmit`, `git diff --check`, `npx expo install --check`, `npx expo export --platform android --output-dir .expo-export --clear`, `expo prebuild`, `android\gradlew.bat -p android :app:assembleDebug` 통과.

## 21. 다음 작업자가 꼭 기억할 것

- 사용자는 한국어로 대화한다.
- 사용자는 디자인 디테일, 특히 캐릭터 원본 비율과 시작 화면 균형에 민감하다.
- 앱은 웹앱이 아니라 실제 Expo/React Native 모바일 앱이다.
- Expo Go SDK 54를 언급했지만 현재 프로젝트는 `expo-dev-client` 기반이다.
- 네이티브 모듈이 바뀌면 기존 dev build로는 오류가 날 수 있고, 새 development build가 필요하다.
- 코드 변경이 생기면 AGENTS.md 지시에 따라 `develop`에 commit/push까지 완료해야 한다.
- 중요한 작업 후에는 `F:\동기화용 파일\인쇄용\memorize_app2_print.py`에도 작업 요약을 이어 붙이고, Notion 프로젝트 페이지의 `요약` 토글에도 같은 흐름을 문서형으로 남기는 규칙이 있다.
- 수동 파일 수정은 `apply_patch`를 사용한다.
- 기존 사용자 변경사항은 임의로 되돌리지 않는다.
- 미추적 `want.png`는 건드리지 않는다.

## 22. 현재 남은 재점검 포인트

- Supabase production 프로젝트에 최신 schema/migration이 실제 적용되어 있는지 확인
- Supabase redirect URL에 `memoria://auth/callback`이 들어가 있는지 확인
- Play Console에 개인정보처리방침 URL과 데이터 삭제 URL을 공개 웹페이지로 연결
- Google Play Data safety 입력을 현재 문서와 맞추기
- 내부 테스트 AAB 설치 후 Google 로그인 버튼이 활성화되는지 확인
- 실제 Google 로그인 완료 후 카드/폴더/학습 상태 동기화 확인
- 계정 / 데이터 삭제 실행 후 Supabase 원격 데이터가 실제로 지워지는지 확인
- 태블릿/긴 화면/짧은 화면에서 시작 화면과 튜토리얼 인트로 균형 확인
- Android 런처 아이콘 adaptive mask 확인
- `src/i18n.js`의 영어/일본어 정책 문구를 사람이 자연스럽게 읽히는지 마지막으로 확인
- `1.0.4` 관리자 문의 노출 수정, `1.0.5` 아이콘/학습 알림 수정, `1.0.6` 튜토리얼/문제 수 버튼/Google direct auth 준비, `1.0.7` Google direct auth Android redirect scheme 수정, `1.0.8` Google client ID 기반 redirect scheme 수정 AAB는 아직 생성되지 않았다. EAS 빌드 한도 리셋 또는 플랜 업그레이드 후 다시 production build를 실행하고, 실제 versionCode와 AAB URL을 확인해야 한다.
