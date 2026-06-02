# MEMORIA / 메모리아 Handoff

Last updated: 2026-05-30 KST

이 문서는 다음 채팅방에서 `D:\github\APP\memorize_app2` 프로젝트를 바로 이어받기 위한 최신 인수인계 문서다. 이전 `handoff.md` 내용은 이 요약본으로 덮어썼다.

## 1. 프로젝트 목적

MEMORIA는 Expo SDK 54 / React Native 기반의 실제 모바일 암기 앱이다. 사용자는 앞면/뒷면 카드쌍을 저장하고 폴더로 정리한 뒤, 암기 탭에서 문제를 풀고 기록/오답/일일 목표를 관리한다. Google 로그인 시 Supabase를 통해 카드, 폴더, 학습 상태, 일일 목표, 문의 기록을 동기화한다.

앱의 핵심 방향은 단순 플래시카드 저장이 아니라 “내가 자주 틀리는 카드가 다시 잘 나오고, 보관함에서 약한 카드를 한눈에 볼 수 있는 암기 앱”이다.

## 2. 현재 상태 요약

- 작업 폴더: `D:\github\APP\memorize_app2`
- 기본 작업 브랜치: `develop`
- GitHub 저장소: `https://github.com/youwon35/memorize_app2`
- 현재 앱 버전: `1.0.8`
- 현재 추적되지 않은 파일: `want.png`
  - 사용자가 둔 참고 이미지로 보이며, 별도 요청 전에는 건드리지 말 것.
- 최신 주요 작업:
  - Google direct auth 성공 흐름 구성
  - 보관함 정답률/숨김/streak/유사 정답/오답률 우선 출제 개선
  - 게스트 시작과 Google 계정 세션 분리
  - 로그아웃 시 Google 계정 로컬 캐시 초기화
  - 보관함 정렬 옵션을 등록시간/오답횟수/오답률로 분리
  - 다중선택 모드의 이동 버튼 제거

## 3. 기술 스택

- Expo: `~54.0.34`
- React Native: `0.81.5`
- React: `19.1.0`
- TypeScript: `~5.9.2`
- Supabase JS: `^2.102.0`
- 네이티브 빌드 확인 방식: `expo-dev-client`
- 주요 네이티브 모듈:
  - `expo-auth-session`
  - `expo-web-browser`
  - `expo-secure-store`
  - `expo-notifications`
  - `expo-document-picker`
  - `expo-file-system`

일반 Expo Go만으로는 이 앱의 최신 상태를 충분히 확인할 수 없다. Google auth redirect scheme, 알림, dev client 설정 등이 들어가 있으므로 최신 development build 설치 후 Metro에 연결해 테스트하는 구조다.

## 4. 주요 파일 구조

- `App.js`
  - 앱의 대부분 UI/상태/동기화 흐름이 들어 있는 메인 파일.
  - 저장/암기/기록/보관함/앱 정보 탭, 시작 화면, 튜토리얼, Google 로그인, Supabase sync, 알림 설정이 모두 여기 있다.
- `src/utils/memory.js`
  - 카드 정규화, import parsing, 학습 통계, 정답 판정, deck 생성, 숨김 카드 상태, 오답률 우선 출제 로직.
- `src/utils/import-files.js`
  - txt/csv/xls/xlsx/docx 파일 가져오기 처리.
- `src/i18n.js`
  - 한국어/영어/일본어 문구.
- `src/lib/supabase.js`
  - Supabase client, SecureStore 기반 auth storage.
- `supabase/schema.sql`
  - 주요 테이블, RLS, 관리자 지표 RPC.
- `supabase/migrations`
  - `memory_folders`, `memory_user_state` 관련 마이그레이션.
- `app.json`
  - 앱 이름, 버전, Android package, schemes, adaptive icon, EAS project id.
- `eas.json`
  - development/preview/production build profile.
- `scripts/start-dev-build.ps1`
  - dev build용 Metro 실행 스크립트.

## 5. 인증 / Google 로그인

현재 목표는 Supabase hosted OAuth 화면에 `supabase.co로 이동` 문구가 보이지 않도록 Google ID token direct auth를 사용하는 것이다.

현재 direct auth 흐름:

1. `expo-auth-session/providers/google`로 Google authorization code를 받는다.
2. `AccessTokenRequest`로 code를 `id_token`/`access_token`으로 교환한다.
3. Supabase `signInWithIdToken({ provider: "google" })`로 Supabase 세션을 만든다.

중요 설정:

- Android package: `com.youwon35.memoria`
- 앱 scheme:
  - `memoria`
  - `com.youwon35.memoria`
  - `com.googleusercontent.apps.852267252395-oaqdf00qj7j0fkgi08pgh01vggggvjoj`
