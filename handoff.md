# MEMORIA handoff

작성 시점: 2026-05-12
작업 폴더: `D:\github\APP\memorize_app2`
원격 저장소: `https://github.com/youwon35/memorize_app2.git`
기본 브랜치: `develop`
앱 코드 기준 최신 커밋: `b896fb8 fix: update quiz start tutorial copy`
이 문서 작성 직전 상태: `git pull --ff-only origin develop` 결과 `Already up to date.`

## 1. 앱 한 줄 요약

MEMORIA는 앞면과 뒷면을 한 쌍으로 저장한 뒤, 사용자가 암기 퀴즈를 풀고, 틀린 카드와 최근 학습 기록을 다시 확인하도록 만든 React Native / Expo 암기 앱이다.

핵심 사용 흐름은 다음과 같다.

1. 저장 탭에서 카드쌍을 만든다.
2. 암기 탭에서 저장된 카드가 문제로 나온다.
3. 기록 탭에서 오늘의 학습, 틀린 카드, 최근 암기 세션을 확인한다.
4. 보관함 탭에서 카드를 검색, 정렬, 수정, 삭제한다.
5. 앱 정보 탭에서 로그인, 화면 모드, 언어, 튜토리얼 다시 보기, 문의, 관리자 기능을 다룬다.

## 2. 기술 스택

- Expo SDK: `~54.0.34`
- React Native: `0.81.5`
- 앱 이름: `MEMORIA`
- Android package / iOS bundle id: `com.memoria.app`
- Expo owner: `zinnn`
- EAS project id: `6caf9ed8-f402-4743-8222-5e05fcedb0f2`
- 주요 라이브러리:
  - `@react-native-async-storage/async-storage`
  - `@supabase/supabase-js`
  - `expo-auth-session`
  - `expo-dev-client`
  - `expo-document-picker`
  - `expo-file-system`
  - `expo-secure-store`
  - `jszip`
  - `xlsx`
  - `lucide-react-native`

현재 앱은 웹 앱이 아니라 실제 모바일 앱을 목표로 한 Expo / React Native 프로젝트다. dev-client를 사용하므로 네이티브 모듈 변경이 있으면 Expo Go가 아니라 개발 빌드로 확인하는 쪽이 안전하다.

## 3. 주요 파일 지도

- `App.js`
  - 앱의 대부분 UI와 상태가 들어있는 메인 파일이다.
  - 탭 UI, 저장/암기/기록/보관함/앱 정보 화면, 튜토리얼 오버레이, 로그인, 문의, 관리자 뷰가 모두 이 파일에 있다.
  - 파일이 매우 커져서 다음 대형 작업 때는 화면별 컴포넌트 분리가 좋은 후보이다.
- `src/i18n.js`
  - 한국어, 영어, 일본어 문구.
  - 튜토리얼 문구, 문의 탭 문구, 버튼 라벨도 여기와 `App.js` 안의 튜토리얼 상수에 함께 걸쳐 있다.
- `src/utils/memory.js`
  - 카드쌍 정규화, 중복 병합, 정렬, 가져오기 텍스트 파싱, 암기 덱 구성, 학습 기록 계산.
- `src/utils/import-files.js`
  - `txt`, `csv`, `xls`, `xlsx`, `docx` 파일 읽기.
- `src/lib/supabase.js`
  - Supabase 클라이언트와 세션 저장소.
  - 네이티브에서는 SecureStore, 웹에서는 AsyncStorage를 사용한다.
- `src/config/features.js`
  - 기능 플래그.
  - 현재 `photoImport: false`라 사진/OCR 가져오기는 UI에서 숨김 상태다.
- `src/lib/photo-ocr.js`
  - 사진 OCR 클라이언트 코드. 기능 플래그가 꺼져 있어 현재 일반 사용자 흐름에는 노출되지 않는다.
- `supabase/schema.sql`
  - Supabase 테이블, RLS 정책, 관리자 함수.
- `supabase/functions/ocr-photo-cards/index.ts`
  - Google Cloud Vision OCR Edge Function.
- `scripts/start-dev-build.ps1`
  - dev-client용 Metro 실행 스크립트.
- `app.json`
  - Expo 앱 설정, scheme, icon, splash, 플러그인.
- `eas.json`
  - development / preview / production EAS 빌드 설정.
