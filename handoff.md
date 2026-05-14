# MEMORIA / 메모리아 handoff

작성 시점: 2026-05-15
작업 폴더: `D:\github\APP\memorize_app2`
원격 저장소: `https://github.com/youwon35/memorize_app2.git`
기본 작업 브랜치: `develop`
최신 확인 커밋: `3f0af3f fix: smooth tutorial progression`
현재 상태: 최신 작업은 `origin/develop`에 push 완료된 상태에서 이 문서를 새로 덮어쓴다.

## 1. 앱 한 줄 요약

MEMORIA는 앞면/뒷면 카드쌍을 저장하고, 폴더로 정리하고, 선택한 폴더 범위로 암기 퀴즈를 풀고, 기록/오답/보관함에서 다시 관리하는 Expo / React Native 모바일 앱이다.

사용자가 출시를 앞두고 UI/튜토리얼/출시 준비를 계속 다듬는 중이다. 웹앱이 아니라 실제 모바일 앱을 목표로 한다.

## 2. 사용자 작업 규칙

새 채팅에서 가장 먼저 기억해야 할 규칙이다.

- 사용자는 한국어로 대화한다. 답변도 자연스러운 한국어가 좋다.
- 코드나 문서 변경이 생기면 기본적으로 `develop` 브랜치에 commit, push까지 완료한다.
- 앱 작업 후 가능하면 Expo Go 또는 Android 기기 확인을 원한다. 단, 현재 이 세션 마지막 확인에서는 `adb devices`에 연결된 기기가 없었다.
- 중요한 작업 흐름은 아래 두 곳에 요약을 남긴다.
  - 로컬 인쇄용 파일: `F:\동기화용 파일\인쇄용\memorize_app2_print.py`
  - Notion 페이지: `암기 앱`, page id `3428d558-4385-8050-8250-cf79bc1d0165`, 본문 `요약` 토글 아래
- 더 나은 아이디어가 있으면 마지막에 짧게 추천해도 좋다.

## 3. 기술 스택

- Expo SDK: `~54.0.34`
- React Native: `0.81.5`
- React: `19.1.0`
- 앱 이름: `MEMORIA`
- Android package: `com.memoria.app`
- iOS bundle id: `com.memoria.app`
- Expo owner: `zinnn`
- EAS project id: `6caf9ed8-f402-4743-8222-5e05fcedb0f2`
- 주요 라이브러리:
  - `@react-native-async-storage/async-storage`
  - `@supabase/supabase-js`
  - `expo-auth-session`
  - `expo-dev-client`
  - `expo-document-picker`
  - `expo-file-system`
  - `expo-linear-gradient`
  - `expo-secure-store`
  - `expo-web-browser`
  - `jszip`
  - `xlsx`

`expo-dev-client`가 들어있다. JS/UI 변경은 Metro reload로 대체로 반영되지만, 네이티브 모듈/Expo config/plugin/permission 변경은 새 dev build나 EAS build가 필요할 수 있다.

## 4. 주요 명령

작업 전:

```powershell
git status --short --branch
git pull --ff-only origin develop
git log -8 --oneline
```

검증:

```powershell
git diff --check
npx expo export --platform android --output-dir .expo-export --clear
```

`expo export` 후에는 `.expo-export`를 삭제한다. 삭제 전에는 반드시 작업 폴더 내부인지 확인한다.

```powershell
$workspace = (Resolve-Path .).Path
$target = Resolve-Path .expo-export -ErrorAction SilentlyContinue
if ($target -and $target.Path.StartsWith($workspace)) {
  Remove-Item -LiteralPath $target.Path -Recurse -Force
}
```

기기 확인:

```powershell
adb devices
```

커밋/푸시:

```powershell
git add App.js src/i18n.js package.json package-lock.json app.json README.md handoff.md
git commit -m "<message>"
git push origin develop
```

## 5. 파일 지도

