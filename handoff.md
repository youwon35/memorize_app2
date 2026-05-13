# MEMORIA handoff

작성 시점: 2026-05-14
작업 폴더: `D:\github\APP\memorize_app2`
원격 저장소: `https://github.com/youwon35/memorize_app2.git`
기본 작업 브랜치: `develop`
이 문서 갱신 직전 코드 최신 커밋: `b31a814 fix: simplify folder actions menu`
최근 상태: `develop` 브랜치에 최신 작업들이 push되어 있음.

## 1. 앱 한 줄 요약

MEMORIA는 앞면/뒷면 카드쌍을 저장하고, 폴더로 정리하고, 암기 퀴즈를 풀고, 기록과 오답을 다시 확인하는 Expo / React Native 모바일 앱이다.

현재 앱의 핵심 흐름은 다음과 같다.

1. 저장 탭에서 폴더를 선택하거나 만들고, 카드쌍을 한 장씩 또는 파일로 저장한다.
2. 암기 탭에서 폴더를 선택하고 해당 폴더의 카드로 문제를 푼다.
3. 기록 탭에서 오늘 학습, 최근 암기 기록, 오답/틀린 카드를 확인한다.
4. 보관함 탭에서 폴더 기준으로 카드를 탐색, 검색, 정렬, 수정, 삭제, 이동한다.
5. 앱 정보 탭에서 로그인, 테마, 언어, 튜토리얼, 문의, 관리자 지표를 다룬다.

## 2. 기술 스택

- Expo SDK: `~54.0.34`
- React Native: `0.81.5`
- React: `19.1.0`
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
  - `expo-linear-gradient`
  - `jszip`
  - `xlsx`

이 프로젝트는 웹 앱이 아니라 실제 모바일 앱을 목표로 한 Expo / React Native 앱이다. `expo-dev-client`가 들어있으므로 네이티브 모듈이나 Expo config가 바뀌면 새 dev build가 필요할 수 있다. 단순 `App.js`, `src/i18n.js` 같은 JS/UI 변경은 기존 dev build에서 Metro reload로 반영된다.

## 3. 주요 파일 지도

- `App.js`
  - 앱 대부분의 UI, 상태, 탭, 튜토리얼, 폴더, 카드, 암기, 기록, 보관함, 앱 정보, 관리자 화면이 들어있는 메인 파일.
  - 매우 큰 파일이다. 다음 큰 기능 작업 전에는 화면별 컴포넌트 분리를 고려할 만하다.
- `src/i18n.js`
  - 한국어, 영어, 일본어 번역.
  - 최근 폴더 메뉴 문구와 `돌아가기` 같은 암기 완료 화면 문구도 여기서 관리한다.
- `src/utils/memory.js`
  - 카드 정규화, 중복 병합, 정렬, 파일 import 파싱, 암기 덱 구성, 학습 기록 계산.
- `src/utils/import-files.js`
  - `txt`, `csv`, `xls`, `xlsx`, `docx` 파일 읽기.
- `src/lib/supabase.js`
  - Supabase 클라이언트.
  - 네이티브는 SecureStore, 웹은 AsyncStorage 기반 세션 저장.
- `src/config/features.js`
  - 기능 플래그.
  - 현재 사진/OCR import는 기본 UI에서 숨김 상태.
- `src/lib/photo-ocr.js`
  - OCR import 관련 클라이언트 코드.
- `supabase/schema.sql`
  - 전체 Supabase 스키마.
  - `memory_folders`, `memory_pairs.folder_id`, RLS 정책도 반영되어 있다.
- `supabase/migrations/20260514_add_memory_folders.sql`
  - 사용자가 이미 실행한 폴더 기능 마이그레이션.
- `scripts/start-dev-build.ps1`
  - dev-client Metro 실행 스크립트.
- `app.json`
  - Expo 앱 설정.
- `eas.json`
  - EAS build profile.

## 4. Git 흐름

기본 작업 브랜치는 `develop`이다. 사용자는 작업 후 항상 commit과 push까지 완료되길 기대한다.

작업 전 권장:

```powershell
git status --short --branch
git pull --ff-only origin develop
git log -5 --oneline
```

작업 후 권장:

```powershell
git diff --check
npx expo export --platform android --output-dir .tmp-expo-export-check
Remove-Item -Recurse -Force .tmp-expo-export-check
git add <changed files>
git commit -m "<message>"
git push origin develop
```

최근 주요 커밋:

- `b31a814 fix: simplify folder actions menu`
- `bf46a3e feat: add folder management`
- `c63de58 feat: add folder based card organization`
- `ba3cbe7 fix: refine tutorial intro and completion copy`
- `408e175 fix: reposition tutorial spotlights`
- `8f2164b fix: tighten tutorial spotlight targets`
- `31ff23d fix: align tutorial coach typography`
- `9501497 fix: align section typography and quiz spacing`

## 5. 로컬 기록 / Notion 규칙

사용자 지시로 중요한 코드/문서 변경이 생기면 아래 두 곳에 요약을 남겨야 한다.

1. 로컬 인쇄용 파일:
   - `F:\동기화용 파일\인쇄용\memorize_app2_print.py`
   - 파일이 없으면 만들고, 있으면 이어 붙인다.
2. Notion:
   - 페이지: `암기 앱`
   - page id: `3428d558-4385-8050-8250-cf79bc1d0165`
   - `요약` 토글 아래에 문서 형식으로 이어 붙인다.

이 규칙은 사용자가 나중에 사고 흐름을 프린트해서 읽기 위한 것이다. 코드 변경만이 아니라 handoff처럼 작업 흐름에 중요한 문서 갱신도 기록하는 편이 좋다.

## 6. Supabase / 데이터 구조

환경변수:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

주요 테이블:

- `public.user_profiles`
  - 사용자 이메일과 역할.
  - `role`: `user` 또는 `admin`.
- `public.memory_pairs`
  - 카드쌍.
  - `prompt_a`, `prompt_b`, `folder_id` 사용.
  - `folder_id` 기본값은 `root`.
- `public.memory_folders`
  - 폴더.
  - `id`, `user_id`, `parent_id`, `name`, `created_at`, `updated_at`.
  - `parent_id` 기본값은 `root`.
  - 하위 폴더 구조를 지원한다.
- `public.support_inquiries`
  - 문의하기 데이터.
- `public.app_usage_events`
  - 앱 실행/사용 이벤트.

폴더 마이그레이션:

- 파일: `supabase/migrations/20260514_add_memory_folders.sql`
- 사용자가 SQL 실행까지 완료했다고 말했다.
- 내용:
  - `memory_folders` 생성.
  - `memory_pairs.folder_id` 추가.
  - `memory_folders` RLS 활성화.
  - 자기 폴더 select/insert/update/delete 정책 추가.
  - `memory_pairs_user_id_folder_id_idx`, `memory_folders_user_id_parent_id_idx`, `memory_folders_user_parent_lower_name_idx` 추가.
  - 폴더 이름 empty check, 자기 자신 parent 금지 check.

## 7. AsyncStorage / 로컬 저장

핵심 로컬 키:

- `@memoria/cards`
  - 카드쌍 목록.
- `@memoria/folders`
  - 폴더 목록.
- `@memoria/study-stats`
  - 카드별 정답/오답/세션 기록.
- `@memoria/theme-mode`
  - 라이트/다크 모드.
- `@memoria/language`
  - 언어.
- `@memoria/tutorial-seen`
  - 튜토리얼 완료 여부.
- `@memoria/support-requests`
  - 문의 로컬 캐시.

과거 키:

- `@memora/study-pairs`
  - 과거 오타 버전 키.
  - 앱 시작 시 `@memoria/cards` 쪽으로 마이그레이션하는 흐름이 있다.

## 8. 현재 폴더 기능 상태

최근 추가된 큰 기능은 폴더 기반 카드 정리다.

사용자가 원한 큰 방향:

- 카드를 그냥 하나의 리스트에 쌓는 대신 폴더에 저장한다.
- 폴더 안에 폴더를 만들 수 있다.
- 저장 탭에서 현재 폴더를 고르고 그 안에 카드를 저장한다.
- 암기 탭에서 폴더를 고르면 그 폴더의 카드로 문제를 낸다.
- 보관함에서 폴더 기준으로 카드들을 확인하고 이동할 수 있다.

현재 구현:

- `App.js`에 `folders`, `saveFolderId`, `quizFolderId`, `manageFolderId` 상태 계열이 있다.
- `renderFolderExplorer`가 저장/암기/보관함에서 공통으로 쓰는 폴더 UI다.
- 폴더는 `root`에서 시작하고 breadcrumb로 현재 위치를 보여준다.
- 폴더 선택, 하위 폴더 진입, 상위 이동, 새 폴더 생성, 이름 변경, 삭제를 지원한다.
- 카드에는 `folderId`가 붙는다.
- Supabase 동기화 시 `folder_id`로 매핑한다.
- 보관함에는 카드 일괄 이동/선택 관련 흐름도 들어갔다.

