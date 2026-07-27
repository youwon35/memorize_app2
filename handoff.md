# MEMORIA / 메모리아 Handoff

Last updated: 2026-07-27 KST

이 문서는 다음 채팅방에서 `D:\github\APP\memorize_app2` 프로젝트를 바로 이어받기 위한 최신 인수인계 문서다. 이전 `handoff.md`는 이 문서로 덮어썼다.

## 1. 프로젝트 한 줄 요약

MEMORIA는 Expo SDK 54 / React Native 기반의 실제 모바일 암기 앱이다. 사용자는 앞면/뒷면 카드쌍을 저장하고, 폴더로 정리하고, 파일에서 대량 가져오고, 암기 탭에서 맞춤 문제를 풀며, Google 로그인 시 Supabase로 카드/폴더/학습 상태를 동기화한다.

앱의 핵심 방향은 단순 플래시카드 저장이 아니라 “자주 틀리는 카드가 더 잘 나오고, 보관함에서 약한 카드와 중복 카드를 바로 관리할 수 있는 암기 앱”이다.

## 2. 현재 작업 상태

- 작업 폴더: `D:\github\APP\memorize_app2`
- GitHub 저장소: `https://github.com/youwon35/memorize_app2`
- 기본 작업 브랜치: `develop`
- 현재 출시 상태: 사용자가 Google Play 출시 완료를 확인함
- 다음 유지보수 앱 표시 버전: `1.0.9`
- `1.0.9`는 아직 production DB 마이그레이션과 새 AAB 배포 전인 로컬/`develop` 업데이트다.
- 이 문서 작성 직전 최신 기능 커밋: `4ed8b75 feat: add card management tools`
- 현재 추적되지 않은 파일: `want.png`
  - 사용자가 둔 참고 이미지로 보인다.
  - 별도 요청 전에는 삭제, 이동, 스테이징, 커밋하지 말 것.
- 최근 중요 변경:
  - 보관함 중복 카드 자동 감지
  - 전체 카드 CSV/Excel 내보내기
  - 폴더 색상/아이콘 설정
  - 암기 중 앞글자 힌트 보기
  - 숨김 카드, 정답률 바, 오답률 우선 출제
  - 게스트 시작과 Google 계정 세션/로컬 캐시 분리
  - 로그아웃 시 Google 계정 로컬 카드 캐시 초기화

## 3. 기술 스택

- Expo: `~54.0.36`
- React Native: `0.81.5`
- React: `19.1.0`
- TypeScript: `~5.9.2`
- Supabase JS: `^2.102.0`
- 주요 Expo 모듈:
  - `expo-auth-session`
  - `expo-web-browser`
  - `expo-secure-store`
  - `expo-notifications`
  - `expo-document-picker`
  - `expo-file-system`
  - `expo-dev-client`
- 파일 처리:
  - `xlsx`
  - `jszip`

일반 Expo Go만으로 최신 상태를 충분히 확인하기 어렵다. Google auth redirect scheme, SecureStore, 알림, dev client 설정이 들어가 있으므로 실기기 테스트는 development build 설치 후 Metro에 연결하는 방식이 기본이다.

## 4. 자주 쓰는 명령

개발 서버:

```powershell
npm run start:lan
```

터널 모드:

```powershell
npm run start:tunnel
```

Expo Go UI 확인용 fallback:

```powershell
npm run start:go
```

검증:

```powershell
npx tsc --noEmit
git diff --check
npx expo install --check
npx expo-doctor
npx expo export --platform android --output-dir .expo-export --clear
```

빌드:

```powershell
npm run build:dev
npm run build:preview
npm run build:production
```

주의: `.expo-export`는 검증 산출물이므로 커밋하지 말고 삭제한다.

## 5. 주요 파일 구조

- `App.js`
  - 앱의 대부분 UI, 상태, 동기화, 인증 흐름이 들어 있는 메인 파일.
  - 시작 화면, 튜토리얼, 저장/암기/기록/보관함/앱 정보 탭, Google 로그인, Supabase sync, 알림, export UI가 있다.
- `src/utils/memory.js`
  - 카드 정규화, 학습 통계, 숨김 카드, 폴더 스타일, 정답 판정, deck 생성, 오답률 우선 출제 로직.