- `README.md`
  - 설치, 실행, Supabase, 관리자, OCR, 배포 안내.

## 4. 저장 데이터와 동기화 구조

로컬 저장은 AsyncStorage를 중심으로 동작한다.

- `@memoria/cards`
  - 카드쌍 목록.
- `@memora/study-pairs`
  - 과거 버전 키. 앱 시작 시 `@memoria/cards`로 마이그레이션한다.
- `@memoria/study-stats`
  - 카드별 학습 통계, 오답/정답 기록, 최근 세션 계산에 사용.
- `@memoria/theme-mode`
  - 라이트/다크 모드.
- `@memoria/language`
  - 언어 설정.
- `@memoria/tutorial-seen`
  - 튜토리얼 완료 여부.
- `@memoria/support-requests`
  - 문의 내역 로컬 캐시.

Supabase 환경변수는 `.env` 또는 빌드 환경에 설정한다.

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

Supabase가 연결되어 있으면 카드와 문의는 클라우드에도 저장된다. 로그인하지 않았거나 Supabase 요청이 실패하면 일부 기능은 로컬 저장으로 이어진다.

## 5. Supabase 스키마

`supabase/schema.sql`의 주요 테이블은 다음과 같다.

- `public.user_profiles`
  - 사용자 이메일과 역할.
  - `role`은 `user` 또는 `admin`.
- `public.app_usage_events`
  - 앱 실행 이벤트.
- `public.memory_pairs`
  - 사용자 카드쌍.
  - `prompt_a`, `prompt_b`가 앞면/뒷면 역할을 한다.
- `public.support_inquiries`
  - 앱 정보 탭의 문의하기 데이터.
  - `category`, `sender_email`, `reply_email`, `message`, `status` 포함.

관리자 관련 함수와 정책:

- `public.is_admin(user_id uuid)`
- `public.get_admin_dashboard_metrics()`
- RLS는 기본적으로 자기 데이터만 보고 수정할 수 있게 되어 있고, admin은 전체 문의와 지표를 볼 수 있다.

새 DB를 만들거나 정책이 꼬였을 때는 Supabase SQL editor에서 `supabase/schema.sql` 전체를 다시 적용하는 방식이 가장 빠르다.

## 6. 인증 구조

- Google 로그인은 `expo-auth-session`을 사용한다.
- 앱 scheme은 `memoria`.
- 리다이렉트 URI 계열은 `memoria://auth/callback` 흐름을 기준으로 맞춰져 있다.
- Supabase 클라이언트는 `flowType: "pkce"`와 `detectSessionInUrl: false`를 사용한다.
- 세션 저장:
  - 네이티브: `expo-secure-store`
  - 웹: `AsyncStorage`

## 7. 카드 저장 흐름

저장 탭에는 현재 두 가지 노출 흐름이 있다.

### 한쌍씩

- 사용자가 앞면과 뒷면을 직접 입력한다.
- 저장 버튼을 누르면 카드쌍이 로컬 및 가능하면 Supabase에 저장된다.
- 텍스트는 `normalizeText`로 공백을 정리하고 비교/중복 판단에 사용한다.
- 같은 앞면/뒷면 조합은 `createSignature` 기반으로 병합된다.

### 파일로

지원 확장자:

- `txt`
- `csv`
- `xls`
- `xlsx`
- `docx`

현재 파싱 규칙:

- `csv`, `xls`, `xlsx`
  - 1열을 앞면, 2열을 뒷면으로 읽는다.
- `txt`, `docx`
  - 텍스트를 읽은 뒤 `parseImportedPairs`로 카드쌍을 만든다.
  - 현재 기본 규칙은 빈 줄로 나뉜 블록마다 정확히 두 줄을 앞면/뒷면으로 읽는 형태다.
  - 예:

```text
apple
사과

goodbye
잘가
```

### 사진으로

- OCR 관련 코드는 남아 있지만 `src/config/features.js`의 `photoImport: false` 때문에 현재 UI에서 숨겨져 있다.
- 다시 켤 때는 Google Vision API 키와 Supabase Edge Function 배포 상태를 함께 확인해야 한다.

## 8. 암기 로직

암기 탭은 저장된 카드에서 퀴즈 덱을 만든다.

