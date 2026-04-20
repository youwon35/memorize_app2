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
"""
