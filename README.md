# MEMORIA

직접 만든 앞면·뒷면 카드를 저장하고 자주 틀리는 카드를 반복 학습하는 React Native 모바일 암기 앱입니다. 게스트는 기기에 저장하고, Google 로그인 사용자는 Supabase로 카드·폴더·학습 상태를 동기화합니다.

현재 개발 버전은 **1.0.10**입니다. Expo SDK 54를 유지하며 Expo 54.0.37, expo-file-system 19.0.24, React Native 0.81.5를 사용합니다.

## 주요 기능

| 탭 | 기능 |
| --- | --- |
| 저장 | 카드 입력, 폴더 지정, TXT·CSV·XLS·XLSX·DOCX 가져오기, 미리보기와 중복 제외 |
| 암기 | 폴더·문제 수 선택, 앞면·뒷면·양방향 출제, 약한 카드 우선 선정, 힌트·오답 복습 |
| 기록 | 날짜별 학습, 정오답·연속 학습일·일일 목표, 최근 학습의 오답 다시 풀기 |
| 보관함 | 폴더 계층·꾸미기, 검색·정렬, 수정·삭제·다중 선택·숨김, 중복 표시, CSV·Excel 내보내기 |
| 앱 정보 | Google 로그인·로그아웃·지금 동기화·계정 삭제, 언어·테마·알림·튜토리얼, 문의와 관리자 화면 |

한국어·영어·일본어와 라이트·다크 테마를 지원합니다. 일일 목표는 완료한 학습 회차 기준이며 기본값은 5회입니다.

## 설치와 실행

Node.js와 npm을 준비하고 프로젝트 루트에서 실행합니다. 기본 개발 서버 스크립트는 Windows PowerShell을 사용합니다.

~~~powershell
npm ci
npm run start:go
~~~

start:go는 Expo Go를 명시적으로 선택합니다. **Expo Go SDK 54**로 QR을 열어 저장·학습·보관함 등 기본 흐름을 확인합니다. Google 로그인과 네이티브 설정 검증에는 development build를 사용합니다.

~~~powershell
npm run build:dev
npm run start
~~~

start와 start:lan은 development client + LAN 모드입니다. 다른 네트워크 경로가 필요하면 start:tunnel을 사용합니다. JS/UI 수정은 Fast Refresh로 확인하고 scheme·권한·네이티브 모듈 설정이 바뀌면 앱을 다시 빌드합니다.

## 파일 가져오기와 내보내기

- TXT·DOCX: 앞면 한 줄, 뒷면 한 줄을 한 카드로 읽으며 카드 사이에 빈 줄을 둡니다.
- 일반 CSV·Excel: 첫 시트의 첫 두 열을 앞면·뒷면으로 읽습니다.
- MEMORIA 내보내기: No·Folder·Front·Back 헤더로 앞면·뒷면 열을 찾아 열 순서가 바뀌어도 읽습니다.
- 가져온 카드는 선택한 폴더에 저장합니다. 내보내기의 폴더 구조·학습 통계·숨김 상태는 복원하지 않습니다.
- 파일 최대 5MB, 한 번에 최대 1,000장, 카드 한 면 최대 300자입니다.
- 스프레드시트는 처음 1,002행까지 읽습니다. 형식 오류·중복·읽기 상한은 미리보기와 결과 안내에서 확인합니다.

CSV·Excel 내보내기는 카드 내용을 보관하고 다시 가져오기 위한 자료입니다. 학습 상태까지 포함하는 전체 백업 기능은 별도로 구현하지 않았습니다.

## Google 로그인과 Supabase

로컬 학습은 Supabase 없이 사용할 수 있습니다. 계정 기능은 [.env.example](.env.example)을 참고해 .env의 Supabase URL·anon key와 플랫폼별 Google client ID를 설정합니다.