- `App.js`
  - 앱 대부분의 UI와 상태가 들어있는 메인 파일.
  - 탭, 저장 모달, 폴더 탐색기, 암기 화면, 기록, 보관함, 앱 정보, 튜토리얼까지 대부분 이 파일에서 처리한다.
  - 매우 커졌기 때문에 큰 기능을 더 넣기 전에는 화면별 컴포넌트 분리를 고려할 만하다.
- `src/i18n.js`
  - 한국어, 영어, 일본어 번역.
  - 최근 튜토리얼 문구, 정책 초안, 폴더/암기/기록/보관함 문구가 여기에 있다.
- `src/utils/memory.js`
  - 카드 정규화, 중복 처리, 정렬, 파일 import 파싱 보조, 암기 덱 구성, 학습 통계 계산.
- `src/utils/import-files.js`
  - `txt`, `csv`, `xls`, `xlsx`, `docx` 파일 읽기.
- `src/lib/supabase.js`
  - Supabase 클라이언트.
  - 네이티브는 SecureStore, 웹은 AsyncStorage 기반 세션 저장.
- `supabase/schema.sql`
  - 전체 Supabase 스키마.
- `supabase/migrations/20260514_add_memory_folders.sql`
  - 폴더 기능 마이그레이션.
- `scripts/start-dev-build.ps1`
  - dev-client Metro 실행 스크립트.
- `app.json`
  - Expo 앱 설정.
- `eas.json`
  - EAS build profile.

## 6. 앱 탭 구조

하단 탭은 5개다.

1. `저장`
   - 폴더 탐색/생성/이름 변경/삭제.
   - 오른쪽 아래 플로팅 + 버튼으로 카드 추가 메뉴 오픈.
   - `한장씩`으로 카드쌍 직접 저장.
   - `파일로`로 txt/docx/csv/xls/xlsx 가져오기.
2. `암기`
   - 선택된 폴더와 모든 하위 폴더의 카드가 출제 범위.
   - 문제 수 선택.
   - 출제 방향: 양방향 / 앞면만 / 뒷면만.
   - `암기 시작`, `오답만 다시풀기`, `카드 관리`.
3. `기록`
   - 오늘의 학습 요약.
   - 일일 목표와 진행률.
   - 최근 암기 기록.
   - 오답만 다시풀기.
   - 오늘 틀린 카드 영역은 최근 요청으로 제거됨.
4. `보관함`
   - 폴더별 저장된 카드 목록.
   - 좌우 카드쌍 형태로 표시.
   - 오른쪽 조작 버튼에서 수정/삭제.
   - 정렬: 등록시간 순, 오답순.
   - 폴더 패널 접기/펼치기.
5. `앱 정보`
   - 계정 / Google 로그인.
   - 라이트/다크 화면 모드.
   - 언어.
   - 문의하기.
   - 앱 정보, 버전, 개인정보 처리방침, 이용약관, 오픈소스 라이선스.
   - 관리자라면 문의함/지표 관련 섹션도 있음.

## 7. 폴더 기능 현재 상태

폴더 기능은 앱 전반의 중심이 되었다.

- 저장/암기/보관함에서 같은 `renderFolderExplorer`를 공유한다.
- 폴더는 `root`에서 시작한다.
- 하위 폴더 생성, 진입, breadcrumb 이동이 가능하다.
- 폴더 카드의 오른쪽 위 버튼으로 이름 변경/삭제를 한다.
- 저장된 카드 노드는 문서 아이콘으로 보이고, 누르면 해당 폴더의 저장된 카드를 보여준다.
- 암기 탭에서는 선택된 폴더와 모든 하위 폴더의 카드가 출제된다.
- 보관함의 폴더 패널은 접기/펼치기 버튼이 있다.
- 새 폴더 만들기와 이름 변경 UI가 서로 충돌하지 않도록, 하나를 시작하면 다른 편집 상태는 닫히게 했다.
- 다른 탭으로 이동했다 돌아오면 폴더 이름 변경/새 폴더 작성 같은 임시 편집 상태가 초기화되도록 최근 조정했다.