- 현재 Google direct auth redirect URI:
  - `com.googleusercontent.apps.852267252395-oaqdf00qj7j0fkgi08pgh01vggggvjoj:/oauthredirect`
- Supabase fallback OAuth redirect URI:
  - `memoria://auth/callback`
- `.env`에 필요한 값:
  - `EXPO_PUBLIC_SUPABASE_URL`
  - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
  - `EXPO_PUBLIC_APP_SCHEME=memoria`
  - `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`

Supabase Google Provider 설정에서 중요한 점:

- Google Provider의 Client IDs에는 Web client ID를 먼저 넣고, 쉼표 뒤에 Android client ID를 추가해야 한다.
- Android ID만 넣으면 Supabase 쪽 검증에서 실패할 수 있다.
- 이 설정을 고친 뒤 사용자가 Google 로그인 성공을 확인했다.

2026-05-30 변경:

- Google 로그인 요청에서 `selectAccount: true`를 제거했다.
- Supabase fallback OAuth의 `prompt=consent`도 제거했다.
- 목적: 한 번 로그인한 뒤 다음 로그인 시 Google 계정 선택 화면이 매번 뜨지 않고 가능한 한 기존 Google 세션을 재사용하도록 하기 위함.
- 단, 사용자가 실제로 로그아웃했거나 Android/Google 쪽 세션이 없으면 Google이 보안상 계정 선택 또는 동의 화면을 다시 띄울 수 있다.

## 6. 로그아웃 / 게스트 / 로컬 캐시 정책

기존 문제:

- Google 계정에서 로그아웃해도 저장/기록/보관함 탭에 Google 계정 카드가 그대로 남아 있었다.
- 로그아웃 상태에서 `달` 같은 카드를 삭제해도, 다시 로그인하면 Supabase 원격 데이터와 병합되면서 카드가 되살아났다.
- 원인은 Google 계정 데이터가 AsyncStorage 로컬 캐시에 남아 있었고, 로그아웃은 auth session만 끊고 카드/폴더/학습 상태 캐시는 비우지 않았기 때문이다.

현재 정책:

- Google 로그아웃 시 계정에서 내려온 로컬 캐시를 비운다.
- 게스트 시작 시 기존 Google/Supabase 세션이 있으면 로컬 세션을 끊고 계정 캐시를 비운다.
- 로그아웃 뒤에는 Google 계정 카드가 보이지 않는 것이 맞다.
- 로그아웃 상태에서 카드를 삭제해도 원격 데이터가 삭제되는 것은 아니다. 원격 삭제는 로그인 상태에서 삭제해야 Supabase에도 반영된다.
- 계정 전체 데이터를 지우려면 앱 정보 탭의 계정/데이터 삭제 흐름을 사용한다.

관련 함수:

- `resetLocalAccountCache`
  - 카드, 폴더, 학습 통계, 일일 목표, deck, 선택 상태, 지원 문의 캐시 등을 초기화한다.
  - AsyncStorage의 `@memoria/cards`, `@memoria/folders`, `@memoria/study-stats`, `@memoria/daily-study-goal`, legacy key를 제거한다.
- `signOut`
  - Supabase signOut 후 `resetLocalAccountCache({ clearSupport: true })`를 호출한다.
- `continueFromLaunchAsGuest`
  - 기존 세션이 있으면 local signOut 후 계정 캐시를 초기화하고 게스트로 들어간다.

## 7. 데이터 저장 / 동기화

로컬 저장:

- 카드: `@memoria/cards`
- 폴더: `@memoria/folders`
- 학습 통계: `@memoria/study-stats`
- 일일 목표: `@memoria/daily-study-goal`
- 문의 캐시: `@memoria/support-requests`
- 알림 설정: `@memoria/study-reminders-enabled`

Supabase 테이블:

- `memory_pairs`
  - 카드 앞면/뒷면, user_id, folder_id.
- `memory_folders`
  - 폴더 구조.
- `memory_user_state`
  - daily_study_goal, study_stats JSON.
  - 숨김 카드 상태도 `study_stats.hiddenCards`에 들어간다.
- `support_inquiries`
  - 문의 내용.
- `user_profiles`
  - role. `admin`일 때만 관리자 UI 노출.
- `app_usage_events`
  - 운영 지표용 앱 실행 기록.

동기화 방식:

- 로그인 후 시작 화면을 닫고 앱으로 들어갈 때 cloud sync가 동작한다.
- 원격 pair/folder와 로컬 pair/folder를 병합한다.
- 로컬에만 있던 카드가 있으면 로그인 시 Supabase로 업로드될 수 있다.
- 학습 통계와 일일 목표는 `memory_user_state`에서 병합된다.

주의:

- 로그아웃 상태에서 원격 카드가 삭제되는 일은 없다.
- 로그인 상태에서 삭제해야 Supabase의 `memory_pairs` 삭제가 함께 일어난다.
- 계정 삭제는 카드/폴더/학습 상태/문의/앱 실행 기록까지 삭제한다.

## 8. 핵심 기능 상태

저장 탭:

- 한 장씩 저장.
- txt/csv/xls/xlsx/docx 파일 가져오기.
- 폴더 선택 후 저장.
- 파일 예시는 실제 단어 예시 `안녕/Hello`, `해/Sun`으로 표시된다.

암기 탭:

- 폴더 및 하위 폴더 기준으로 출제.
- 문제 수 5/10/20/전체 preset.
- 출제 방향: 양방향, 앞면만, 뒷면만.
- 숨김 카드 제외.
- 오답률/오답횟수/최근 오답/미학습/오래 안 본 카드 우선으로 후보 선정 후 최종 순서 랜덤.
- 같은 카드의 앞->뒤, 뒤->앞이 가능하면 바로 붙지 않도록 순서를 펼침.
- 정답 판정은 대소문자, 공백, 일부 문장부호, 한국어 조사, 긴 단어의 작은 오타를 어느 정도 허용한다.

기록 탭:

- 오늘 학습 횟수, 푼 문제, 오답 수, 일일 목표, 연속 학습 streak.
- 날짜별 학습 기록.
- 최근 세션의 오답만 다시 풀기.
- 숨김 카드는 오답 다시풀기에서도 제외된다.

보관함 탭:

- 카드 수정/삭제.
- 스와이프 액션으로 수정, 숨김/해제, 삭제.
- 카드별 정답률 숫자와 색상 바 표시.
- 정답률 색상:
  - 80% 이상: 초록
  - 50~79%: 노랑
  - 50% 미만: 빨강
  - 미학습: 미학습 상태
- 정렬:
  - 등록시간 순
  - 오답횟수 순
  - 오답률순
- 다중선택:
  - 여러개 선택
  - 전체 선택
  - 선택 삭제
  - 취소
  - 2026-05-30 기준 이동 버튼은 제거됨.

앱 정보 탭:

- Google 로그인/로그아웃.
- 계정/데이터 삭제.
- 화면 모드, 언어.
- 학습 알림 ON/OFF.
- 문의하기.
- 튜토리얼 다시보기.
- 앱 버전, 개인정보 처리방침, 이용약관, 오픈소스 라이선스.
- 관리자일 때만 운영 지표와 관리자 문의함 노출.

## 9. 학습 알림

- `expo-notifications` 기반 로컬 예약 알림.
- 매일 무한 반복이 아니라 마지막 앱 실행 기준으로 1, 2, 3, 5, 8, 14, 21, 30일 뒤 오후 8시에 예약한다.
- 앱을 다시 열면 알림 간격이 다시 계산된다.
- 앱 정보 탭의 스위치로 켜고 끈다.
- 2026-05-29 이후 스위치 아래 `켜짐/꺼짐`, 성공 안내 문구는 제거했다.
- 저장 실패 같은 예외만 팝업으로 표시한다.

## 10. 관리자 기능

관리자 판정:

- `session.user.id`가 있고 `user_profiles.role === "admin"`일 때만 `isAdmin`.

관리자에게만 보이는 것:

- 관리자 배지.
- 운영 지표.
- 관리자 문의함.
- 전체 문의 목록.
- 문의 상태 변경 UI.

일반/로그아웃 사용자에게 보이지 않아야 하는 것:

- 다른 사용자의 문의 목록.
- 관리자 운영 지표.
- 관리자 문의 상태 변경 UI.

과거에 로그아웃 상태에서 문의 내용이 보이는 문제가 있었고, 현재는 일반 최근 문의 목록을 제거하고 관리자 조건을 강화했다.

## 11. 현재 dev build

현재 실기기 확인용 dev build:

- 파일: `D:\github\APP\memorize_app2\.expo\local-builds\memoria-dev-1.0.8-google-client-scheme-debug.apk`
- App versionName: `1.0.8`
- 빌드 방식: `expo prebuild --platform android --no-install` 후 `android\gradlew.bat -p android :app:assembleDebug`
- APK SHA-1: `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`
- manifest scheme:
  - `memoria`
  - `com.youwon35.memoria`
  - `com.googleusercontent.apps.852267252395-oaqdf00qj7j0fkgi08pgh01vggggvjoj`
  - `exp+memoria`

이번 2026-05-30 변경은 JS/auth 설정/로컬 캐시 정책 변경이라 새 APK를 만들지 않았다. 기존 1.0.8 dev build에서 Metro reload로 확인하면 된다.

## 12. production AAB 상태

최신 성공 production AAB:

- App versionName: `1.0.8`
- Android versionCode: `14`
- EAS build ID: `dc733ae7-3190-4d48-9a97-5a756765a13d`
- AAB: `https://expo.dev/artifacts/eas/tdTdkYwBSeXH6LbauYTMzX.aab`
- Local copy: `D:\github\APP\memorize_app2\.expo\local-builds\memoria-production-1.0.8-v14.aab`
- Logs: `https://expo.dev/accounts/zinnn/projects/memoria/builds/dc733ae7-3190-4d48-9a97-5a756765a13d`
- Commit: `e00f1b48e1300ea1457ff45042be427fd31d985c`
- 완료 시각: 2026-06-02 15:39 KST경
- 파일 크기: 약 61.4 MB

이후 1.0.4/1.0.5 production AAB 시도는 EAS 무료 플랜 Android 월간 빌드 한도 소진으로 실패했다. 한도 리셋일은 2026-06-01로 안내되었다.

2026-06-02 KST production AAB 재시도:

- Build ID: `39e4cbdb-8e29-4e19-86cc-b2bfc984a14a`
- 상태: `CANCELED`
- App versionName: `1.0.8`
- Android versionCode: `13`
- Commit: `e8516b9c519d4684363f18fe7a15c15a44a21085`
- Logs: `https://expo.dev/accounts/zinnn/projects/memoria/builds/39e4cbdb-8e29-4e19-86cc-b2bfc984a14a`
- AAB artifact는 생성되지 않았다.
- 이 빌드는 약 2026-06-02 02:37 KST에 canceled 상태가 되었고, `versionCode 13`은 이미 소모된 빌드 번호로 취급해야 한다. 다음 AAB 재시도 시 remote versionCode가 14 이상으로 증가할 가능성이 높다.

중요:

- Google Play가 중복으로 막는 것은 `versionName`이 아니라 Android 정수 `versionCode`.
- EAS remote autoIncrement가 실패 직전에도 versionCode를 올렸다는 메시지를 냈다.
- 다음 production AAB를 만들 때 실제 versionCode를 반드시 확인해야 한다. 현재 최신 성공 AAB는 `versionCode 14`다.

## 13. 검증 명령

자주 쓰는 검증:

```powershell
npx tsc --noEmit
git diff --check
npx expo install --check
npx expo-doctor
npx expo export --platform android --output-dir .expo-export --clear
```

검증용 `.expo-export`는 커밋하지 말고 삭제한다.

개발 서버:

```powershell
npm start
```

또는:

```powershell
npm run start:tunnel
```

## 14. 작업 규칙

- 사용자는 한국어로 대화한다.
- 사용자는 디자인 디테일과 실제 휴대폰 테스트 흐름에 민감하다.
- 코드 변경이 생기면 `develop` 브랜치에 commit/push까지 완료해야 한다.
- `want.png`는 사용자 참고 파일로 보여 건드리지 않는다.
- 수동 파일 수정은 `apply_patch`를 우선 사용한다.
- 중요한 작업 후:
  - `F:\동기화용 파일\인쇄용\memorize_app2_print.py`에 작업 요약을 이어 붙인다.
  - Notion의 `암기 앱` 페이지 `요약` 토글에도 같은 흐름을 문서형으로 이어 붙인다.
- 앱은 웹앱이 아니라 실제 Expo/React Native 앱이다.
- 네이티브 설정, scheme, plugin, Android manifest에 영향이 있으면 새 dev build 또는 AAB가 필요하다.
- JS/UI 로직만 바뀌면 기존 dev build에서 Metro reload로 확인 가능하다.

## 15. 다음 채팅에서 우선 확인할 것

1. 기존 1.0.8 dev build에서 Metro reload 후 Google 로그인 버튼을 누를 때 계정 선택 화면이 매번 뜨지 않는지 확인.
2. Google 로그인 후 로그아웃하면 저장/기록/보관함에서 Google 계정 카드가 비워지는지 확인.
3. 로그아웃 상태에서 삭제한 카드가 재로그인 후 되살아나는 문제는 “기존 버전에서 남은 로컬 캐시”일 수 있으므로, 새 코드에서 한 번 로그인 후 로그아웃을 실행해 캐시가 정리되는지 확인.
4. 로그인 상태에서 카드 삭제 시 Supabase에서도 삭제되어 재로그인 후 되살아나지 않는지 확인.
5. 2026-06-01 이후 production AAB를 만들 때 versionCode와 AAB URL을 확인.
6. Play Console 내부 테스트에 새 AAB를 올린 뒤 Google 로그인, 카드 저장, 파일 가져오기, 보관함 숨김/정렬/삭제, 로그아웃 캐시 초기화를 실기기에서 다시 확인.
