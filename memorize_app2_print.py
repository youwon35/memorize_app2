"""
2026-04-19 작업 요약

1. 현재 폴더가 Git 저장소인지 먼저 확인했다.
   - `git status`, `git remote -v`, `git branch --all` 확인 결과 `.git`이 없어서
     아직 GitHub와 연결되지 않은 새 상태임을 확인했다.

2. 현재 폴더 상태와 원격 저장소 존재 여부를 점검했다.
   - 로컬 폴더는 비어 있었다.
   - 기본 HTTPS Git 설정은 Windows 인증서 문제로 실패했지만,
     `http.sslBackend=openssl` 옵션으로 `youwon35/memorize_app2` 저장소의
     `main`, `develop` 브랜치가 실제로 존재함을 확인했다.

3. 로컬 폴더를 GitHub 저장소와 직접 연결했다.
   - 현재 폴더에서 `git clone https://github.com/youwon35/memorize_app2.git .`
     방식으로 저장소를 받아와 원격 `origin`이 연결되도록 만들었다.

4. 이후 작업 기준 브랜치를 `develop`으로 맞췄다.
   - 기본 체크아웃은 `main`이었기 때문에
     `git checkout -b develop origin/develop`으로 로컬 `develop` 브랜치를 만들고
     원격 `origin/develop`을 추적하게 설정했다.

5. `develop` 브랜치에서 최신 상태까지 pull 했다.
   - `git pull --ff-only origin develop` 결과 `Already up to date.` 상태를 확인했다.

현재 결과
- 로컬 폴더: `D:/github/APP/memorize_app2`
- 원격 저장소: `https://github.com/youwon35/memorize_app2.git`
- 현재 브랜치: `develop`
- 추적 브랜치: `origin/develop`
- 앞으로 이 폴더에서 `develop` 기준으로 pull / commit / push 진행 가능


2026-04-19 Expo Go 실행 준비 요약

1. 현재 Expo 설정과 의존성 상태를 확인했다.
   - `package.json`, `app.json`, `App.js`를 읽어보니 프로젝트는 이미 Expo SDK 54 기반으로
     구성되어 있었고, 앱 이름은 `Memora`, 스킴은 `memora`로 설정되어 있었다.
   - 다만 `node_modules`가 없어서 즉시 실행은 불가능한 상태였다.

2. 앱 실행에 필요한 패키지를 설치했다.
   - 프로젝트 경로에서 `npm install --no-fund --no-audit`를 실행해 의존성을 설치했다.

3. Expo 진단으로 실제 실행 호환성을 확인했다.
   - `expo-doctor` 결과 대부분 정상이었지만
     `babel-preset-expo`가 SDK 54가 아니라 `55.0.15`로 잡혀 있었다.
   - Expo Go SDK 54와 맞추기 위해 `package.json`의 `babel-preset-expo`를
     `~54.0.10`으로 수정하고 다시 설치했다.
   - 수정 후 `expo-doctor` 재실행 결과 `17/17 checks passed`로 모두 통과했다.

4. Expo 개발 서버를 실제로 실행해 접근 가능 여부를 확인했다.
   - 처음 `8084` 포트로 실행했지만 이미 다른 프로세스가 사용 중이라 건너뛰어졌다.
   - 이후 `8085`, `8086` 포트로 Metro Bundler를 실행했고,
     둘 다 HTTP 응답이 정상적으로 돌아오는 것을 확인했다.

5. Expo Go에서 열 수 있는 실제 LAN 주소를 확인했다.
   - 서버 메타데이터를 조회한 결과 `sdkVersion: 54.0.0`과
     `hostUri: 192.168.45.167:8086`이 확인되었다.
   - 따라서 같은 와이파이에 연결된 휴대폰의 Expo Go에서
     `exp://192.168.45.167:8086` 형태로 접근 가능한 상태까지 준비되었다.

6. 작업 흔적이 Git에 섞이지 않도록 정리했다.
   - `.gitignore`에 `.npm-cache/`, `expo-start.log`, `expo-start.err`,
     `expo-lan.log`, `expo-lan.err`를 추가해서 캐시와 실행 로그가
     추적되지 않도록 했다.

현재 실행 확인 결과
- Expo SDK 진단: 통과
- Metro Bundler 실행 포트: `8086` (LAN 확인 완료)
- 로컬 IP: `192.168.45.167`
- Expo Go 접속 주소: `exp://192.168.45.167:8086`
- 참고: `.env`가 없어도 앱은 로컬 저장 모드로 실행되며,
  Google/Supabase 동기화 기능만 비활성화된 상태다.


2026-04-19 MEMORIA 리디자인 및 스플래시/로그인 정리 요약

1. 디자인 방향을 전체적으로 다시 잡았다.
   - 기존의 밝은 베이지 카드형 화면 대신,
     첫 번째 레퍼런스 이미지처럼 차분한 나이트 무드 기반으로 재구성했다.
   - 강한 그라디에이션은 제거하고,
     어두운 네이비 배경 + 보랏빛 포인트 + 별/달 장식 정도만 남겨서
     분위기는 살리고 과한 장식은 줄였다.

2. 메인 저장 화면 구조를 다시 설계했다.
   - 상단의 큰 슬로건 문장과 `MEMORA` 텍스트는 제거했다.
   - `A와 B를 한 쌍으로 저장` 같은 설명 카드와 `+` 버튼 중심 구조도 없앴다.
   - 대신 중앙에 카드 1장을 바로 입력하는 저장 패널을 두고,
     `앞면 / 뒷면` 입력 후 바로 저장하도록 단순화했다.
   - 저장 후 최근 카드가 아래에 바로 보이도록 해서,
     화면의 빈 공간이 커 보이지 않게 밀도를 다시 맞췄다.

3. 앱 전체 브랜딩을 `MEMORIA`로 바꿨다.
   - 앱 설정의 이름을 `MEMORIA`로 변경했다.
   - 슬러그를 `memoria`, 스킴을 `memoria`로 변경했다.
   - Android 패키지와 iOS 번들 ID도 `com.memoria.app` 기준으로 맞췄다.

4. 시작 화면(런치 느낌)을 추가했다.
   - 앱 실행 직후, 검은/남색 배경 위에 `MEMORIA`가 중앙에 뜨는
     런치 오버레이 화면을 구현했다.
   - 달 모양과 작은 별이 있는 간단한 애니메이션을 넣어,
     Netflix/Disney+처럼 앱 진입 순간에 브랜드가 보이게 했다.
   - 동시에 실제 스플래시 설정에도 어두운 배경과
     `assets/memoria-splash.png` 이미지를 연결했다.

5. 스플래시 에셋도 프로젝트 안에서 새로 만들었다.
   - `assets/memoria-splash.png` 파일을 생성해
     앱 시작 시 사용할 로고 이미지를 준비했다.

6. 퀴즈/보관함/정보 탭도 새 톤에 맞게 정리했다.
   - 퀴즈 탭은 집중형 문제 카드처럼 보이도록 재배치했다.
   - 보관함은 수정/삭제 흐름을 유지하되 어두운 톤 카드로 정리했다.
   - 정보 탭에는 양방향 암기, Google 로그인, APK용 리디렉션 URI 정보를 넣었다.

7. Google 로그인 흐름은 실제 APK 테스트를 고려해 유지/정리했다.
   - 코드 안의 Supabase Google OAuth 흐름은 그대로 살렸다.
   - `.env.example`의 앱 스킴도 `memoria`로 변경했다.
   - 앱 정보와 README에 APK 테스트 시 필요한 리디렉션 URI
     `memoria://auth/callback`를 분명히 남겼다.
   - 즉, 지금은 Supabase 환경변수만 넣으면 Google 로그인 자체를 테스트할 수 있고,
     APK에서는 Supabase/Google 설정에 동일한 리디렉션 URI를 추가해야 한다.

8. 검증도 같이 진행했다.
   - `expo-doctor` 결과 `17/17 checks passed`.
   - `expo export --platform android`도 성공해서 번들링 가능한 상태를 확인했다.
   - 이후 LAN 모드 개발 서버를 다시 실행했고,
     `http://192.168.45.167:8087` 응답과 manifest를 확인했다.

현재 기준 실행 확인 결과
- 앱 이름: `MEMORIA`
- Expo Go 실행 주소: `exp://192.168.45.167:8087`
- 스플래시 이미지: `assets/memoria-splash.png`
- 릴리스 리디렉션 URI: `memoria://auth/callback`
- 참고: `.env`가 아직 없기 때문에 현재는 로컬 저장 모드이며,
  Supabase URL / Anon Key를 넣어야 Google 로그인이 실제로 활성화된다.


2026-04-20 GitHub 재연결 점검 요약

1. 현재 로컬 폴더 상태를 먼저 확인했다.
   - 작업 경로는 `D:/github/APP/memorize_app2`였다.
   - 이 폴더는 비어 있었고 `.git`도 없어서,
     GitHub 저장소와 다시 연결해야 하는 상태였다.

2. 연결 대상 원격 저장소를 확인했다.
   - `https://github.com/youwon35/memorize_app2.git`에 대해
     원격 조회를 실행해 `main`, `develop` 브랜치가 실제로 존재함을 확인했다.
   - 따라서 현재 폴더는 같은 이름의 GitHub 프로젝트
     `youwon35/memorize_app2`에 연결하는 것으로 진행했다.

3. 현재 폴더를 Git 저장소로 초기화하고 원격을 연결했다.
   - `git init -b main`으로 저장소를 만들었다.
   - `origin`을 `https://github.com/youwon35/memorize_app2.git`로 추가했다.
   - 이어서 `git fetch origin`으로 원격 데이터를 받아왔다.

4. 개발 기준 브랜치를 `develop`으로 맞췄다.
   - 처음 체크아웃 시 Git이 `dubious ownership` 오류를 내서
     `safe.directory D:/github/APP/memorize_app2`를 전역 설정에 추가했다.
   - 그 다음 `git checkout -b develop --track origin/develop`로
     로컬 `develop` 브랜치를 만들고 원격 `origin/develop`을 추적하도록 설정했다.

5. 동기화와 연결 상태를 최종 확인했다.
   - `git pull origin develop` 결과는 `Already up to date.`였다.
   - 최종 상태는 현재 브랜치 `develop`,
     원격 `origin = https://github.com/youwon35/memorize_app2.git`,
     추적 브랜치 `origin/develop`이다.
   - 즉, 이제 이 폴더에서 그대로 `pull`, `commit`, `push`를 진행할 수 있다.

2026-04-20 실제 APK / Google 로그인 점검 요약

1. 실제 APK 설치 경로를 확인하기 위해 현재 빌드 설정과 환경 상태를 점검했다.
   - `eas.json`을 확인해보니 `preview` 프로필은 `distribution: internal`만 있었고,
     Android에서 APK를 명시적으로 만들도록 `android.buildType: "apk"`를 추가해 두었다.

2. 현재 Google 연동이 왜 아직 실제로 동작하지 않는지도 확인했다.
   - 프로젝트 루트에 `.env` 파일이 없어서 Supabase URL / Anon Key가 비어 있다.
   - 즉, 지금 빌드하면 앱은 실행되더라도 Google 로그인 버튼은
     실제 연동 테스트를 끝까지 할 수 없는 상태다.

3. EAS 빌드를 바로 걸 수 있는지도 확인했다.
   - `npx eas-cli --version`으로 EAS CLI는 실행 가능한 상태임을 확인했다.
   - 하지만 `npx eas-cli whoami` 결과는 `Not logged in`이었다.
   - 따라서 지금 이 환경에서는 Expo 계정 로그인 전이라
     바로 클라우드 APK 빌드를 시작할 수는 없다.

4. 이후 바로 이어갈 수 있도록 문서도 보강했다.
   - `README.md`에
     `eas build --platform android --profile preview`로 APK를 만드는 단계,
     그리고 `memoria://auth/callback`를 포함한 Google 로그인 체크리스트를 추가했다.

현재 기준 남은 실제 조건
- Expo 계정 로그인 필요: `eas login`
- 로컬 `.env` 생성 필요: Supabase URL / Anon Key 입력
- Supabase Auth에서 Google provider 활성화 필요
- Supabase / Google 설정에 `memoria://auth/callback` 추가 필요

이 네 가지가 준비되면
`eas build --platform android --profile preview`로
실제 휴대폰 설치용 APK를 만들 수 있다.


2026-04-20 실제 APK / Google 로그인 빌드 마무리 요약

1. 사용자가 준비를 마쳤는지부터 다시 확인했다.
   - 프로젝트 루트의 `.env` 값을 확인해
     `EXPO_PUBLIC_SUPABASE_URL`,
     `EXPO_PUBLIC_SUPABASE_ANON_KEY`,
     `EXPO_PUBLIC_APP_SCHEME=memoria`
     가 실제로 들어가 있는 상태임을 확인했다.
   - `npx eas-cli whoami`도 다시 실행해
     Expo 계정이 `zinnn`으로 로그인된 상태임을 확인했다.

2. EAS 프로젝트 연결도 실제로 마무리했다.
   - `npx eas-cli init --force --non-interactive`를 실행해
     이 앱을 Expo의 EAS 프로젝트 `@zinnn/memoria`에 연결했다.
   - 이 과정에서 `app.json`에 EAS `projectId`와 `owner`가 추가되었다.

3. 원격 APK 빌드에서 `.env`가 빠질 수 있는 문제를 먼저 확인했다.
   - 첫 번째 `eas build` 로그를 보니
     `preview` 환경에 등록된 EAS 환경변수가 없다는 메시지가 나왔다.
   - 즉 로컬 `.env`가 있더라도, 원격 클라우드 빌드에는
     Supabase URL / 키 / 앱 스킴이 자동으로 실리지 않을 가능성이 있었다.

4. 그래서 EAS 프로젝트 환경변수를 직접 등록했다.
   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
   - `EXPO_PUBLIC_APP_SCHEME`
   이 세 값을 모두 `preview` 환경에 생성했다.
   - 이렇게 해야 원격 APK 빌드 안에도 Supabase/Google 로그인 설정이 실제로 포함된다.

5. 그 다음 실제 휴대폰 설치용 APK를 다시 빌드했다.
   - `npx eas-cli build --platform android --profile preview --non-interactive`
     를 다시 실행했다.
   - 이번 빌드 로그에서는
     `Resolved "preview" environment for the build`와 함께
     `EXPO_PUBLIC_APP_SCHEME`,
     `EXPO_PUBLIC_SUPABASE_ANON_KEY`,
     `EXPO_PUBLIC_SUPABASE_URL`
     가 실제로 로드되었다는 메시지를 확인했다.
   - 즉 이번 APK는 Google 로그인에 필요한 환경값이 포함된 상태로 빌드되었다.

6. 최종 결과로 설치 링크를 확보했다.
   - 최신 성공 빌드:
     `https://expo.dev/accounts/zinnn/projects/memoria/builds/2dfe0251-8f2a-47ae-95f9-3a293fea88c4`
   - 이 링크를 휴대폰에서 열면 APK를 설치할 수 있다.

현재 기준 결과
- Expo/EAS 계정: `zinnn`
- EAS 프로젝트: `@zinnn/memoria`
- Android 테스트 빌드 방식: `preview` + `apk`
- 최신 APK 빌드: 성공
- 설치 링크:
  `https://expo.dev/accounts/zinnn/projects/memoria/builds/2dfe0251-8f2a-47ae-95f9-3a293fea88c4`

남아 있는 실제 확인 단계
- 휴대폰에 APK 설치
- 앱에서 `Google 로그인` 버튼 실행
- 브라우저 로그인 후 `memoria://auth/callback`으로 복귀되는지 확인
- 로그인 후 카드 저장/동기화가 실제로 되는지 확인


2026-04-20 저장 화면/하단 탭/암기 설정 보정 요약

1. 저장 화면 상단의 작은 통계 카드 영역을 정리했다.
   - 사용자 피드백 기준으로 상단의 `저장된 카드`, `출제 방향` 타일 두 개는
     화면을 차지하는 비중이 큰데 정보 가치가 낮다고 판단했다.
   - 그래서 저장 탭에서는 이 블록을 제거하고,
     바로 아래의 입력 패널이 더 먼저 보이도록 흐름을 단순화했다.

2. 하단 탭이 시스템 네비게이션 바에 가리는 문제를 보정했다.
   - Android 스크린샷을 보면 `저장`, `암기`, `보관함`, `정보` 라벨이
     하단 시스템 바와 겹쳐 읽기 어려운 상태였다.
   - 이를 해결하기 위해 탭 바의 하단 여백과 내부 패딩을 늘리고,
     탭 높이와 라벨 크기/색 대비도 함께 조정했다.
   - 또한 스크롤 콘텐츠의 하단 패딩도 더 크게 잡아,
     마지막 카드 영역이 탭 바 뒤에 숨어 보이지 않도록 했다.

3. 암기 탭에서 출제 문제 수를 직접 정할 수 있게 만들었다.
   - 이전에는 저장된 전체 카드(양방향 포함)가 항상 전부 문제로 들어갔다.
   - 이제는 암기 탭 안에 `이번 라운드 문제 수` 입력 박스를 두고,
     사용자가 원하는 문제 수를 직접 정할 수 있게 했다.
   - 카드가 있을 때만 입력 가능하며,
     최대값은 현재 저장된 카드 수를 양방향으로 펼친 문제 수 기준으로 자동 제한된다.

4. 빠르게 선택할 수 있는 프리셋도 추가했다.
   - 숫자를 직접 치지 않아도 되도록 `5문제`, `10문제`, `전체` 형태의
     프리셋 칩을 함께 두었다.
   - 현재 가능한 최대 문제 수에 따라 자동으로 값이 맞춰지도록 처리했다.

5. 랜덤 출제 흐름도 문제 수 설정과 함께 연결했다.
   - 덱 생성 유틸 `buildPracticeDeck`을 확장해,
     먼저 전체 문제를 랜덤으로 섞은 뒤 원하는 개수만 잘라 쓰도록 바꿨다.
   - 즉 사용자가 예를 들어 7문제를 선택하면,
     앞면/뒷면이 섞인 전체 문제 집합을 셔플한 뒤 그중 7개만 출제된다.
   - 라운드를 다시 시작하거나 마지막 문제 이후 새 라운드로 넘어갈 때도
     같은 방식으로 다시 랜덤 셔플된다.

6. 검증도 같이 진행했다.
   - `npx expo-doctor` 결과는 `17/17 checks passed`.
   - `npx expo export --platform android`도 성공해서
     수정 후에도 Android 번들링이 정상 동작함을 확인했다.


2026-04-20 오답 다시풀기 / 텍스트 파일 일괄 저장 기능 추가 요약

1. 먼저 사용자 예시 파일 형식을 확인했다.
   - `예시.txt`에는 아래처럼 한 줄에 한 쌍씩 적혀 있었다.
     `sun 해`
     `moon 달`
     `sky 하늘`
   - 따라서 이 형식처럼 여러 줄이 들어 있는 텍스트 파일을 읽어
     자동으로 여러 카드를 한 번에 생성하는 기능을 넣는 방향으로 진행했다.

2. 파일 불러오기 기능을 위해 Expo 패키지를 추가했다.
   - `expo-document-picker`
   - `expo-file-system`
   를 설치했다.
   - 문서 선택기에서 텍스트 파일을 고르고,
     고른 파일 내용을 바로 읽어 카드 쌍으로 파싱할 수 있도록 준비했다.

3. 저장 로직을 한 장 저장 / 여러 장 저장이 같이 쓰는 구조로 정리했다.
   - 기존에는 `saveCard`가 한 쌍 저장만 직접 처리하고 있었다.
   - 이번에는 여러 줄 파일 입력까지 지원해야 해서,
     공통으로 사용하는 `saveEntryBatch` 흐름을 만들었다.
   - 이 로직은
     중복 카드 건너뛰기,
     로컬 저장,
     로그인된 경우 Supabase 일괄 저장
     까지를 함께 처리한다.

4. 텍스트 파일 파서도 추가했다.
   - `src/utils/memory.js`에 파일 내용을 줄 단위로 읽어 카드 쌍으로 바꾸는
     `parseImportedPairs`를 만들었다.
   - 가장 안전한 형식은 `앞면[TAB]뒷면`이지만,
     현재 예시처럼 공백 한 칸으로 구분한
     `sun 해` 같은 형식도 읽도록 지원했다.
   - 추가로 `|`, `::`, `→` 구분 형식도 읽을 수 있게 해 두었다.
   - 형식이 맞지 않는 줄은 따로 세서 제외하도록 만들었다.

5. 저장 탭 UI에 텍스트 파일 불러오기 블록을 추가했다.
   - 기존 수동 입력/저장 버튼 아래에
     `텍스트 파일로 여러 장 한꺼번에 추가` 영역을 넣었다.
   - 사용자가 파일을 선택하면
     텍스트 내용을 읽고,
     유효한 줄은 카드로 만들고,
     이미 있는 카드나 파일 안 중복은 건너뛰며,
     마지막에는 몇 개를 만들었는지 안내창으로 보여주도록 했다.

6. 오답만 다시풀기 기능도 암기 흐름에 맞춰 구현했다.
   - 퀴즈 중 오답을 제출하면 현재 문제의 ID를 오답 목록에 기록하도록 바꿨다.
   - 이전에는 마지막 문제 뒤에서 자동으로 새 랜덤 덱이 바로 다시 시작됐는데,
     이제는 라운드가 끝나면 `라운드 완료` 요약 카드가 먼저 보이도록 바꿨다.
   - 이 완료 카드에는
     전체 문제 수,
     맞힌 문제 수,
     다시 풀 문제 수
     가 표시된다.
   - 그리고 여기서
     `다시 랜덤 시작`
     `오답만 다시풀기`
     두 버튼을 제공하도록 했다.

7. 오답 라운드는 현재 라운드의 틀린 문제만 다시 랜덤 셔플해서 시작되도록 했다.
   - 즉 전체 카드로 다시 돌아가는 것이 아니라,
     그 라운드에서 틀렸던 문제들만 모아 새로운 덱을 만든다.
   - 틀린 문제가 없으면 `오답만 다시풀기` 버튼은 비활성화된다.

8. 검증도 같이 진행했다.
   - `npx expo-doctor` 결과는 `17/17 checks passed`.
   - `npx expo export --platform android`도 성공했다.
   - 즉 Expo SDK 54 기준에서
     문서 선택기 추가,
     텍스트 파일 파싱,
     오답 라운드 UI
     까지 포함해도 Android 번들링은 정상 동작한다.


2026-04-23 dev build localhost 접속 오류 해결 요약

1. 먼저 현재 증상을 실제로 분리해서 확인했다.
   - 사용자는 같은 와이파이에서 dev build QR을 스캔했는데
     `failed to connect to localhost`가 뜬다고 했다.
   - 이 경우 보통 휴대폰이 PC의 Metro 주소가 아니라
     자기 자신(`localhost`)을 보려고 해서 생긴다.

2. 실제 Expo 서버가 무엇을 광고하고 있는지 확인했다.
   - 현재 떠 있던 Expo 프로세스는 겉으로는 `--host lan`으로 실행되어 있었지만,
     실제 manifest 내용을 조회해 보니
     `hostUri`, `debuggerHost`, bundle URL이 모두 `127.0.0.1:8081`로 잡혀 있었다.
   - 즉 문제는 단순히 같은 와이파이 여부가 아니라,
     Expo가 dev build에 넘기는 접속 주소 자체가 `localhost`였다는 점이었다.

3. 고정 LAN 주소를 강제로 주입하는 실행 방식을 만들었다.
   - `scripts/start-dev-build.ps1`를 새로 만들었다.
   - 이 스크립트는 현재 활성화된 네트워크의 IPv4 주소를 자동으로 찾고,
     `REACT_NATIVE_PACKAGER_HOSTNAME`
     `EXPO_PACKAGER_PROXY_URL`
     를 현재 IP와 포트로 강제로 설정한 뒤
     Expo dev client 서버를 실행한다.
   - 즉 단순 `expo start --dev-client --host lan`보다
     한 단계 더 강하게 현재 PC IP를 manifest에 박아 넣는 방식이다.

4. npm 실행 스크립트도 같이 정리했다.
   - `npm start`
   - `npm run start:lan`
   는 새 PowerShell 스크립트를 타도록 변경했다.
   - `npm run start:tunnel`은 같은 스크립트의 tunnel 모드를 타도록 변경했다.
   - 따라서 앞으로는 같은 와이파이에서 dev build를 실행할 때
     `npm start`만 써도 LAN IP 기준으로 뜨도록 맞췄다.

5. 실제 서버를 다시 띄워서 결과를 검증했다.
   - 기존에 잘못 떠 있던 8081/8082 Expo 프로세스를 정리했다.
   - 그 다음 새 스크립트로 8081 서버를 다시 실행했다.
   - manifest를 직접 조회한 결과,
     이번에는
     `hostUri: 172.30.1.57:8081`
     `debuggerHost: 172.30.1.57:8081`
     번들 URL도 `http://172.30.1.57:8081/...`
     로 바뀐 것을 확인했다.
   - 또한 `http://172.30.1.57:8081` 접근도 HTTP 200으로 확인했다.

6. 임시 로그도 Git에 남지 않도록 정리했다.
   - `expo-devclient-*.log`
   - `expo-devclient-*.err`
   패턴을 `.gitignore`에 추가했다.

현재 기준 사용 방법
- 같은 와이파이에서 dev build 실행:
  `npm start`
- 또는 명시적으로 LAN:
  `npm run start:lan`
- 현재 확인된 접속 주소:
  `172.30.1.57:8081`

즉, 이제 새로 뜬 QR을 다시 스캔하면
이전처럼 `localhost`가 아니라
현재 PC의 LAN 주소를 보게 되어 휴대폰 dev build에서 정상 연결되어야 한다.


2026-04-23 dev build 재설치 기준 및 앱 아이콘 설정 요약

1. 먼저 사용자의 질문을 기준으로 dev build 재설치가 언제 필요한지 정리했다.
   - 다른 컴퓨터를 쓴다고 해서 dev build를 매번 새로 설치해야 하는 것은 아니다.
   - 이미 설치된 dev build는 같은 앱 패키지 기준으로
     다른 PC에서 띄운 Metro 서버에도 연결할 수 있다.
   - 다만 아이콘, 앱 스킴, 네이티브 플러그인, 네이티브 라이브러리처럼
     빌드 시점에 앱 안으로 들어가는 설정이 바뀌면
     그때는 새 dev build를 다시 설치해야 한다.

2. 이번 변경이 바로 재설치가 필요한 종류인지도 같이 판단했다.
   - 사용자가 올린 `app-icon.png`를 앱 아이콘으로 쓰도록 연결하는 작업은
     네이티브 빌드 산출물에 반영되는 설정이다.
   - 따라서 이번 아이콘 변경은
     기존에 설치된 dev build 앱에는 자동으로 보이지 않고,
     새로 dev build를 만들어 다시 설치해야 반영된다.

3. 아이콘 원본 파일 상태를 먼저 점검했다.
   - 프로젝트 루트에 `app-icon.png`가 올라와 있는 것을 확인했다.
   - 파일은 실제로 존재했고,
     Expo 아이콘 자산으로 쓰기에 충분한 정사각형 해상도였다.

4. Expo 설정에 실제 아이콘 경로를 연결했다.
   - `app.json`의 최상위 `icon`에 `./app-icon.png`를 추가했다.
   - Android 쪽은 `adaptiveIcon.foregroundImage`에도 같은 파일을 연결했다.
   - 배경색은 기존 앱 톤과 맞춰 `#050814`를 유지했다.

5. dev build 경고 원인도 같이 정리했다.
   - 이전에 보였던
     `Unable to determine the default URI scheme for deep linking into the app`
     경고를 안정적으로 없애기 위해
     `expo-dev-client` config plugin도 `app.json`에 명시했다.
   - 그런데 확인해 보니 `package.json`에는 `expo-dev-client`가 적혀 있었지만,
     실제 `node_modules`에는 빠져 있어서 Expo가 플러그인을 못 읽는 상태였다.

6. 누락된 의존성도 바로 보정했다.
   - 처음에는 기본 npm 캐시 경로 권한 문제와 네트워크 오류가 겹쳐 설치가 막혔다.
   - 그래서 작업 폴더 안의 로컬 캐시를 쓰도록 방향을 바꿔
     `npm install --cache .npm-cache`
     방식으로 다시 설치했다.
   - 그 결과 `expo-dev-client`를 포함한 누락 패키지가 정상 반영되었다.

7. 설정이 실제로 Expo에서 읽히는지 검증했다.
   - `npx expo config --json` 결과에서
     `icon: ./app-icon.png`
     `android.adaptiveIcon.foregroundImage: ./app-icon.png`
     `expo-dev-client` plugin이 모두 잡히는 것을 확인했다.
   - 이어서 `npx expo export --platform android`도 성공했다.
   - 즉 현재 설정은 Expo SDK 54 기준에서
     아이콘 경로와 dev client plugin 모두 정상 해석되는 상태다.

8. 사용자가 기억하면 좋은 실제 기준도 같이 정리했다.
   - 컴퓨터만 바뀐 경우:
     새 dev build 설치가 항상 필요한 것은 아니다.
   - 앱 아이콘, 스킴, 플러그인, 네이티브 패키지가 바뀐 경우:
     새 dev build를 다시 빌드하고 다시 설치해야 한다.
   - 이번 변경은 여기에 해당하므로,
     아이콘이 보이는 새 dev build를 한 번 더 설치하는 것이 맞다.


2026-04-23 저장 화면 문구, 문의하기, 퀴즈 오답 처리 정리

1. 저장 탭 상단 문구를 더 짧고 바로 이해되도록 바꿨다.
   - 기존 `카드를 하나씩 차분하게 쌓아 두세요.` 문구를
     `암기하고 싶은 쌍을 저장하세요!`로 교체했다.
   - 두 줄로 크게 끊겨 보이던 문제는
     글자 크기와 줄 높이를 조금 줄이고,
     한 줄 안에서 자연스럽게 맞도록 조정했다.

2. 텍스트 파일 일괄 추가 영역은
   장문 설명 대신 예시 미리보기 방식으로 다시 구성했다.
   - 기존에는 파일 형식을 긴 문장으로 설명하고
     예시 텍스트를 아래에 직접 적어 두는 구조였다.
   - 이번에는 `cards-example.txt` 형태의 미리보기 카드를 만들어
     `sun / 해`, 빈 줄, `moon / 달`처럼
     실제 파일 안이 어떻게 생기면 되는지 바로 보이도록 바꿨다.
   - 즉 설명보다 예시 화면을 먼저 보게 해서
     사용자가 형식을 더 직관적으로 이해할 수 있게 했다.

3. 문의하기 버튼도 메일 앱 의존도를 낮췄다.
   - 기존에는 `mailto:`를 열 수 없는 환경이면
     `메일 앱 필요` 경고만 띄우고 끝나는 구조였다.
   - 이제 메일 앱이 있으면 그대로 메일 작성창을 열고,
     메일 앱이 없으면 Gmail 웹 작성 화면을 브라우저로 열도록 바꿨다.
   - 따라서 휴대폰에 기본 메일 앱이 없더라도
     문의 메일을 작성할 수 있는 진입점이 사라지지 않는다.

4. 암기 탭의 오답 처리 흐름도 더 직접적으로 수정했다.
   - 정답을 틀리면 기존처럼 머무르면서 `다시 한 번 생각해 보세요`를 띄우는 대신,
     이제 `틀렸습니다`를 짧게 보여준 뒤 자동으로 다음 문제로 넘어가게 했다.
   - 사용자가 아무것도 입력하지 않고 `제출`을 누른 경우에는
     모달 경고 대신 카드 안에서
     `무언가를 입력해 주세요.`라는 안내가 바로 보이도록 바꿨다.

5. `다음 카드로 넘어가기` 버튼의 통계 반영도 고쳤다.
   - 이전에는 답을 입력하지 않고 그냥 넘긴 카드가
     오답 목록에 들어가지 않아
     라운드 완료 시 사실상 맞힌 문제처럼 계산될 수 있었다.
   - 이제는 사용자가 제출 없이 건너뛴 카드도
     오답으로 기록되고,
     마지막 문제에서 바로 넘긴 경우에도
     라운드 요약과 `오답만 다시풀기` 대상에 정확히 반영된다.

6. 마지막으로 번들 검증도 다시 진행했다.
   - `npx expo export --platform android` 결과는 성공이었다.
   - 즉 이번 저장 탭 문구 수정,
     예시 미리보기 카드,
     문의 버튼 fallback,
     퀴즈 오답/건너뛰기 처리 변경까지 포함해도
     Expo SDK 54 기준 Android 번들링은 정상 상태다.


2026-04-23 저장 화면 정리, 기본 화이트 모드, 인앱 문의, 암기 초기화 정리

1. 저장 탭에서는 하단 `최근 저장 카드` 섹션을 완전히 제거했다.
   - 사용자가 중앙 입력 패널과 파일 불러오기만 바로 보길 원했기 때문에,
     저장 화면 아래를 차지하던 최근 카드 미리보기 블록을 없앴다.
   - 이제 저장 탭은 입력과 불러오기 흐름에 더 집중된 구조가 된다.

2. 화면 모드 기본값과 버튼 순서도 바꿨다.
   - 앱 기본 모드를 `dark`에서 `light`로 변경했다.
   - 저장된 값이 없는 첫 실행에서는 이제 화이트 모드로 열린다.
   - `앱 정보` 탭의 모드 전환 버튼도 요청대로
     `라이트`, `다크` 순서가 먼저 보이도록 바꿨다.

3. 문의하기는 메일 앱 버튼 대신
   앱 안에서 바로 작성하고 확인하는 구조로 변경했다.
   - 기존에는 `문의 메일 보내기` 버튼 하나만 있었고,
     메일 앱이나 브라우저 쪽으로 보내는 방식이었다.
   - 이번에는 `답변 받을 이메일`, `문의 내용`, `전송` 버튼이 있는
     인앱 폼으로 바꿨다.
   - 전송 후에는 같은 화면 아래 `최근 문의` 목록에
     방금 보낸 문의가 바로 쌓이도록 만들었다.
   - 즉 사용자는 메일 앱 없이도 앱 안에서
     “보냈다 / 어떤 내용을 보냈다”를 직접 확인할 수 있다.

4. 문의 저장은 로컬과 클라우드 둘 다 고려했다.
   - 앱에서는 우선 문의를 로컬에 저장해 최근 문의 목록에 바로 보여준다.
   - Supabase와 로그인 세션이 준비되어 있고
     `support_inquiries` 테이블이 있으면
     같은 문의를 클라우드에도 저장하도록 연결했다.
   - 그래서 사용자는 앱 안에서 확인할 수 있고,
     개발자는 Supabase 대시보드에서도 확인할 수 있는 구조다.

5. 이 클라우드 저장을 위해 `supabase/schema.sql`도 확장했다.
   - 새 `public.support_inquiries` 테이블을 추가했다.
   - 컬럼은 `user_id`, `sender_email`, `reply_email`, `message`, `status`,
     `created_at`, `updated_at`로 잡았다.
   - RLS는 사용자가 자기 문의만 조회/등록할 수 있도록 맞췄다.

6. 암기 탭의 우측 상단 버튼도 의미를 바꿨다.
   - 기존에는 덱이 있는 상태에서 `다시 시작`을 누르면
     새 문제를 다시 섞어 시작하는 역할이었다.
   - 이제는 덱이 있거나 라운드 완료 화면일 때
     버튼 문구를 `초기화`로 바꾸고,
     누르면 5번째 스크린샷처럼
     시작 전 준비 화면으로 돌아가도록 바꿨다.

7. 초기화는 단순 화면 이동이 아니라
   “이번 라운드 전체를 없던 것으로 되돌리는” 방식으로 구현했다.
   - 라운드를 시작할 때의 학습 통계를 스냅샷으로 저장해 두고,
     `초기화`를 누르면 그 시점으로 복구한다.
   - 따라서 문제를 일부 풀었거나,
     심지어 라운드 완료 화면까지 갔더라도
     `초기화`를 누르면 그 라운드의 시도/정답/오답/세션 기록이 남지 않는다.
   - 사용자가 말한 “그때까지 푼 것을 기록에 저장하지 않을 것”이라는 흐름에 맞춘 것이다.

8. 마지막으로 다시 번들 검증을 진행했다.
   - `npx expo export --platform android`는 이번에도 성공했다.
   - 즉 최근 저장 카드 제거,
     기본 화이트 모드,
     인앱 문의 폼,
     Supabase 문의 스키마,
     암기 초기화 복구 로직까지 포함해도
     Expo SDK 54 기준 Android 번들링은 정상 상태다.


2026년 4월 23일 문의 카테고리, 문제 수 반영, 암기 준비 화면 위치를 다시 정리했다.

1. 문의하기에 카테고리 선택을 추가했다.
   - `오류제보`, `기능제안`, `기타` 세 가지 칩을 만들었다.
   - 사용자가 선택한 카테고리는 최근 문의 목록에도 같이 보이게 했다.
   - Supabase로 저장할 때도 `support_inquiries.category`에 함께 들어가도록 연결했다.

2. 암기 준비 화면의 메인 시작 버튼 문구를 더 짧게 정리했다.
   - 기존 `맞춤 암기 시작`을 `암기 시작`으로 바꿨다.
   - 요약 완료 화면의 다시 시작 버튼도 같은 흐름에 맞춰 `다시 암기 시작`으로 맞췄다.

3. 문제 수 입력 카드 위치를 요청한 자리로 옮겼다.
   - 헤더 바로 아래 따로 떠 있던 문제 수 카드를 제거했다.
   - 이제 준비 카드 안에서 `출제 방향` 카드 바로 위에서 문제 수를 바꿀 수 있다.
   - 즉 사용자가 암기를 시작하기 직전에 문제 수와 방향을 한 영역에서 같이 결정하는 구조다.

4. 문제 수를 바꿔도 항상 최대 문제 수로 나가던 버그의 원인을 잡았다.
   - 버튼이 `onPress={startQuiz}` 형태라 React Native의 press event 객체가
     문제 수 인자로 들어가고 있었다.
   - 그 결과 `buildPracticeDeck()`에는 정상 숫자가 아닌 값이 들어가
     사용자가 5문제를 적어도 전체 문제가 출제될 수 있었다.
   - 이번에는 `startQuiz()`가 현재 입력값을 직접 안전하게 해석하게 바꾸고,
     시작 버튼들도 `onPress={() => startQuiz()}`로 감싸
     입력한 개수가 실제 출제 수에 정확히 반영되도록 고쳤다.

5. 텍스트 파일 예시 미리보기 폭도 넓혔다.
   - 기존에는 왼쪽 아이콘 칼럼이 예시 카드 옆에 빈 띠처럼 남아
     미리보기 영역이 답답하게 보였다.
   - 제목 줄과 예시 카드를 세로 배치로 다시 정리해서
     `cards-example.txt` 미리보기 카드가 패널 전체 폭을 쓰도록 바꿨다.

6. 마지막으로 스키마와 번들 검증도 함께 정리했다.
   - `supabase/schema.sql`에는 `support_inquiries.category` 컬럼을
     새 생성과 기존 테이블 모두 안전하게 반영되도록 추가했다.
   - `npx expo export --platform android`도 다시 성공해서
     이번 카테고리 추가, 암기 시작 흐름 변경, 문제 수 버그 수정, 예시 영역 폭 조정까지
     Expo SDK 54 기준 Android 번들링이 정상임을 확인했다.


2026년 4월 24일 저장 탭 3분할과 사진 OCR 입력 기능을 추가했다.

1. 저장 탭의 입력 방식을 세 가지로 분리했다.
   - 상단에 `한쌍씩`, `텍스트 파일로`, `사진으로` 세 개의 선택 칩을 만들었다.
   - 이제 `한쌍씩`을 누르면 직접 앞면/뒷면을 입력하는 카드만 보이고,
     `텍스트 파일로`를 누르면 파일 예시와 불러오기 버튼만 보인다.
   - 즉 한 화면에 모든 저장 방법을 다 쌓아두는 대신,
     사용자가 지금 쓰려는 입력 방식만 집중해서 보게 구조를 나눴다.

2. 새 `사진으로` 모드에는 실제 OCR 흐름을 넣었다.
   - `사진 촬영`, `앨범에서 선택` 두 버튼을 만들고,
     선택한 사진은 바로 미리보기로 보여주도록 했다.
   - 사진을 고르면 ML Kit OCR이 글자를 읽고,
     인식된 카드 쌍을 바로 아래 미리보기 목록으로 보여준 뒤
     `인식한 카드 저장하기` 버튼으로 저장하게 만들었다.
   - 즉 사용자가 잘못 읽힌 결과를 한 번 보고 저장할 수 있어서
     곧바로 자동 저장하는 방식보다 훨씬 안전하다.

3. OCR 엔진은 `@infinitered/react-native-mlkit-text-recognition`를 사용했다.
   - 이 라이브러리는 ML Kit 텍스트 인식 결과로
     block / line / element와 각 영역 좌표(frame)를 돌려준다.
   - 사진 선택/촬영은 Expo 공식 `expo-image-picker`를 붙여 처리했다.
   - `expo-image-picker`는 SDK 54에 맞춰 `~17.0.10`으로 정리했고,
     `app.json`에는 카메라/사진 권한 문구와
     Android `RECORD_AUDIO`를 막기 위한 `microphonePermission: false`도 추가했다.

4. 사진 속 좌우 열을 카드 쌍으로 나누는 규칙도 직접 구현했다.
   - `src/utils/memory.js`에 OCR 결과 파서를 새로 만들었다.
   - 먼저 인식된 element/line들을 세로 위치 기준으로 같은 줄(row)로 묶고,
     각 줄 안에서는 가로 간격이 가장 크게 벌어진 지점을 찾아
     왼쪽 묶음과 오른쪽 묶음으로 나누도록 했다.
   - 따라서 사용자가 노트에 단어와 뜻을 좌우 두 열로 적고
     가운데 간격을 넓게 벌려 찍으면,
     그 줄을 `(왼쪽, 오른쪽)` 카드 쌍으로 해석할 수 있다.

5. OCR 결과가 완벽하지 않을 때도 흐름이 끊기지 않게 했다.
   - 짝을 만들지 못한 줄은 따로 세어서 안내 메시지로 보여주고,
     인식된 카드가 0개면 “간격을 더 넓혀 다시 찍어 달라”는 쪽으로 안내한다.
   - 이미 저장된 카드가 섞여 있어도 기존 `saveEntryBatch()`를 그대로 타기 때문에,
     중복은 자동으로 건너뛰고 새 카드만 저장된다.

6. 중요한 제한도 같이 정리했다.
   - 이번 OCR은 네이티브 ML Kit 모듈을 쓰기 때문에
     기존 Expo Go만으로는 실제 인식이 안 될 수 있다.
   - 앱은 Expo Go에서도 계속 열리지만,
     사진 OCR 자체는 새 dev build나 APK를 다시 설치해야 실제로 동작하는 구조다.

7. 마지막으로 검증도 다시 돌렸다.
   - `npx expo-doctor`는 `17/17 checks passed`였다.
   - `npx expo export --platform android`도 성공해서
     저장 탭 3분할, 사진 OCR UI, 이미지 선택기, ML Kit 연동 코드까지 포함한 상태에서
     Expo SDK 54 기준 Android 번들링이 정상임을 확인했다.


2026년 4월 25일 최신 커밋 기준 Android dev build와 APK를 실제로 다시 빌드했다.

1. 먼저 현재 작업 기준점을 확인했다.
   - Git HEAD는 `45e316a`였고,
     이 커밋에는 저장 탭 3분할과 사진 OCR 기능이 이미 반영되어 있었다.
   - Expo 계정도 `zinnn / youwon35@naver.com`으로 로그인된 상태였다.

2. development profile로 Android dev build를 새로 만들었다.
   - 명령은 `eas-cli build --platform android --profile development --non-interactive`였다.
   - 빌드 완료 링크는
     `https://expo.dev/accounts/zinnn/projects/memoria/builds/c3c72217-22e4-4a9f-930f-ac2210da7c5c`
     이다.
   - 이 빌드는 development client라서,
     사진 OCR 같은 네이티브 모듈을 포함한 최신 상태를 휴대폰에 설치해 확인할 수 있다.

3. preview profile로 실제 APK도 새로 만들었다.
   - 명령은 `eas-cli build --platform android --profile preview --non-interactive`였다.
   - preview 환경의 `EXPO_PUBLIC_APP_SCHEME`,
     `EXPO_PUBLIC_SUPABASE_ANON_KEY`,
     `EXPO_PUBLIC_SUPABASE_URL`도 정상 로드된 상태로 빌드가 진행되었다.
   - 빌드 완료 링크는
     `https://expo.dev/accounts/zinnn/projects/memoria/builds/eb774b55-0ccf-4e6d-b65b-2c7ce3c03633`
     이다.
   - 따라서 이 APK에는 최신 사진 OCR 기능과 Google/Supabase 설정이 포함된 상태다.

4. 이번 빌드로 확인된 중요한 의미도 있다.
   - 사진 OCR은 네이티브 ML Kit 모듈을 새로 추가한 기능이기 때문에,
     예전 dev build를 그대로 쓰면 이 기능은 실제로 동작하지 않는다.
   - 이번에 다시 만든 development build 또는 preview APK를 설치해야
     최신 OCR 기능을 휴대폰에서 테스트할 수 있다.


2026년 4월 25일 탭 전환 스크롤 초기화와 보관함 카드 레이아웃을 손봤다.

1. 먼저 사용자가 느낀 불편의 원인을 구조에서 확인했다.
   - 이 앱은 탭마다 각각 ScrollView가 있는 구조가 아니라,
     화면 전체를 감싸는 ScrollView 하나 안에서
     `save / quiz / history / manage / about` 내용을 교체하는 방식이었다.
   - 그래서 한 탭에서 아래로 많이 스크롤한 뒤 다른 탭으로 바꾸면,
     새 탭 내용도 같은 스크롤 위치를 그대로 이어받아
     내려간 상태로 보이고 있었다.

2. 이 문제는 탭 전환 전용 함수를 만들어 정리했다.
   - `scrollRef`를 만들고 최상위 ScrollView에 연결했다.
   - 새 `handleTabChange(nextTab)` 함수에서
     `setTab(nextTab)` 후 `scrollTo({ y: 0, animated: false })`를 호출해
     탭이 바뀔 때마다 스크롤을 맨 위로 되돌리게 했다.
   - 하단 탭 버튼뿐 아니라
     `보관함 보기`, `저장 탭으로 이동`, `암기하러 가기`,
     튜토리얼 닫기 후 이동, 암기 라운드 시작 후 `quiz`로 이동하는 흐름까지
     같은 함수를 타도록 맞췄다.
   - 즉 사용자가 어느 탭에서 어디를 누르든,
     다른 탭으로 이동하는 순간은 항상 위에서부터 시작하게 바뀌었다.

3. 보관함 탭 카드 레이아웃도 사용자가 요청한 방향으로 바꿨다.
   - 기존에는 `PreviewRow`를 재사용해서
     앞면과 뒷면이 좌우로 나란히 놓이고,
     그 아래에 `수정 / 삭제` 버튼이 가로로 한 줄에 붙는 구조였다.
   - 이걸 보관함 전용 레이아웃으로 분리해서,
     카드 안에서
     `앞면 텍스트 + 수정 버튼`,
     `뒷면 텍스트 + 삭제 버튼`
     두 줄이 위아래로 쌓이는 구조로 다시 만들었다.
   - 결과적으로 사용자가 원한
     `SUN            수정`
     `해              삭제`
     느낌에 더 가깝게 정리됐다.

4. 스타일도 전용으로 새로 잡아 다른 탭 UI와 충돌하지 않게 했다.
   - `manageDisplayStack`, `manageDisplayRow`, `manageTextBlock`,
     `managePairText`, `manageSideButton` 스타일을 추가했다.
   - 버튼은 오른쪽 고정 폭으로 두고,
     왼쪽 텍스트 블록은 긴 단어/문장도 자연스럽게 줄바꿈되게 `flex: 1`로 처리했다.
   - 기존 공용 `secondaryButton`, `dangerButton`은 그대로 두고
     보관함 카드에서만 `manageSideButton`을 덧씌우는 방식이라
     앱 다른 영역 버튼 모양은 건드리지 않았다.

5. 수정 후에는 실제로 빌드가 깨지지 않는지 다시 확인했다.
   - `npx expo-doctor`는 여전히 `17/17 checks passed`였다.
   - `npx expo export --platform android`도 성공해서,
     이번 탭 전환 로직과 보관함 카드 레이아웃 변경이
     Expo SDK 54 기준 Android 번들링에 문제 없음을 확인했다.
"""