관련 상태/함수 키워드:

- `folders`
- `saveFolderId`
- `quizFolderId`
- `manageFolderId`
- `folderActionMenuKey`
- `creatingFolderKey`
- `renamingFolderId`
- `renderFolderExplorer`
- `renderCreateFolderTile`
- `renderChildFolderTile`
- `createFolderInCurrentLocation`
- `beginFolderRename`
- `saveFolderRename`
- `deleteFolder`
- `getFolderSubtreeIds`
- `getFolderPath`
- `normalizeFolderId`

## 8. 저장 흐름 현재 상태

저장 탭 기본 화면은 폴더 UI 중심이다. 카드 입력 폼은 항상 떠 있지 않고, 오른쪽 아래 + 버튼을 누르면 추가 방식 메뉴가 나온다.

- `한장씩`
  - bottom sheet/modal 형태.
  - 앞면/뒷면 입력.
  - 저장 위치 strip 표시.
  - 위치 변경 가능.
  - 저장하기 버튼은 홈 영역에 가리지 않도록 이전에 간격 조정.
- `파일로`
  - 여러 장 한꺼번에 추가.
  - 예시 카드 구조 표시.
  - 파일 불러오기 버튼은 저장하기 버튼 계열 UI와 맞춰둠.
  - 파일 튜토리얼은 현재 제거되어 있음.

중요:

- 파일 import는 `txt/docx`의 경우 앞면 한 줄, 뒷면 다음 줄, 빈 줄로 카드 구분.
- `csv/xls/xlsx`는 1열과 2열을 카드쌍으로 읽는다.
- 중복 카드는 저장에서 스킵된다.

## 9. 암기 흐름 현재 상태

암기 탭은 다음 흐름이다.

- 제목: `준비된 카드로 암기를 시작해요`
- 학습 범위 카드:
  - 설명: `선택된 폴더와 모든 하위 폴더의 카드가 출제됩니다.`
  - 현재 선택 폴더 경로 표시.
  - 저장 카드 수 / 출제 가능 수 표시.
- 폴더 설정:
  - 폴더 패널에서 직접 폴더를 눌러 들어가면 그 폴더가 학습 범위가 된다.
  - 별도의 `변경` 버튼 방식은 제거되었다.
- 문제 수:
  - - / + 버튼과 5, 10, 20, 전체 프리셋.
- 출제 방향:
  - 양방향 / 앞면만 / 뒷면만.
- 주요 버튼:
  - `N문제 암기 시작`
  - `오답만 다시풀기`
  - `카드 관리`

오답만 다시풀기:

- 최근 요청으로 `오늘부터 며칠 이내`의 오답을 모아 다시 풀 수 있게 하는 방향으로 바뀌었다.
- `retryDaysInput`, `retryWindowVisible`, `startRecentIncorrectRetry`, `getRecentIncorrectSessions`, `buildIncorrectRetryDeck` 관련 코드를 확인한다.

암기 중 UI:

- 상단: 뒤로, 진행 수, 닫기, 진행바.
- 질문 라벨과 문제 텍스트.
- 답 입력 영역.
- `정답 확인`, `건너뛰기`.
- 틀렸을 때:
  - `틀렸습니다!`
  - 사용자가 입력한 답 / 정답 표시.
  - `다음 카드로`, 마지막 문제면 `암기 종료`.
- 종료 중단 팝업:
  - `암기를 멈추고 나갈까요?`
  - `계속 암기`, `나가기`.

라운드 완료 화면:

- `암기 완료`
- 설명: `수고하셨습니다! 꾸준한 연습으로 잊지않게 해봐요!`
- 결과 카드: 전체 문제 / 맞힌 문제 / 다시 풀 문제.
- 버튼: `오답만 다시풀기`, `돌아가기`.
- 예전 장식 이모티콘/칭찬 박스는 제거됨.