- `buildPracticeDeck(pairs, limit, mode, studyStats)`
  - `mode`는 `both`, `front`, `back` 계열 흐름을 지원한다.
  - 학습 통계가 있으면 자주 틀렸거나 복습이 필요한 카드가 더 잘 나오도록 가중 샘플링한다.
- 정답 비교는 `compareAnswers`를 사용한다.
  - 앞뒤 공백, 중복 공백, 대소문자 차이를 정규화해서 비교한다.
- 학습 결과는 `recordStudyAttempt`, `appendStudySession`으로 누적된다.

사용자에게 보여지는 암기 흐름:

1. 문제 수를 정한다.
2. 출제 방향을 고른다.
3. 암기 시작을 누른다.
4. 문제를 보고 답을 입력한다.
5. 정답/오답이 기록된다.
6. 기록 탭에서 오늘 학습과 최근 세션을 확인할 수 있다.

## 9. 탭별 역할

### 저장

- 새 카드를 만든다.
- 한쌍씩 저장과 파일 가져오기를 제공한다.
- 현재 튜토리얼에서는 사용자가 실제로 앞면/뒷면을 입력하고 저장하는 경험이 포함되어 있다.

### 암기

- 저장된 카드로 퀴즈를 만든다.
- 이번 문제 수, 출제 가능 수, 저장 카드 수, 출제 방향, 암기 시작 버튼이 핵심 UI다.
- 최근 튜토리얼 요구사항은 “설명만 하지 말고 방금 저장한 카드 한 장을 실제로 암기해보게 하기”였다.

### 기록

- 오늘 학습 요약을 보여준다.
- 틀린 카드와 최근 암기 세션을 보여준다.
- 틀린 것만 다시 풀면서 약한 카드를 빠르게 찾는 공간이다.

### 보관함

- 카드 검색.
- 최근 저장순, 많이 틀린 순 등 정렬.
- 각 카드 수정/삭제.
- 사용자 피드백으로 앞면/뒷면 라벨을 카드 목록에서 제거하고 카드 높이를 줄인 적이 있다.

### 앱 정보

- 로그인/로그아웃.
- 관리자 배지.
- 라이트/다크 모드.
- 언어 변경: 한국어, English, 日本語.
- MEMORIA 설명과 튜토리얼 다시 보기.
- 문의하기.
- admin일 경우 관리자 대시보드/문의 관리.

## 10. 문의하기 흐름

앱 정보 탭의 문의하기는 다음 내용을 입력받는다.

- 문의 분류: 오류제보, 기능제안, 기타
- 답변 받을 이메일
- 문의 내용

중요한 최근 수정:

- 답변 받을 이메일 입력칸에 특정 개발자 이메일이 기본으로 뜨지 않게 바꿨다.
- placeholder는 “답변 받을 이메일을 직접 입력해 주세요” 계열 문구다.
- Supabase 연결 시 `support_inquiries`에 저장된다.
- 실패하거나 비로그인 상황이면 로컬 문의 내역에 저장될 수 있다.

현재 구조상 실제 이메일 발송 기능은 아니다. “앱 안에 문의를 남기고 관리자/최근 문의에서 확인하는 기능”이다.

## 11. 튜토리얼 구조와 사용자 취향

사용자는 튜토리얼을 매우 중요하게 보고 있다. 다음 작업자가 특히 주의해야 할 부분이다.

사용자가 원하는 튜토리얼 느낌:

- 채팅하듯 시작한다.
- 자동으로 문장이 넘어가기보다 탭하거나 선택하면서 진행한다.
- 실제 앱 화면 위에서, 실제 버튼과 입력칸을 조작하게 한다.
- 튜토리얼 중에는 다른 탭이나 배경을 누르지 못하게 한다.
- 게임 튜토리얼처럼 설명 대상만 밝게 보이고 나머지는 어둡게 보여야 한다.
- 안내 박스는 팝업 설명만 하는 것이 아니라 실제 앱의 조작 위치를 가리켜야 한다.
- 단순 “다음” 버튼보다 사용자가 누를 대상이 명확할 때는 `탭을 기다리는 중`처럼 비활성 안내 pill을 선호한다.
- 시각적으로 거슬리는 검은 모서리, 말풍선 꼬리 색 차이, 홈 제스처 영역 겹침을 아주 싫어한다.