- `src/utils/import-files.js`
  - txt/csv/xls/xlsx/docx 파일 가져오기 처리.
- `src/i18n.js`
  - 한국어/영어/일본어 문구.
- `src/lib/supabase.js`
  - Supabase client와 SecureStore 기반 auth storage.
- `supabase/schema.sql`
  - 주요 테이블, RLS, 관리자 RPC.
- `supabase/migrations`
  - `memory_folders`, `memory_user_state` 관련 마이그레이션.
- `app.json`
  - 앱 이름, 버전, Android package, schemes, adaptive icon, EAS project id.
- `eas.json`
  - development/preview/production build profile.
- `scripts/start-dev-build.ps1`
  - dev client Metro 실행 스크립트.
- `docs/privacy-policy-ko.md`
  - 개인정보처리방침 초안.
- `docs/data-deletion-ko.md`
  - 데이터 삭제 안내 초안.
- `store/memoria-feature-graphic.png`
  - Google Play 기능 그래픽.
- `store/google-play-listing.md`
  - Play Store 등록정보 초안.
- `PLAY_STORE_RELEASE.md`
  - Play Console 출시 체크리스트.

## 6. 환경변수와 인증 설정

`.env`에 필요한 값:

```text
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
EXPO_PUBLIC_APP_SCHEME=memoria
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=...
```

Google direct auth 흐름:

1. `expo-auth-session/providers/google`로 Google authorization code를 받는다.
2. `AccessTokenRequest`로 code를 `id_token`/`access_token`으로 교환한다.
3. Supabase `signInWithIdToken({ provider: "google" })`로 Supabase 세션을 만든다.

중요한 Android 설정:

- Android package: `com.youwon35.memoria`
- 등록된 scheme:
  - `memoria`
  - `com.youwon35.memoria`
  - `com.googleusercontent.apps.852267252395-oaqdf00qj7j0fkgi08pgh01vggggvjoj`
- Google direct auth redirect URI:
  - `com.googleusercontent.apps.852267252395-oaqdf00qj7j0fkgi08pgh01vggggvjoj:/oauthredirect`
- Supabase fallback OAuth redirect URI:
  - `memoria://auth/callback`

Supabase Google Provider 설정:

- Client IDs에는 Web client ID를 먼저 넣고, 쉼표 뒤에 Android client ID를 추가한다.
- Android client ID만 넣으면 Supabase가 Google id_token audience 검증에서 실패할 수 있다.
- 사용자가 이 설정을 고친 뒤 Google 로그인이 성공한 상태다.

Google 로그인 반복 계정 선택 관련:

- `selectAccount: true`를 제거했다.
- fallback OAuth의 `prompt=consent`도 제거했다.
- 목적은 같은 Google 세션이 살아 있으면 매번 계정 선택 화면이 뜨지 않게 하는 것이다.
- 단, 사용자가 로그아웃했거나 Android/Google 세션이 없으면 Google이 보안상 계정 선택/동의를 다시 띄울 수 있다.

## 7. 로컬 저장과 Supabase 데이터 모델

로컬 AsyncStorage key:

- 카드: `@memoria/cards`
- 폴더: `@memoria/folders`
- 학습 통계: `@memoria/study-stats`
- 일일 목표: `@memoria/daily-study-goal`
- 문의 캐시: `@memoria/support-requests`
- 학습 알림 설정: `@memoria/study-reminders-enabled`

Supabase 테이블:

- `memory_pairs`
  - 카드 앞면/뒷면, `user_id`, `folder_id`.
- `memory_folders`
  - 폴더 구조.
- `memory_user_state`
  - `daily_study_goal`
  - `study_stats` JSON.
  - `hiddenCards`와 `folderStyles`도 이 JSON 안에 들어간다.
- `support_inquiries`
  - 문의 내용과 상태.
- `user_profiles`
  - 사용자 role. `admin`이면 관리자 UI가 열린다.
- `app_usage_events`
  - 운영 지표용 앱 실행 기록.

동기화 정책:

- 로그인 후 시작 화면을 닫고 앱으로 들어갈 때 cloud sync가 동작한다.
- 원격 카드/폴더와 로컬 카드/폴더를 병합한다.
- 로컬에만 있던 게스트 카드가 있으면 로그인 시 Supabase로 업로드될 수 있다.
- 학습 통계와 일일 목표는 `memory_user_state` 기준으로 병합한다.
- 숨김 카드와 폴더 스타일은 새 DB 컬럼이 아니라 `study_stats` JSON에 저장한다.

## 8. 로그아웃 / 게스트 정책

과거 문제:

- Google 로그아웃 후에도 이전 Google 계정 카드가 저장/기록/보관함에 남아 보였다.
- 로그아웃 상태에서 삭제한 카드가 다시 로그인하면 Supabase 원격 데이터와 병합되며 되살아났다.

현재 정책:

- Google 로그아웃 시 계정에서 내려온 로컬 카드/폴더/학습 상태 캐시를 비운다.
- 게스트 시작 시 기존 Supabase 세션이 남아 있으면 local signOut 후 계정 캐시를 비운다.
- 게스트 카드는 로컬에 저장되며 앱을 껐다 켜도 유지된다.
- Google 로그인 상태에서 삭제해야 Supabase 원격 데이터도 삭제된다.
- 로그아웃 상태에서의 삭제는 원격 삭제가 아니다.
- 계정 전체 삭제는 앱 정보 탭의 계정/데이터 삭제 흐름을 사용한다.

관련 함수:

- `resetLocalAccountCache`
- `signOut`
- `continueFromLaunchAsGuest`

## 9. 주요 기능 현황

저장 탭:

- 한 장씩 카드 저장.
- txt/csv/xls/xlsx/docx 파일 가져오기.
- 저장 위치 폴더 선택.
- 같은 앞면/뒷면 조합은 중복 저장을 막는다.
- 파일 가져오기에서도 기존 카드 또는 파일 내부 중복을 건너뛰고 안내한다.

암기 탭:

- 폴더 및 하위 폴더 기준 출제.
- 문제 수 5/10/20/전체 preset.
- 출제 방향: 양방향, 앞면만, 뒷면만.
- 숨김 카드는 출제에서 제외.
- 오답률/오답횟수/최근 오답/미학습/오래 안 본 카드 우선으로 후보 선정.
- 최종 문제 순서는 랜덤.
- 같은 카드의 앞->뒤, 뒤->앞 문제가 가능하면 바로 붙지 않도록 순서를 펼친다.
- 정답 판정은 대소문자, 공백, 일부 문장부호, 한국어 조사, 긴 단어의 작은 오타를 어느 정도 허용한다.
- 최신 추가: `앞글자 힌트` 버튼.
  - 누르면 현재 정답의 첫 글자 또는 여러 단어의 앞글자를 보여준다.
  - 다음 문제나 새 학습 시작 시 힌트 표시 상태가 초기화된다.

기록 탭:

- 오늘 학습 횟수, 푼 문제, 오답 수, 일일 목표, 연속 학습 streak.
- 날짜별 학습 기록.
- 최근 세션의 오답만 다시 풀기.
- 숨김 카드는 오답 다시풀기에서도 제외.

보관함 탭:

- 카드 수정/삭제.
- 스와이프 액션으로 수정, 숨김/해제, 삭제.
- 카드별 정답률 숫자와 색상 바 표시.
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
  - 이동 버튼은 2026-05-30에 제거됨.
- 최신 추가: 중복 카드 자동 감지.
  - 앞면/뒷면을 정규화해 같은 조합을 그룹으로 묶는다.
  - 현재 폴더 범위에 중복이 있으면 중복 그룹 수와 카드 수를 안내한다.
  - 각 중복 카드에는 `중복` 배지가 붙는다.
- 최신 추가: 전체 카드 내보내기.
  - `전체 CSV`
  - `전체 Excel`
  - 내보내는 컬럼: 번호, 폴더, 앞면, 뒷면, 시도 수, 정답 수, 오답 수, 정답률, 숨김 여부, 생성일, 수정일.
  - Android에서는 Storage Access Framework 폴더 선택기를 사용한다.
  - 실패하거나 지원되지 않는 환경에서는 앱 문서 폴더로 fallback한다.