## 10. 기록 탭 현재 상태

최근 기록 탭은 디자인을 한 번 크게 다듬었다.

- 오늘의 학습 카드:
  - 학습 횟수
  - 푼 문제
  - 오늘 오답
  - 오늘 진행률
  - 목표 설정 버튼
- 목표 설정:
  - 버튼을 누르면 오늘 목표 횟수를 설정하는 모달이 떠야 한다.
  - 관련 상태/함수: `dailyStudyGoal`, `dailyGoalModalVisible` 등.
- 최근 암기 기록:
  - 오답 배지가 오른쪽 위에 중복 표시되지 않도록 정리됨.
  - 세션 항목의 설명은 `18문제 · 18개 오답`처럼 오답 기준으로 표시하도록 바뀜.
  - `오답만 다시풀기` 버튼.
  - 카드 높이를 줄이는 방향으로 정리됨.
- 오늘 틀린 카드 섹션은 사용자가 제거 요청했고 현재 제거된 상태.

## 11. 보관함 현재 상태

보관함은 저장된 카드쌍을 직접 수정/삭제하는 탭이다.

- 상단 폴더 패널:
  - 점3개 메뉴 제거/간소화 작업 이후, 폴더 카드 오른쪽 위 액션 버튼으로 이름 변경/삭제.
  - 새 폴더 + 타일로 폴더 추가.
  - 폴더 패널 접기/펼치기.
- 저장된 카드 목록:
  - 제목: `저장된 카드 목록`
  - 설명: `여기서 카드쌍을 수정/삭제 할 수 있습니다.`
  - 정렬 버튼: 등록시간 순 / 오답순.
  - 카드쌍은 좌우 배치.
  - 오른쪽 조작 버튼을 누르면 슬라이드/액션 UI로 수정/삭제.
  - 스크롤 가능하다는 시각적 표시가 있음.

## 12. 앱 정보 현재 상태

앱 정보 탭에는 다음이 있다.

- 상단 제목/설명:
  - 제목: `앱 정보`
  - 설명: `앱 환경을 변경할 수 있어요.`
- 계정 카드:
  - Google 로그인/로그아웃.
  - 관리자 배지.
- 화면 모드:
  - 라이트 / 다크만 있음.
  - 시스템 옵션은 제거됨.
- 언어:
  - 한국어 / English / 日本語.
- 문의하기:
  - 오류제보 / 기능제안 / 기타.
  - 답변 받을 이메일.
  - 문의 내용.
  - 전송.
  - 최근 문의 확인.
- 앱 정보 카드:
  - 버전.
  - 개인정보 처리방침.
  - 이용약관.
  - 오픈소스 라이선스.

정책 문서는 초안이다. 실제 출시 전에는 운영 방식과 맞는지 최종 점검해야 한다.

## 13. 튜토리얼 현재 상태

가장 최근에 많이 손본 부분이다.

튜토리얼 저장 키:

- `@memoria/tutorial-seen-v3`

튜토리얼 구조:

1. 첫 환영 화면
   - 채팅형 말풍선 제거.
   - 심플한 환영 제목, 마스코트, 기능 카드 3개, 시작하기/건너뛰기.
   - 한국어에서는 `Memoria`가 아니라 `메모리아`로 표기.
   - 이 화면에서는 저장 탭의 플로팅 + 버튼이 보이면 안 되도록 수정됨.
2. 저장 탭
3. 폴더와 카드 관리
   - 첫 사용자에게 폴더가 없을 수 있으므로, 튜토리얼 중에는 폴더 생성 + 타일을 목록 앞쪽에 먼저 보여주게 했다.
4. 카드 만드는 방법
   - 기존 `카드 만드는 법` 액션 문구는 `다음으로`로 변경.