최근 UI 변경:

- `새 폴더 만들기`, `이름 변경`, `폴더 삭제`, `상위` 버튼이 화면에 항상 노출되지 않게 했다.
- 오른쪽 위 `...` 더보기 버튼을 누르면 탐색기 메뉴처럼 선택할 수 있다.
- 저장/암기/보관함의 폴더 패널 모두 같은 방식으로 정리했다.
- 암기 빈 폴더 안내 화면의 하트 아이콘을 제거했다.
- 라운드 완료 화면의 `다시 암기 시작`을 `돌아가기`로 바꾸고, 누르면 암기 탭 초기 화면으로 돌아가게 했다.

관련 코드 위치:

- `App.js`
  - `renderFolderExplorer`
  - `createFolderViewKey`
  - `folderActionMenuKey`
  - `creatingFolderKey`
  - `createFolderInCurrentLocation`
  - `beginFolderRename`
  - `saveFolderRename`
  - `deleteCurrentFolder`
  - `moveSelectedPairsToFolder`
  - `returnToQuizReady`
- `src/i18n.js`
  - `folders.actions`
  - `folders.newFolder`
  - `folders.create`
  - `quiz.restartAdaptive`

## 9. 지금 막 중단된 최신 사용자 요청

사용자가 새 채팅방으로 넘어가기 직전에 요청을 시작했지만, turn이 중단되었다. 다음 채팅에서 이어받아야 할 가능성이 높은 요청이다.

요청 1:

- 현재 폴더 UI에서 하위 폴더 리스트가 행(row) 형태로 보인다.
- 사용자는 이 부분을 Windows 탐색기처럼 바꾸고 싶어 한다.
- 참고 이미지 느낌:
  - 각 폴더 항목에 폴더 아이콘이 있고,
  - 그 아래에 폴더 이름이 있다.
  - 꼭 Windows 색상/아이콘을 그대로 따라할 필요는 없다.
- 즉 `renderFolderExplorer` 안의 `currentChildren` 렌더링을 리스트형에서 아이콘 타일/그리드형으로 바꾸는 작업이 필요하다.
- 카드 개수/하위 폴더 수는 작게 보조 텍스트로 둘 수 있지만, 사용자는 폴더 아이콘과 이름 중심의 탐색기 느낌을 원한다.

요청 2:

- "`암기 탭`을 눌렀을 때 저 빨간색 부분과 초록색 부분이 뜨지 않게 하고, 폴더 UI만 뜨게 하고 싶다"고 했다.
- 첨부 이미지 기준 빨간색은 저장 폼 카드, 초록색은 상단 `한장씩` / `파일로` 토글로 보인다.
- 문장이 중간에 끊겼다:
  - "오른쪽 하단에 동그라미 + 버튼이 있고 그걸 누르면 '한장씩'과 '"
- 다음 채팅에서 정확히 물어봐야 할 수 있다.
- 합리적 추정:
  - 저장 탭에서도 기본 화면은 폴더 탐색기만 보여주고,
  - 오른쪽 아래 floating `+` 버튼을 누르면 `한장씩`, `파일로` 저장 옵션이 펼쳐지는 구조를 원할 가능성이 크다.
  - 하지만 사용자가 "`암기 탭`"이라고 썼으므로, 저장 탭과 암기 탭을 헷갈렸는지 확인이 필요하다.

이 작업을 이어갈 때 먼저 확인할 코드:

```powershell
rg -n "renderFolderExplorer|currentChildren|saveMode|modeTabs|renderSaveTab|renderQuizTab|floating" App.js
```

## 10. 저장 탭 구조

저장 탭은 현재 다음 구조를 가진다.

1. 상단 저장 방식 토글:
   - `한장씩`
   - `파일로`
2. 폴더 패널:
   - 현재 위치 표시.
   - breadcrumb.
   - 하위 폴더.
   - 오른쪽 위 더보기 메뉴.
3. 한장씩 저장 폼:
   - 앞면 입력.
   - 뒷면 입력.
   - 저장하기.
4. 파일로 저장 폼:
   - txt/docx/csv/xls/xlsx 안내.
   - 파일 불러오기.

사용자는 최신 요청에서 이 상단 토글과 폼을 기본 노출하지 않고, 폴더 탐색기 중심으로 만들고 싶어 하는 듯하다. 다만 요청 문장이 끊겼으므로 다음 채팅에서 확정하는 것이 좋다.

## 11. 암기 탭 구조