폴더:

- 폴더 생성/수정/삭제.
- 폴더별 카드 수 표시.
- 최신 추가: 폴더 색상/아이콘 설정.
  - 폴더 메뉴에서 `색상/아이콘`을 열어 설정한다.
  - 색상 옵션: 보라, 청록, 파랑, 분홍, 초록, 노랑 계열.
  - 아이콘 옵션: 폴더, 책, 학교, 별, 언어, 두뇌.
  - `studyStats.folderStyles`에 저장된다.
  - 폴더 삭제 시 해당 폴더 스타일도 같이 제거된다.

앱 정보 탭:

- Google 로그인/로그아웃.
- 계정/데이터 삭제.
- 화면 모드, 언어.
- 학습 알림 ON/OFF.
- 문의하기.
- 튜토리얼 다시보기.
- 앱 버전, 개인정보 처리방침, 이용약관, 오픈소스 라이선스.
- 관리자일 때만 운영 지표와 관리자 문의함 노출.

## 10. 학습 알림

- `expo-notifications` 기반 로컬 예약 알림.
- 매일 무한 반복이 아니라 마지막 앱 실행 기준으로 1, 2, 3, 5, 8, 14, 21, 30일 뒤 오후 8시에 예약한다.
- 앱을 다시 열면 알림 간격이 다시 계산된다.
- 앱 정보 탭의 스위치로 켜고 끈다.
- 스위치 아래 `켜짐/꺼짐`, 성공 안내 문구는 제거된 상태다.
- 저장 실패 같은 예외만 팝업으로 표시한다.

## 11. 관리자 기능

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

과거에 로그아웃 상태에서 문의 내용이 보인 문제가 있었다. 현재는 일반 최근 문의 목록을 제거하고 관리자 조건을 강화했다.

## 12. Play Console / 정책 / 스토어 자산

사용자에 따르면 앱은 비공개 또는 폐쇄 테스트 흐름에 들어갔고, 테스트 인원 12명을 모은 상태다.

정책 문서:

- 개인정보처리방침 초안: `docs/privacy-policy-ko.md`
- 데이터 삭제 안내 초안: `docs/data-deletion-ko.md`
- GitHub Pages용 공개 저장소: `youwon35/memoria-privacy`
- 개인정보처리방침 URL 후보:
  - `https://youwon35.github.io/memoria-privacy/`
- 계정 및 데이터 삭제 URL 후보:
  - `https://youwon35.github.io/memoria-privacy/data-deletion.html`

스토어 자산:

- 기능 그래픽: `store/memoria-feature-graphic.png`
- 현재 기능 그래픽은 캐릭터와 추상 모티프를 제거한 미니멀 버전.
- 문구:
  - `카드쌍을 저장하고 효율적으로 암기하세요`
  - `파일 가져오기 · 오답 다시풀기 · 기기 간 동기화`

Play Console 입력 관련 참고:

- 데이터 보안은 이메일, 사용자 ID, 앱 상호작용 또는 앱 활동 성격의 데이터가 관련된다.
- Google OAuth를 사용하므로 계정 생성 방식은 OAuth로 표시했다.
- 계정 삭제 URL은 개인정보처리방침과 같은 GitHub Pages 프로젝트 안의 별도 페이지로 충분하다.

## 13. 현재 dev build

현재 실기기 확인용 dev client APK:

- `D:\github\APP\memorize_app2\.expo\local-builds\memoria-dev-1.0.8-google-client-scheme-debug.apk`
- `D:\github\APP\memorize_app2\.expo\local-builds\memoria-dev-1.0.8-card-tools-live-debug.apk`
- `D:\github\APP\memorize_app2\.expo\local-builds\memoria-dev-1.0.8-tablet-screenshots-debug.apk`

위 APK들은 native 설정이 같은 1.0.8 dev client다. `card-tools-live-debug.apk`는 최신 JS 기능 테스트를 위해 알아보기 쉬운 이름으로 준비한 사본이다.

중요:

- 2026-06-29 카드 관리 도구는 JS/UI/로직 변경이다.
- 새 native dev APK를 만들 필요는 없었다.
- 위 dev client를 설치한 뒤 `npm run start:lan`으로 Metro를 켜면 최신 JS를 받아 테스트할 수 있다.
- native 설정, scheme, config plugin, 새 native Expo 모듈이 바뀌면 dev build를 다시 만들어야 한다.

## 14. production AAB 상태

이 절의 빌드 정보는 로컬에 남은 과거 기록이다. 사용자는 이후 Google Play 출시가 완료됐다고 확인했지만, 현재 Play Console의 실제 출시 `versionCode`와 artifact는 이 작업에서 직접 조회하지 않았다. 새 AAB를 만들 때는 반드시 Play Console의 현재 최고 `versionCode`보다 큰 값인지 확인한다.

최신 성공 production AAB:

- App versionName: `1.0.8`
- Android versionCode: `15`
- EAS build ID: `d0d0f9e8-4e40-461d-9e37-4b13300c5e9e`
- AAB: `https://expo.dev/artifacts/eas/rMyw4dxEPr9trCY7bX6EtQ.aab`
- Local copy: `D:\github\APP\memorize_app2\.expo\local-builds\memoria-production-1.0.8-v15.aab`
- Logs: `https://expo.dev/accounts/zinnn/projects/memoria/builds/d0d0f9e8-4e40-461d-9e37-4b13300c5e9e`
- Build commit: `06c53d01a5d347f801d9876271ae273c6485b38c`
- 파일 크기: `61,367,256 bytes`

매우 중요:

- 이 AAB는 최신 코드 커밋 `4ed8b75`보다 이전 커밋에서 빌드됐다.
- 따라서 이 AAB에는 2026-06-29의 중복 카드 자동 감지, 전체 CSV/Excel 내보내기, 폴더 색상/아이콘, 앞글자 힌트 기능이 포함되지 않는다.
- 이 네 기능을 Play 테스트 AAB에 포함하려면 새 production AAB를 만들어야 한다.
- Google Play가 중복으로 막는 핵심 값은 `versionName`이 아니라 Android 정수 `versionCode`다.
- 다음 production AAB는 remote autoIncrement 기준으로 `versionCode 16` 이상이 될 가능성이 높다.
- 새 AAB를 만들면 `npx eas-cli build:view <BUILD_ID> --json`으로 versionCode와 artifact URL을 반드시 확인한다.

이전 성공 production AAB:

- App versionName: `1.0.8`
- Android versionCode: `14`
- EAS build ID: `dc733ae7-3190-4d48-9a97-5a756765a13d`
- AAB: `https://expo.dev/artifacts/eas/tdTdkYwBSeXH6LbauYTMzX.aab`
- Local copy: `D:\github\APP\memorize_app2\.expo\local-builds\memoria-production-1.0.8-v14.aab`

취소된 production build:

- Build ID: `39e4cbdb-8e29-4e19-86cc-b2bfc984a14a`
- 상태: `CANCELED`
- App versionName: `1.0.8`
- Android versionCode: `13`
- AAB artifact 없음.

## 15. 코드 작업 시 조심할 점

- `App.js`가 매우 크다. 변경 전 `rg`로 관련 함수 위치를 찾고 좁게 수정한다.
- 사용자 변경 파일을 되돌리지 않는다.
- `want.png`는 건드리지 않는다.
- JS/UI 변경은 기존 dev build + Metro reload로 확인 가능하다.
- native 설정 변경은 새 dev build 또는 AAB가 필요하다.
- Supabase schema 변경 시 마이그레이션과 RLS 정책을 함께 확인한다.
- `studyStats` JSON 구조를 바꿀 때는 `ensureStudyStats`, `createPersistableStudyStats`, `mergeStudyStats`까지 함께 확인한다.
- 카드/폴더 삭제는 로컬 상태, refs, AsyncStorage, Supabase 상태가 엮여 있으니 삭제 후 재동기화로 되살아나는지 확인해야 한다.
- 보관함 기능을 건드릴 때는 선택 모드, 스와이프 액션, 숨김, 중복 배지, export 버튼이 서로 UI를 침범하지 않는지 확인한다.
- 파일 가져오기 로직을 건드릴 때는 txt/csv/xlsx/docx와 중복 skip 메시지를 함께 확인한다.
- 인증을 건드릴 때는 Android redirect URI, Supabase Provider Client IDs, `.env` 값, dev build manifest scheme을 같이 봐야 한다.