5. 한장씩 모달
   - 설명이 모달 뒤에 가려지는 문제를 해결하기 위해, 모달 내부 상단에 튜토리얼 안내 카드를 넣었다.
   - 실제로 입력/저장하지 않아도 `다음으로`로 넘어갈 수 있다.
6. 암기 탭
7. 폴더 설정
8. 암기 시작 버튼
9. 기록 탭
10. 기록되는 내용
11. 보관함 탭
12. 카드 수정/삭제 방법
13. 앱 정보 탭
14. 문의하기
15. 종료

중요한 튜토리얼 방식 변경:

- 예전에는 `아래의 저장 탭을 눌러주세요`처럼 사용자가 실제 탭을 눌러야 넘어갔다.
- 현재는 대부분 `다음으로` 버튼을 누르면 진행된다.
- 필요한 탭 전환은 `advanceTutorial`에서 자동으로 처리한다.
- `waitForTab` 기반 흐름은 사실상 제거되었지만, 코드 일부에는 호환용 잔재가 남아 있다. 새 기능 추가 시 다시 쓰지 않는 편이 좋다.

관련 코드:

- `TUTORIAL_STEPS`
- `TUTORIAL_SEEN_KEY`
- `TutorialOverlay`
- `TutorialCoach`
- `advanceTutorial`
- `applyTutorialStepSideEffects`
- `saveTutorialInlineCard` 스타일
- `src/i18n.js`의 `tutorial` 번역 블록

## 14. Supabase / 데이터 구조