| 경로 | 처리와 callback |
| --- | --- |
| Google 직접 인증 | Google의 ID token 또는 authorization code 교환 결과로 Supabase signInWithIdToken을 호출합니다. Android callback은 Google client ID에서 만든 역순 scheme의 /oauthredirect 경로입니다. |
| Supabase OAuth fallback | 직접 인증 설정·요청이 준비되지 않았을 때 signInWithOAuth를 사용합니다. 앱 callback인 memoria://auth/callback을 Supabase Redirect URLs에 등록합니다. |

Android package는 com.youwon35.memoria입니다. Google Android OAuth client의 package·서명과 app.json의 scheme을 실제 빌드에 맞춥니다. Supabase OAuth용 Google Web client에는 Supabase 대시보드의 Google callback URL을 등록합니다. 상세한 기존 인증 설정은 [handoff.md](handoff.md)를 참고합니다.

## 데이터와 코드 구조

게스트 데이터는 AsyncStorage, 네이티브 인증 세션은 SecureStore에 저장됩니다. 로그인 후 앱 진입 또는 **지금 동기화** 버튼으로 계정 데이터를 병합합니다. 모든 기기의 변경을 실시간으로 구독하는 방식은 아닙니다.

로그아웃하면 계정 로컬 캐시를 비웁니다. Android 일반 백업은 비활성화되어 있습니다. 앱의 계정 삭제는 Memoria 인증 계정과 연결 데이터를 삭제하며 Google 계정 자체는 유지됩니다.

| 파일 | 역할 |
| --- | --- |
| App.js | 5개 탭, 상태·인증, 저장·동기화 연결, 알림과 관리자 흐름 |
| src/utils/memory.js | 카드·폴더별 학습 상태, 채점·출제, TXT 카드 블록 파싱 |
| src/utils/import-files.js | CSV·Excel·DOCX 읽기, 헤더 인식과 읽기 제한 |
| src/utils/card-export.js | 공통 카드 내보내기 열 구성 |
| src/utils/cloud-sync.js | 사용자별 전체 페이지 조회와 취소 검사 |
| src/lib/supabase.js | Supabase client와 인증 세션 저장 |
| src/i18n.js | 한국어·영어·일본어 문구 |
| supabase/ | 스키마, RLS·RPC, 마이그레이션 |
| tests/ | 학습 상태, 파일 왕복, 동기화와 앱 처리 흐름 회귀 검사 |

## 검증과 배포

~~~powershell
npm test
npm run typecheck
npx expo install --check
npx expo-doctor
~~~

npm test는 Node test runner로 회귀 검사를 실행합니다. typecheck는 현재 TypeScript 설정 검사이며 checkJs가 꺼져 있어 JavaScript 앱 전체의 타입 검증을 뜻하지 않습니다. 최근 결과와 한계는 [2026-09-06 리뷰 기록](docs/review-2026-09-06.md)에 있습니다.

새 Supabase 프로젝트는 [schema.sql](supabase/schema.sql)을 기준으로 구성하고, 기존 프로젝트는 적용 이력을 확인해 필요한 [마이그레이션](supabase/migrations)을 적용합니다. 특히 20260727_harden_account_and_data.sql은 실제 Memoria 계정 삭제와 데이터·문의 권한 제한에 필요합니다. 이전 인수인계에는 운영 DB 미적용으로 기록되어 있으며, 이번 코드 정리에서도 운영 DB 변경과 Google Play 배포는 수행하지 않았습니다.

실기기에서 인증·동기화·파일 선택·알림을 확인한 뒤 build:preview로 APK 또는 build:production으로 AAB를 만듭니다. EAS production의 원격 versionCode 자동 증가 결과가 Play Console의 현재 최고값보다 큰지 확인합니다.

개발 브랜치는 develop, 안정 릴리스 브랜치는 main입니다. 출시 절차는 [PLAY_STORE_RELEASE.md](PLAY_STORE_RELEASE.md), 정책은 [개인정보처리방침](docs/privacy-policy-ko.md)과 [데이터 삭제 안내](docs/data-deletion-ko.md)를 참고합니다.