## 16. 작업 후 기록 규칙

사용자 AGENTS 지시:

- 코드나 중요한 문서 변경 후 `F:\동기화용 파일\인쇄용\memorize_app2_print.py`에 작업 흐름을 이어 붙인다.
- Notion의 `암기 앱` 페이지에도 `요약` 토글 안에 같은 내용을 문서형으로 이어 붙인다.
- Notion page id:
  - `3428d558-4385-8050-8250-cf79bc1d0165`
- 코드 변경이 생기면 `develop` 브랜치에 commit/push까지 완료한다.

## 17. 다음 채팅에서 우선 확인할 것

1. 새 채팅 시작 시 `git status --short --branch`로 현재 변경사항을 확인한다.
2. `want.png`가 남아 있으면 계속 건드리지 않는다.
3. `1.0.9` 앱을 배포하기 전에 `supabase/migrations/20260727_harden_account_and_data.sql`을 production Supabase에 적용한다.
4. 마이그레이션 적용 후 실제 계정으로 다음 흐름을 확인한다.
   - 앱 계정 삭제 후 `auth.users`, 카드, 폴더, 학습 기록, 문의가 함께 삭제되는지
   - 한 기기에서 삭제한 카드/폴더가 다른 기기 동기화 뒤 되살아나지 않는지
   - 문의를 한 시간에 5건 넘게 보낼 수 없는지
5. 실기기 dev client 또는 Expo Go에서 Google 로그인, 카드 저장, 가져오기, 학습, 보관함, 접근성 흐름을 확인한다.
   - Expo Go는 JS/UI 확인용이다.
   - `android.allowBackup: false` 같은 native 설정은 새 Android 빌드에서 확인해야 한다.
6. 새 production AAB를 만들 때 Play Console의 현재 최고값보다 큰 `versionCode`를 사용한다. 과거 로컬 기록의 `16 이상`을 그대로 가정하지 않는다.
7. artifact URL, 실제 `versionCode`, 로컬 복사본 경로, 실기기 점검 결과를 handoff/print/Notion에 남긴다.
8. 사용자가 npm에 의존성 목록/버전 전송을 허용하면 `npm audit --omit=dev` 상세 결과를 확인하고 남은 취약점을 분류한다.

## 18. 2026-07-27 출시 후 전체 감사 및 1.0.9 안정성 업데이트

### 감사 결론

- 앱은 출시 가능한 기능과 시각 완성도를 이미 갖췄다. 390×844 화면에서 시작 화면, 튜토리얼, 메인 탭, 카드 모달, 설정/정보 화면을 점검했으며 큰 레이아웃 붕괴나 치명적인 실행 오류는 보이지 않았다.
- 전면 재디자인보다 출시 후 데이터 무결성, 실제 계정 삭제, 악성 가져오기 파일 방어, 접근성 보완을 우선했다.
- 앱 버전은 `1.0.9`로 올렸지만 production Supabase와 Google Play에는 아직 반영하지 않았다.

### 수정한 핵심 문제

- 동기화:
  - 서버에서 삭제된 클라우드 카드/폴더를 오래된 로컬 캐시가 다시 업로드해 되살리는 흐름을 차단했다.
  - 로컬에서 새로 만들거나 수정한 데이터만 업로드하고, 원격에 사라진 cloud-origin 항목은 로컬 캐시에서도 제거한다.
- 인증/계정:
  - 예기치 않은 `SIGNED_OUT` 이벤트에서도 현재 계정의 로컬 카드, 폴더, 학습 기록, 문의/관리자 캐시를 지운다.
  - 기존의 로컬 데이터만 지우던 계정 삭제를 `delete_current_user_account()` RPC 기반의 실제 Memoria 인증 계정 삭제로 교체했다.
  - Google 계정 자체는 삭제되지 않는다는 문구를 앱과 정책 문서에서 분명히 했다.