환경변수:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_APP_SCHEME`

주요 테이블:

- `public.user_profiles`
  - 사용자 이메일과 역할.
  - `role`: `user` 또는 `admin`.
- `public.memory_pairs`
  - 카드쌍.
  - `prompt_a`, `prompt_b`, `folder_id`.
  - `folder_id` 기본값은 `root`.
- `public.memory_folders`
  - 폴더.
  - `id`, `user_id`, `parent_id`, `name`, `created_at`, `updated_at`.
  - `parent_id` 기본값은 `root`.
- `public.support_inquiries`
  - 문의하기 데이터.
- `public.app_usage_events`
  - 앱 실행/사용 이벤트.

마이그레이션:

- `supabase/migrations/20260514_add_memory_folders.sql`
- 사용자 말에 따르면 이미 Supabase에서 실행 완료.

RLS:

- 사용자별 폴더/카드 접근 정책이 들어가 있다.
- 관리자 기능은 `user_profiles.role` 기준.

## 15. AsyncStorage / 로컬 저장 키

주요 키:

- `@memoria/cards`
- `@memoria/folders`
- `@memoria/study-stats`
- `@memoria/daily-study-goal`
- `@memoria/theme-mode`
- `@memoria/language`
- `@memoria/tutorial-seen-v3`
- `@memoria/support-requests`

과거 키:

- `@memora/study-pairs`
  - 과거 오타 버전 키.
  - 앱 시작 시 새 키로 마이그레이션하는 흐름이 있다.

## 16. 최근 커밋 흐름

최근 `develop`에 push된 커밋:

- `3f0af3f fix: smooth tutorial progression`
  - 튜토리얼 첫 화면 + 버튼 숨김.
  - 한국어 `Memoria` -> `메모리아`.
  - `다음으로` 버튼 중심 진행.
  - 폴더 생성 + 타일 튜토리얼 위치 보정.
  - 한장씩 모달 내부 튜토리얼 카드 추가.
- `d7089e0 feat: simplify onboarding tutorial`
  - 채팅형 튜토리얼 제거.
  - 새 환영 화면.
  - 저장/암기/기록/보관함/앱정보 순서 튜토리얼.
- `f1d19a6 feat: refresh guided tutorial flow`
  - 이전 튜토리얼 큰 개편.
- `8d8ff1b fix: refine save modal and folder edit states`
  - 저장 모달, 파일로 탭, 폴더 편집 상태 개선.
- `23cfb9c feat: polish quiz completion screen`
  - 암기 완료 화면 개선.
- `47b32bd feat: refine folder controls and quiz results`
  - 폴더 접기/펼치기, 정렬, 퀴즈 결과 관련 개선.
- `e8dfef9 feat: add study goal and stop modal`
  - 기록 목표 설정과 암기 중단 모달.
- `0d90d28 feat: redesign quiz flow controls`
  - 암기 탭 레이아웃/컨트롤 재구성.

## 17. 검증 현황

마지막 작업에서 확인한 것:

- `git diff --check` 통과.
- 튜토리얼 번역 키 누락 검사 통과.
- `npx expo export --platform android --output-dir .expo-export --clear` 성공.
- `.expo-export`는 삭제 완료.
- `adb devices` 결과 연결된 기기 없음.

실기기 확인은 다음 채팅에서 사용자가 기기를 연결하면 진행하면 된다.

## 18. 출시 준비 메모

사용자는 앱을 조금 더 수정한 뒤 출시 예정이라고 말했다.

출시 전 꼭 볼 것:

- 앱 이름/아이콘/스플래시 최종 확인.
- Google 로그인 설정:
  - Supabase OAuth redirect.
  - Android package / SHA 설정.
  - iOS bundle id / URL scheme.
- 개인정보 처리방침, 이용약관, 오픈소스 라이선스 초안 검토.
- Supabase RLS 실제 계정으로 검증.
- 오프라인 상태에서 저장/암기/기록 동작 확인.
- 앱 삭제/재설치 후 로컬 데이터와 로그인 동작 확인.
- Android 화면 크기별 UI 확인.
- iOS는 Windows에서 직접 빌드/시뮬레이터 확인이 어렵다.
  - EAS Build로 iOS 빌드를 만들 수는 있지만 Apple Developer 계정이 필요하다.
  - 실제 iPhone 테스트는 TestFlight 또는 Expo dev build 설치가 필요하다.
  - 애플 기기가 없다면 지인 기기, 클라우드 테스트 서비스, 또는 중고 테스트 기기 확보가 현실적이다.

## 19. 다음 작업자가 조심할 점

- `App.js`가 매우 크다. 변경 전 `rg`로 정확한 위치를 찾고, 작은 범위로 수정하라.
- 폴더 UI는 저장/암기/보관함이 같은 함수를 공유하므로 한 곳 수정이 세 탭에 영향을 줄 수 있다.
- 튜토리얼은 실제 UI state를 많이 건드린다. 새 단계 추가 시 `applyTutorialStepSideEffects`, `advanceTutorial`, 번역 키를 함께 확인하라.
- 저장 모달은 Modal 위에 뜬다. 튜토리얼 오버레이를 Modal 밖에 띄우면 z-index/레이어 때문에 뒤에 깔릴 수 있다. 그래서 최근에는 모달 내부에 튜토리얼 안내 카드를 넣었다.
- 한국어 사용자 노출 문구에서는 브랜드명을 `메모리아`로 쓰는 흐름이 생겼다. 앱 이름 자체는 `MEMORIA` 유지.
- Git worktree에 사용자 변경이 있을 수 있다. 절대 무단으로 되돌리지 말고 같이 읽고 맞춰라.

## 20. 새 채팅 시작 추천 순서

1. 이 파일을 읽는다.
2. `git status --short --branch`로 작업 상태를 확인한다.
3. 사용자가 새 요청을 하면 `App.js`와 `src/i18n.js`에서 관련 위치를 `rg`로 찾는다.
4. 구현한다.
5. `git diff --check`, 가능하면 `npx expo export --platform android --output-dir .expo-export --clear`.
6. `.expo-export` 삭제.
7. 인쇄용 파일과 Notion 요약 업데이트.
8. commit/push.