현재 `App.js`의 `TUTORIAL_STEPS`는 대략 다음 순서다.

1. 저장 탭으로 이동
2. `한쌍씩` 버튼 설명
3. 앞면/뒷면 실제 입력 및 저장
4. 첫 카드 생성 축하 메시지
5. 암기 탭으로 이동
6. 암기 준비 카드 설명
7. 암기 시작 버튼 대기
8. 실제 답 입력 연습
9. 기록 탭으로 이동
10. 오늘 학습 요약 설명
11. 틀린 카드/최근 세션 설명
12. 보관함 탭으로 이동
13. 검색/정렬 설명
14. 카드 목록 설명
15. 앱 정보 탭으로 이동
16. 문의하기 설명
17. 튜토리얼 종료

최근 커밋 흐름:

- `09ff269 feat: deepen guided tutorial practice`
- `eb9c397 fix: smooth tutorial waits and spotlight corners`
- `52c21fc fix: refine first tutorial tab prompt`
- `4899ec5 fix: remove tab tutorial coach icon`
- `ba904c8 fix: simplify tutorial coach copy layout`
- `da1522d fix: adjust save practice tutorial prompt`
- `4a2304f fix: skip file import tutorial step`
- `b896fb8 fix: update quiz start tutorial copy`

마지막 대화의 미해결 가능성이 큰 UI 이슈:

- 튜토리얼 spotlight의 둥근 모서리 안쪽에 어두운 조각이 침범해 보이는 문제.
- 사용자가 여러 번 “레이어 문제인지 모르겠지만 검은 부분이 안으로 들어온다”고 지적했다.
- 다음 채팅에서 이어 작업한다면 `TutorialOverlay`, spotlight mask, corner fill, bubble tail 레이어를 먼저 확인해야 한다.
- 실제 기기 스크린샷 기준으로 보는 것이 중요하다. 에뮬레이터/웹만 보고 끝내면 다시 어긋날 수 있다.

## 12. 실행 방법

의존성 설치:

```powershell
npm install
```

dev-client Metro 실행:

```powershell
npm run start
```

LAN 모드:

```powershell
npm run start:lan
```

터널 모드:

```powershell
npm run start:tunnel
```