- Supabase:
  - 새 production 마이그레이션 `supabase/migrations/20260727_harden_account_and_data.sql`을 추가했다.
  - 카드 300자, 폴더 100자, 문의 길이/상태/분류 제약을 DB에도 추가했다.
  - 사용자 프로필 이메일/역할 정책을 JWT 기준으로 제한했다.
  - 문의는 로그인한 본인 이메일만 쓰고 한 시간 5건까지만 제출하도록 RLS와 함수로 제한했다.
  - `security definer` 함수들의 `search_path`를 고정하고 실행 권한을 최소화했다.
- 파일 가져오기:
  - 공개 취약점이 알려진 오래된 npm `xlsx@0.18.5`를 SheetJS 공식 배포 `0.20.3`으로 교체했다.
  - 파일 5 MB, 회당 카드 1,000개, 카드 한 면 300자 제한을 추가했다.
  - XLSX 행 수와 DOCX 압축 해제 XML 크기를 제한해 과도한 메모리 사용을 줄였다.
- 개인정보/백업:
  - Android `allowBackup`을 `false`로 설정해 앱 데이터의 일반 Android 백업을 끄고 정책 문서에 반영했다.
  - `.env.example`에 플랫폼별 Google OAuth client ID 예시를 추가했다.
- 접근성/UX:
  - 하단 탭, 학습 모드, 테마, 언어, 문의 분류에 버튼 역할과 선택 상태를 추가했다.
  - 폴더 접힘 상태, 진행률, 결과/오류 안내를 스크린 리더가 읽을 수 있게 했다.
  - 시작 화면, 튜토리얼, 모달 뒤의 화면이 동시에 접근성 탐색에 노출되지 않게 했다.
  - 폴더/카드/문의 입력에 UI 최대 길이를 적용했다.
- 기타 데이터 정확성:
  - 중복 카드 안내가 현재 폴더 범위 밖 카드까지 세던 문제를 수정했다.
  - 학습 알림 날짜 계산을 고정 24시간 덧셈 대신 달력 날짜 이동으로 바꿔 DST 지역에서도 오후 8시가 유지되게 했다.

### 의존성 및 문서

- Expo를 `~54.0.36`, `expo-file-system`을 `~19.0.23`으로 업데이트했다.
- 기존 `web` 스크립트가 실제로 동작하도록 Expo web 의존성을 추가했다. 앱의 본체는 계속 React Native 모바일 앱이다.
- 개인정보처리방침, 데이터 삭제 안내, README, Play 스토어 1.0.9 릴리스 노트, 앱 내 한국어/영어/일본어 정책 문구를 함께 맞췄다.

### 완료한 검증

- TypeScript 정적 검사 통과
- 한국어/영어/일본어 번역 키 각 580개 일치, 누락 0
- CSV/XLSX/DOCX 가져오기 회귀 검사 통과
- `npx expo install --check` 통과
- `npx expo-doctor` 18/18 통과
- Android production export 성공: 905 modules, HBC bundle 약 4.81 MB
- Expo public config에서 `1.0.9`, `android.allowBackup: false` 확인
- 스타일 참조 누락 0, Git diff whitespace 검사 통과
- 추적 파일과 전체 Git 이력에서 일반적인 비밀키 패턴을 검사했으며 발견 없음

### 아직 production에서 해야 할 일

- production Supabase에 신규 마이그레이션을 적용하지 않았다. 앱 1.0.9를 먼저 배포하면 계정 삭제 RPC가 의도적으로 실패하며 backend update 안내를 표시한다.
- 연결된 Android 기기가 없어 실제 Expo Go/개발 빌드 조작 검증은 하지 못했다.
- native `allowBackup` 변경과 실제 Google 로그인은 새 Android build에서 확인해야 한다.
- npm 상세 감사는 의존성 이름/버전을 npm 서비스로 전송하는 승인이 없어 완료하지 않았다. 설치 요약에는 여전히 전이 의존성 경고가 남아 있으므로 승인 후 상세 분류가 필요하다.
- production AAB는 아직 만들거나 업로드하지 않았다.
- 시각 점검에 사용한 Expo 웹 서버가 종료되지 않아 장시간 명령으로 보였던 문제가 있었고, 해당 프로젝트 프로세스 트리와 생성된 임시 export/output을 모두 정리했다.
