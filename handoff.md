# MEMORIA / 메모리아 Handoff

Last updated: 2026-05-18 KST

이 문서는 다음 채팅이나 다른 작업자가 `D:\github\APP\memorize_app2` 프로젝트를 바로 이어받기 위한 현재 상태 요약이다. 기존 `handoff.md`는 이 내용으로 새로 덮어썼다.

## 1. 프로젝트 개요

- 앱 이름: 한국어 `메모리아`, 영어 `Memoria`, 일본어 `メモリア`
- 앱 성격: 사용자가 암기용 카드쌍을 만들고, 폴더로 정리한 뒤, 문제 형태로 풀고 기록을 확인하는 개인 학습/암기 앱
- 주요 흐름:
  1. 저장 탭에서 폴더와 카드쌍을 만든다.
  2. 암기 탭에서 폴더 범위, 문제 수, 출제 방향을 고르고 푼다.
  3. 기록 탭에서 학습 기록과 오답을 다시 본다.
  4. 보관함 탭에서 카드와 폴더를 수정/삭제한다.
  5. 앱 정보 탭에서 계정, 동기화, 화면 모드, 언어, 정책, 문의, 데이터 삭제를 관리한다.

## 2. 현재 Git 상태와 최근 빌드

- 작업 폴더: `D:\github\APP\memorize_app2`
- 기본 작업 브랜치: `develop`
- 마지막으로 확인한 앱 코드 기준 커밋: `db3fc05` (`fix: use provided branding artwork`)
- 이 문서 작성 전 작업트리 상태: `develop...origin/develop`, 변경 없음
- 최근 Android development build:
  - EAS build id: `64ddcb4e-c22d-4b79-ad9e-6d74874cbb93`
  - EAS commit: `db3fc05fad7a0edd7d51e3278b5aa468554126b9`
  - APK: https://expo.dev/artifacts/eas/dsq1aiQWWnA6pZ4mipi3G4.apk
  - Build logs: https://expo.dev/accounts/zinnn/projects/memoria/builds/64ddcb4e-c22d-4b79-ad9e-6d74874cbb93

주의: 이 `handoff.md` 자체를 커밋하면 최신 Git 커밋은 위 앱 빌드 커밋보다 새로워질 수 있다. 위 APK는 `db3fc05` 앱 코드 기준이다.

## 3. 기술 스택

- Expo SDK: `~54.0.34`
- React Native: `0.81.5`
- React: `19.1.0`
- Expo dev client 사용: 일반 Expo Go가 아니라 development build로 테스트하는 구조
- 주요 패키지:
  - `@react-native-async-storage/async-storage`
  - `@supabase/supabase-js`
  - `expo-auth-session`
  - `expo-crypto`
  - `expo-dev-client`
  - `expo-document-picker`
  - `expo-file-system`
  - `expo-secure-store`
  - `expo-web-browser`
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

- `npm start`는 `scripts/start-dev-build.ps1`를 실행한다.
- 이 앱은 `expo-dev-client`를 사용하므로 실제 기기 테스트는 최신 dev build 설치 후 Metro에 연결하는 방식이 기본이다.
- EAS development build:

```powershell
npx eas-cli build --platform android --profile development --non-interactive --no-wait
```

- EAS build 상태 확인:

```powershell
npx eas-cli build:list --platform android --limit 1 --non-interactive
```

## 5. 설정 파일

### `package.json`

- `name`: `memorize_app2`
- `version`: `1.0.0`
- `main`: `node_modules/expo/AppEntry.js`
- 주요 scripts:
  - `start`
  - `start:lan`
  - `start:tunnel`
  - `start:go`
  - `android`
  - `ios`
  - `web`
  - `build:dev`
  - `build:preview`
  - `build:production`
  - `submit:production`

### `app.json`

- Expo app name: `MEMORIA`
- slug: `memoria`
- scheme: `memoria`
- owner: `zinnn`
- EAS project id: `6caf9ed8-f402-4743-8222-5e05fcedb0f2`
- Android package: `com.youwon35.memoria`
- iOS bundle id: `com.youwon35.memoria`
- app icon: `./app-icon.png`
- Android adaptive icon:
  - foreground: `./assets/adaptive-icon.png`
  - background: `#DED7FF`
- splash:
  - image: `./assets/memoria-splash.png`
  - resizeMode: `cover`
  - backgroundColor: `#F5F7FB`

### `eas.json`

- CLI version: `>= 16.0.0`
- `development`: dev client enabled, internal distribution
- `preview`: internal distribution, Android APK
- `production`: auto increment enabled

## 6. 파일 구조와 역할

핵심 파일:

- `App.js`: 앱 대부분의 화면, 상태, 데이터 흐름, 튜토리얼, Supabase 동기화 로직이 들어 있는 메인 파일
- `src/i18n.js`: 한국어/영어/일본어 번역 전체
- `src/lib/supabase.js`: Supabase client 생성, SecureStore/AsyncStorage 기반 auth storage, PKCE 설정
- `src/utils/import-files.js`: TXT/CSV/XLS/XLSX/DOCX 파일에서 카드쌍 import
- `src/utils/memory.js`: 학습/복습 관련 보조 로직
- `scripts/start-dev-build.ps1`: dev build용 Expo 시작 스크립트
- `app-icon.png`: 앱 아이콘
- `assets/adaptive-icon.png`: Android adaptive icon foreground
- `assets/memoria-splash.png`: 앱 시작 splash image
- `assets/memoria-character.png`: 튜토리얼 시작 화면 캐릭터 이미지
- `assets/want1.png`: 사용자가 직접 넣은 아이콘 원본
- `assets/want2.png`: 사용자가 직접 넣은 시작화면 원본

## 7. 브랜딩 / 이미지 자산 관련 매우 중요한 주의사항

사용자는 AI가 새로 그린 듯한 변형을 싫어했다. 특히 캐릭터의 머리 곡률, 손, 카드 위치, 입과 카드의 겹침, 아이콘에서 머리가 잘리는 문제를 여러 번 지적했다.

따라서 다음 작업에서 브랜딩 이미지를 건드릴 때는 다음 원칙을 지켜야 한다.

- `assets/want1.png`와 `assets/want2.png`를 원본 기준으로 삼는다.
- 캐릭터를 새로 그리거나 SVG로 재해석하지 말 것.
- 시작 화면은 사용자가 준 `want2.png`와 같은 느낌이어야 하며, 현재는 태그라인 텍스트만 제거된 `assets/memoria-splash.png`를 사용한다.
- 튜토리얼 시작 화면 캐릭터는 `assets/memoria-character.png`를 사용한다.
- 앱 아이콘은 `app-icon.png`와 `assets/adaptive-icon.png`를 사용한다.
- Android adaptive icon은 런처에서 머리통이 잘리지 않도록 safe area를 고려해야 한다.
- 튜토리얼 시작 화면의 브랜드 텍스트는 현재 `MEMORIA`이며, 글자 간격을 둔 디자인이다.

현재 `App.js` 상단 자산 연결:

```js
const LAUNCH_IMAGE = require("./assets/memoria-splash.png");
const CHARACTER_IMAGE = require("./assets/memoria-character.png");
```

## 8. 앱 내부 주요 상수와 저장 키

`App.js`의 주요 상수:

```js
const APP_VERSION = "1.0.0";
const STORAGE_KEY = "@memoria/cards";
const FOLDERS_STORAGE_KEY = "@memoria/folders";
const DAILY_STUDY_GOAL_KEY = "@memoria/daily-study-goal";
const THEME_MODE_KEY = "@memoria/theme-mode";
const LANGUAGE_KEY = "@memoria/language";
const STUDY_STATS_KEY = "@memoria/study-stats";
const TUTORIAL_SEEN_KEY = "@memoria/tutorial-seen-v5";
const SUPPORT_REQUESTS_KEY = "@memoria/support-requests";
const LEGACY_STORAGE_KEYS = ["@memora/study-pairs"];
const APP_SCHEME = process.env.EXPO_PUBLIC_APP_SCHEME || "memoria";
const RELEASE_REDIRECT_URI = `${APP_SCHEME}://auth/callback`;
```

기타 기본값:

- root folder id: `root`
- 기본 일일 목표: 5
- 기본 문제 수: 10
- session history 최대치: 60

## 9. 메인 탭 구조

탭은 5개다.

1. 저장 탭
   - 카드쌍 직접 입력
   - 텍스트/파일 기반 일괄 입력
   - 폴더 생성 및 카드 저장
   - OCR/카메라 기반 저장 기능은 과거에 비활성화되었고 현재 코드에서도 제거된 상태

2. 암기 탭
   - 폴더 범위 선택
   - 문제 수 선택: 5 / 10 / 20 / 전체
   - 출제 방향 선택: 양방향 / 앞면만 / 뒷면만
   - 문제 풀이 시작
   - 오답만 다시 풀기 지원
   - 폴더 영역은 탭 진입 시 접힌 상태가 기본이 되도록 이전에 조정됨

3. 기록 탭
   - 오늘 학습 요약
   - 최근 암기 기록
   - 날짜별 기록 확인
   - 오답 다시 풀기

4. 보관함 탭
   - 저장된 카드 목록
   - 카드 수정/삭제
   - 폴더 수정/삭제
   - 정렬 메뉴
   - 폴더 영역은 탭 진입 시 접힌 상태가 기본이 되도록 이전에 조정됨

5. 앱 정보 탭
   - Google 로그인/로그아웃
   - 관리자 표시
   - 계정 / 데이터 삭제
   - 화면 모드: 라이트/다크
   - 언어: 한국어/English/日本語
   - 문의하기
   - 튜토리얼 다시보기
   - 앱 버전
   - 개인정보 처리방침/이용약관

## 10. 튜토리얼 상태

튜토리얼은 예전의 긴 단계들이 제거되고, 현재는 5개 탭 설명 중심으로 단순화되어 있다.

순서:

1. 저장 탭
2. 암기 탭
3. 기록 탭
4. 보관함 탭
5. 앱 정보 탭

중요 동작:

- 튜토리얼 시작 화면은 유지한다.
- 튜토리얼 시작 화면의 캐릭터 이미지는 `assets/memoria-character.png`다.
- 튜토리얼 시작 화면의 브랜드 표기는 `MEMORIA`다.
- 튜토리얼 step overlay에서 강조된 영역 자체는 누르는 대상이 아니다.
- 사용자는 강조 영역을 누르는 것이 아니라 `다음으로` 또는 마지막 단계의 `튜토리얼 종료` 버튼으로만 진행하길 원했다.
- 마지막 앱 정보 탭 단계는 `다음으로`가 아니라 `튜토리얼 종료` 텍스트를 사용한다.

## 11. 파일 import / OCR 상태

지원 import:

- `.txt`
- `.csv`
- `.xls`
- `.xlsx`
- `.docx`

구현 위치:

- `src/utils/import-files.js`

구현 방식:

- XLS/XLSX: `xlsx`
- DOCX: `jszip`으로 `word/document.xml` 파싱
- TXT/CSV: 줄과 구분자를 기반으로 앞/뒤 카드쌍 추출

OCR/카메라 관련:

- 사용자가 과거에 비활성화했던 OCR 촬영 저장 기능은 제거된 상태다.
- 최근 확인 기준 `camera`, `ocr`, `ImagePicker`, `Camera`, `scan` 관련 실사용 코드가 남아 있지 않다.

## 12. Supabase / 계정 / 동기화

Supabase client:

- 파일: `src/lib/supabase.js`
- 환경변수:
  - `EXPO_PUBLIC_SUPABASE_URL`
  - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- Google OAuth + PKCE 흐름
- native에서는 `expo-secure-store`, web에서는 `AsyncStorage`를 auth storage로 사용

`App.js`에서 사용되는 주요 테이블/기능:

- `memory_pairs`
- `memory_folders`
- `memory_user_state` (학습 기록, 오답 통계, 일일 목표)
- `support_inquiries`
- `app_usage_events`
- RPC: `get_admin_dashboard_metrics`

계정 / 데이터 삭제:

- 앱 정보 탭의 제목은 `계정 / 데이터 삭제`
- 설명은 Google 계정 자체는 삭제되지 않으며, 메모리아에 저장된 카드/폴더/학습 기록/오답 기록/일일 목표/문의 기록/동기화 데이터만 삭제된다는 의미
- 버튼 텍스트는 `계정 삭제하기`
- 버튼을 누르면 삭제될 데이터 목록을 보여주는 커스텀 확인 팝업이 뜬다.
- 계속을 누르면 “삭제 요청”이 아니라 실제 삭제가 실행된다.
- 관련 함수: `deleteMemoriaAccountData`

주의:

- 기존 Supabase 프로젝트는 `supabase/migrations/20260519_add_memory_user_state.sql`를 한 번 실행해야 학습 기록/오답 통계/일일 목표 클라우드 동기화가 활성화된다.
- 삭제 함수는 `memory_pairs`, `memory_folders`, `memory_user_state`, `app_usage_events`, `support_inquiries`를 삭제하도록 맞춰져 있다.

## 13. 다국어 / 번역 상태

번역 파일: `src/i18n.js`

현재 언어:

- 한국어
- 영어
- 일본어

앱 이름:

- ko: `메모리아`
- en: `Memoria`
- ja: `メモリア`

릴리스 전 점검 권장:

- 개인정보 처리방침/이용약관 문구
- 계정 / 데이터 삭제 문구
- 튜토리얼 5단계 문구
- 파일 import 관련 오류 문구
- 영어/일본어에서 너무 기계적인 표현이 없는지 최종 검토

## 14. 최근 완료된 주요 변경사항

이 채팅에서 이어진 큰 흐름:

- 튜토리얼 overlay 강조 위치 오류 수정
- 강조된 영역은 클릭하지 못하고 `다음으로`만 누르게 조정
- 튜토리얼 단계를 5개 탭 중심으로 단순화
- 예전 긴 튜토리얼 단계 제거
- 튜토리얼 팝업 디자인을 앱 내부 커스텀 모달 스타일과 맞춤
- 앱 정보 탭 마지막 튜토리얼 버튼을 `튜토리얼 종료`로 변경
- 암기 탭의 상단 학습 범위 카드 정리
- 암기/보관함 쪽 폴더 영역 기본 접힘 처리
- 폴더 추가 카드에서 `+` 버튼을 작게 하고 `폴더 추가` 텍스트 추가
- OCR/카메라 저장 기능 제거
- 계정 / 데이터 삭제 문구와 삭제 흐름 개선
- 앱 시작 splash, 튜토리얼 시작 캐릭터, 앱 아이콘을 사용자 제공 자산 기준으로 정리
- 최신 dev build 생성 및 APK 확인

## 15. 검증에 사용한 명령들

최근 변경 검증 때 사용한 명령들:

```powershell
node -e "const fs=require('fs'); JSON.parse(fs.readFileSync('app.json','utf8')); JSON.parse(fs.readFileSync('package.json','utf8')); console.log('json ok')"
node -e "const fs=require('fs'); const parser=require('@babel/parser'); for (const file of ['App.js','src/i18n.js']) { parser.parse(fs.readFileSync(file,'utf8'), {sourceType:'module', plugins:['jsx','classProperties','optionalChaining','nullishCoalescingOperator']}); } console.log('babel parse ok')"
git diff --check
npx expo export --platform android --output-dir .expo-export --clear
npx expo-doctor
```

`expo export` 후 생성되는 `.expo-export`는 검증 후 제거했다.

## 16. 출시 준비 관점

Google Play 출시 전 확인할 것:

- `main` 브랜치로 release 후보를 올릴지 결정
- `develop`에서 충분히 검증 후 `main`에 merge하는 방식이 일반적
- production build 생성:

```powershell
npm run build:production
```

- Play Console 등록 정보 준비:
  - 앱 이름
  - 짧은 설명
  - 전체 설명
  - 스크린샷
  - 앱 아이콘
  - 개인정보 처리방침 URL
  - 데이터 보안 설문
  - 타겟 연령/콘텐츠 등급
  - 테스트 트랙 또는 프로덕션 트랙

릴리스 전 앱 차원에서 특히 볼 것:

- Supabase에 최신 `memory_user_state` 마이그레이션이 적용되어 학습 상태 동기화와 데이터 삭제가 실제 원격 DB에서 동작하는지
- Google OAuth redirect scheme이 release build에서 동작하는지
- 신규 설치 첫 실행 splash와 튜토리얼 흐름
- Android launcher icon이 기기마다 잘리지 않는지
- 라이트/다크, 한국어/영어/일본어 UI 깨짐 여부

## 17. 다음 작업자가 꼭 기억할 것

- 사용자는 한국어로 작업한다.
- 사용자는 디자인 디테일에 민감하다. 특히 캐릭터/아이콘은 원본과 달라지면 바로 어색함을 느낀다.
- 앱은 웹앱이 아니라 실제 Expo/React Native 모바일 앱이다.
- 사용자는 Expo Go SDK 54를 언급했지만 현재 프로젝트는 `expo-dev-client` 기반이므로 dev build 테스트가 핵심이다.
- 코드 변경이 생기면 AGENTS.md 지시에 따라 `develop`에 commit/push까지 해야 한다.
- 중요한 작업 후에는 `F:\동기화용 파일\인쇄용\memorize_app2_print.py`에도 작업 요약을 이어 붙이고, Notion의 해당 프로젝트 페이지 `요약` 토글에도 같은 흐름을 문서형으로 남기는 규칙이 있다.
- 수동 파일 수정은 `apply_patch`를 사용한다.
- 기존 사용자 변경사항은 임의로 되돌리지 않는다.

## 18. 현재 가장 조심해야 할 미해결/재점검 포인트

- 기존 Supabase 프로젝트에는 `supabase/migrations/20260519_add_memory_user_state.sql` 또는 최신 `supabase/schema.sql` 적용 필요
- Android adaptive icon이 모든 런처 마스크에서 충분히 안전한지 실기기 추가 확인 권장
- `src/i18n.js`가 매우 크므로 번역 수정 시 키 이름/중괄호 placeholder를 망가뜨리지 않게 조심
- `App.js`가 큰 단일 파일이라 UI 수정 시 주변 state와 tutorial target ref 연결을 같이 확인해야 함
- production release 전에는 `npx expo-doctor`, Android production build, 실제 기기 smoke test를 다시 수행하는 것이 좋음