직접 포트를 지정해야 할 때:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-dev-build.ps1 -Port 8082
```

Android 실행:

```powershell
npm run android
```

개발 빌드:

```powershell
npm run build:dev
```

프리뷰 APK:

```powershell
npm run build:preview
```

주의:

- 이 프로젝트는 `expo-dev-client`를 사용한다.
- QR을 스캔할 때 Metro 포트가 8082인데 앱이 8081을 보려고 하면 Metro를 끄고 같은 포트로 다시 시작해야 한다.
- Windows에서 `npx` 경로가 꼬이면 `C:\Program Files\nodejs\npx.cmd`를 직접 호출하면 된다.

## 13. 검증 방법

문법/번들 검증으로 자주 썼던 명령:

```powershell
& 'C:\Program Files\nodejs\npx.cmd' expo export --platform android --output-dir .tmp-expo-export-check
```

간단한 diff 공백 검증:

```powershell
git diff --check
```

Metro 상태 확인:

```powershell
curl.exe -I http://127.0.0.1:8082/status
```

문서만 바꾼 경우에는 `git diff --check` 정도면 충분하다.

## 14. Git 작업 규칙

현재 원격:

```text
origin https://github.com/youwon35/memorize_app2.git
```

작업 기준 브랜치:

```text
develop
```

사용자가 이 프로젝트에서 기대하는 기본 흐름:

1. 작업 전 최신 `develop`을 pull한다.
2. 변경한다.
3. 가능하면 검증한다.
4. `develop`에 commit한다.
5. `origin/develop`에 push한다.

단, 작업 중 사용자가 만든 변경이 있으면 절대 되돌리지 않는다. unrelated dirty file은 건드리지 않는다.

## 15. Notion / 인쇄용 요약 규칙

사용자가 별도로 지정한 로컬 기록 규칙이 있다.

- 중요한 작업을 하면 `D:\동기화용 파일들\인쇄용\memorize_app2_print.py`에 요약을 이어붙인다.
- Notion의 `메인 허브 > 개발 프로젝트 > 앱 개발 프로젝트` 안에 있는 `암기 앱` 페이지에도 `요약` 토글 아래로 같은 내용을 문서 형식으로 이어붙인다.
- 이 규칙은 사용자가 사고 흐름을 나중에 프린트해서 읽기 위한 것이다.

이 문서 작성 전까지 확인된 Notion 페이지:

- 페이지 이름: `암기 앱`
- page id: `3428d558438580508250cf79bc1d0165`

## 16. 다음 작업자가 바로 보면 좋은 코드 위치

튜토리얼을 고칠 때:

- `App.js`에서 `TUTORIAL_STEPS` 검색
- `TutorialOverlay` 검색
- `tutorialTargetProps` 검색
- `measureTutorialTarget` 검색
- `spotlight`, `mask`, `bubble`, `tail`, `waiting` 관련 스타일 검색

저장/불러오기 문제를 고칠 때:

- `handleSavePair`
- `handleImportFile`
- `src/utils/import-files.js`
- `src/utils/memory.js`

암기 문제를 고칠 때:

- `buildPracticeDeck`
- `compareAnswers`
- `recordStudyAttempt`
- `appendStudySession`
- `quiz` 관련 state

문의/관리자를 고칠 때:

- `support_inquiries`
- `handleSubmitSupport`
- `loadAdminData`
- `get_admin_dashboard_metrics`
- `src/i18n.js`의 `supportCategories`, `supportStatuses`, `about.*`

## 17. 알려진 리스크와 개선 후보

- `App.js`가 너무 크다.
  - 다음 큰 기능 전에 `screens/`, `components/`, `hooks/`, `tutorial/`로 분리하면 작업 안정성이 올라간다.
- 튜토리얼 overlay는 현재 가장 예민한 영역이다.
  - 작은 시각 차이도 사용자가 바로 알아차린다.
  - 실제 Android 기기 스크린샷으로 반드시 확인하는 편이 좋다.
- support 문의는 저장 기능이지 이메일 발송 기능이 아니다.
  - 나중에 실제 답변 메일을 보내려면 Supabase Edge Function 또는 이메일 서비스 연동이 필요하다.
- OCR 사진 가져오기는 숨김 상태다.
  - 다시 켤 때는 네이티브 권한, Edge Function, API 키, 비용을 같이 봐야 한다.
- 파일 가져오기 포맷 안내와 실제 파싱 규칙이 어긋나지 않게 유지해야 한다.
- Expo dev-client 포트 문제는 반복적으로 나올 수 있다.
  - Metro와 휴대폰 앱이 같은 포트를 보도록 맞추는 것이 핵심이다.

## 18. 다음 채팅에서 가장 자연스러운 시작점

다음 채팅에서 이어받는다면 먼저 이렇게 확인하면 된다.

```powershell
git status --short --branch
git pull --ff-only origin develop
git log -5 --oneline
```

튜토리얼 UI를 계속 고친다면 바로 다음을 확인한다.

```powershell
rg "TutorialOverlay|TUTORIAL_STEPS|spotlight|bubbleTail|mask" App.js
```

그리고 실제 휴대폰 dev build에서 튜토리얼을 처음부터 다시 진행해 보면서, 특히 다음 화면을 확인한다.

- 저장 탭의 카드 입력 spotlight 모서리
- 카드 저장 후 축하 메시지 버튼 문구
- 암기 탭 실제 암기 연습 흐름
- 기록/보관함에서 안내 말풍선이 하단 내비게이션과 겹치지 않는지
- 앱 정보의 문의하기 spotlight

## 19. 사용자 선호 메모

- 사용자는 한국어 UI를 기준으로 본다.
- 디자인은 MEMORIA의 기존 보라색/연보라/흰색 톤을 유지하길 원한다.
- 튜토리얼은 “설명 팝업”보다 “실제 앱 조작을 강제로 따라가는 경험”을 원한다.
- `좋아요`, `탭을 기다리는 중` 같은 문구 정렬과 버튼 높이를 세심하게 본다.
- 홈 제스처 영역과 겹치는 UI를 싫어한다.
- “처음 카드 저장 성공” 같은 순간은 조금 더 축하하는 느낌을 좋아한다.
- 튜토리얼 중 사용자가 임의로 다른 곳을 누르지 못하도록 잠그는 흐름을 선호한다.