암기 탭은 폴더 선택 후 해당 폴더의 카드로 퀴즈를 만든다.

주요 상태:

- `deck`
- `quizIndex`
- `answer`
- `feedback`
- `result`
- `roundComplete`
- `roundIncorrectIds`
- `quizFolderId`
- `quizLimit`
- `quizMode`

주요 흐름:

1. 폴더 explorer 표시.
2. 선택한 폴더에 출제 가능한 카드가 없으면 빈 안내 패널 표시.
3. 카드가 있으면 문제 수/출제 방향 설정 UI 표시.
4. `암기 시작`.
5. 답 제출.
6. 라운드 완료.
7. `돌아가기` 버튼으로 초기 암기 화면 복귀.

최근 변경:

- 빈 폴더 안내의 하트 아이콘 제거.
- `돌아가기` 버튼은 `returnToQuizReady()`를 호출한다.

## 12. 보관함 구조

보관함은 폴더 기준으로 카드들을 관리한다.

주요 기능:

- 폴더 탐색.
- 검색.
- 정렬.
- 카드 수정.
- 카드 삭제.
- 선택 모드.
- 선택한 카드 일괄 이동.

폴더 일괄 이동 관련 코드는 폴더 기능 추가 때 같이 들어갔다. 다음 작업자가 폴더 타일 UI를 바꿀 때 보관함에서도 같은 `renderFolderExplorer`를 쓰므로 영향 범위를 확인해야 한다.

## 13. 기록 탭 구조

기록 탭은 다음을 보여준다.

- 오늘의 학습 요약.
- 최근 암기 기록.
- 날짜 선택 달력 UI.
- 오늘 틀린 카드.

최근 변경된 요구:

- `최근 암기 세션` 문구를 `최근 암기 기록`으로 바꿨다.
- 날짜 버튼 나열 대신 오른쪽 달력 아이콘에서 날짜를 선택하는 방식으로 바꿨다.
- 가능하면 달력 날짜에 학습 횟수가 보이도록 했다.

관련 코드:

- `studyStats`
- `recentSessions`
- `selectedHistoryDate`
- `calendar`
- `history`

## 14. 앱 정보 탭 구조

앱 정보 탭은 다음을 포함한다.

- 계정 상태와 Google 로그인/로그아웃.
- 화면 모드.
- 언어.
- 문의하기.
- 튜토리얼.
- 운영 지표 / 관리자 기능.

최근 변경:

- `튜토리얼 다시보기` 섹션명을 `튜토리얼`로 바꿨다.
- `튜토리얼 다시보기` 버튼을 별도로 만들었다.
- `문의하기`가 스크롤 없이 더 잘 보이도록 순서를 조정했다.
- 튜토리얼 종료 alert 문구를 한국어 사용자에게 맞춰 바꿨다.
  - `튜토리얼이 종료되었어요!`
  - `이제 메모리아를 편하게 사용해 주세요.`
  - `이 앱이 사용자님의 학습에 도움이 되길 바래요!`

## 15. 튜토리얼 구조와 사용자 선호

튜토리얼은 이 프로젝트에서 사용자가 매우 세심하게 보고 있는 부분이다.

사용자가 원하는 느낌:

- 채팅하듯 시작한다.
- 실제 앱 화면 위에서 실제 조작 대상을 강조한다.
- spotlight가 실제 버튼/카드 위치와 정확히 맞아야 한다.
- 휴대폰 화면 크기가 달라도 강조 영역이 어긋나면 안 된다.
- 말풍선과 강조 영역이 겹치지 않아야 한다.
- 불필요한 아이콘은 빼고 텍스트 정렬을 깔끔하게 맞춘다.
- 튜토리얼 설명 타이포는 실제 화면의 제목/설명 타이포와 일관되어야 한다.
- 하단 홈 제스처 영역, 하단 탭, 말풍선 겹침에 민감하다.
- 튜토리얼 중 사용자가 임의로 다른 곳을 누르지 못하게 잠그는 흐름을 선호한다.

주요 코드:

- `TUTORIAL_STEPS`
- `TutorialOverlay`
- `TUTORIAL_STEP_MAP`
- `measureTutorialTarget`
- `tutorialTargetProps`
- spotlight 관련 style
- bubble / tail / waiting pill 관련 style

이전 주요 튜토리얼 변경:

- 파일로 튜토리얼 단계를 제거하고 암기 탭으로 넘어가게 했다.
- 첫 카드 저장 후 암기 탭으로 이동하는 흐름으로 바꿨다.
- 실제로 `Hello` / `안녕` 카드를 저장하게 했다.
- 암기 시작 버튼을 누르게 했다.
- 기록, 보관함, 문의하기까지 안내한다.
- 튜토리얼 설명 텍스트의 제목/내용 타이포를 실제 화면 제목/내용과 맞췄다.
- 시작 화면은 앱의 보라색/연보라/흰색 톤에 맞게 리디자인했다.

## 16. 튜토리얼 종료 문구

한국어 사용자 기준 최종 alert 문구는 다음 방향으로 수정되어 있다.

- 제목: `튜토리얼이 종료되었어요!`
- 본문:
  - `이제 메모리아를 편하게 사용해 주세요.`
  - 줄바꿈 후 `이 앱이 사용자님의 학습에 도움이 되길 바래요!`

기존 `Memoria`는 한국어 사용자에게 `메모리아`로 보이도록 수정했다.

## 17. 문의하기 흐름

앱 정보 탭의 문의하기는 다음 입력을 받는다.

- 문의 분류:
  - 오류제보
  - 기능제안
  - 기타
- 답변 받을 이메일
- 문의 내용

Supabase 연결 시 `support_inquiries`에 저장한다. 실제 이메일 발송 기능은 아니다. 관리자/앱 내 문의 확인용 저장 기능에 가깝다.

## 18. 개발 실행 방법

의존성 설치:

```powershell
npm install
```

dev-client Metro:

```powershell
npm run start
```

LAN:

```powershell
npm run start:lan
```

터널:

```powershell
npm run start:tunnel
```

Android:

```powershell
npm run android
```

dev build:

```powershell
npm run build:dev
```

preview APK:

```powershell
npm run build:preview
```

Metro 포트가 꼬이면:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-dev-build.ps1 -Port 8082
curl.exe -I http://127.0.0.1:8082/status
```

## 19. 검증 방법

자주 쓴 검증:

```powershell
git diff --check
npx expo export --platform android --output-dir .tmp-expo-export-check
Remove-Item -Recurse -Force .tmp-expo-export-check
```

실기기 확인이 특히 중요한 부분:

- 튜토리얼 spotlight 위치.
- 하단 내비게이션과 말풍선 겹침.
- Android 상태바/제스처바와 카드 간격.
- 폴더 explorer UI의 터치 영역.
- 암기 중 뒤로가기/다른 탭 이동 시 confirm 팝업.

## 20. 사용자 선호 메모

- 사용자 UI 기준은 한국어다.
- 기존 MEMORIA의 보라색, 연보라, 흰색 톤을 선호한다.
- 과한 장식보다 앱 자체 기능이 보기 좋게 정리되는 것을 원한다.
- 튜토리얼은 "설명용 화면"보다 "실제 앱을 따라 조작하는 화면"을 선호한다.
- 버튼 문구, 줄바꿈, 간격, 타이포 차이를 매우 잘 본다.
- "어떤 휴대폰을 열어도 제대로 보이게"를 반복해서 강조했다.
- 폴더 기능은 앞으로 카드가 많아질 상황을 대비한 핵심 기능으로 보고 있다.
- 다음 큰 방향은 폴더 탐색 경험을 Windows 탐색기처럼 더 자연스럽게 만드는 것이다.

## 21. 다음 채팅에서 바로 할 일

다음 채팅에서 이어받으면 우선:

```powershell
git status --short --branch
git pull --ff-only origin develop
rg -n "renderFolderExplorer|currentChildren|saveMode|renderSaveTab|renderQuizTab|returnToQuizReady" App.js
```

그다음 사용자에게 끊긴 요청을 짧게 확인하면 좋다.

확인 질문 후보:

> "방금 말한 오른쪽 아래 + 버튼은 저장 탭에서 한장씩/파일로 저장 방식을 여는 버튼으로 이해하면 될까요?"

확정되면 작업 방향:

1. `renderFolderExplorer`의 하위 폴더 렌더링을 row list에서 icon tile/grid로 변경.
2. 저장 탭 상단 `한장씩` / `파일로` 토글과 저장 폼의 기본 노출 여부 정리.
3. floating `+` 버튼 추가.
4. `+` 버튼 메뉴에서 `한장씩`, `파일로` 선택 시 해당 저장 UI 표시.
5. 암기 탭은 폴더 explorer만 먼저 보이는 방식인지, 아니면 저장 탭 요청을 잘못 말한 것인지 확인 후 반영.
6. `git diff --check`와 Expo Android export로 검증.
7. 인쇄용 파일/Notion 요약, commit, push.
