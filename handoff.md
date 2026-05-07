# MEMORIA Handoff

## 프로젝트 개요
- 프로젝트명: `MEMORIA`
- 성격: Expo React Native 기반 실제 모바일 암기 앱
- 현재 브랜치 기준: `develop`
- 현재 최신 확인 커밋: `c8ba20b feat: enforce guided tutorial flow`
- 앱 식별자:
  - Android package: `com.memoria.app`
  - iOS bundle identifier: `com.memoria.app`
  - Expo scheme: `memoria`
  - Expo owner: `zinnn`

이 앱은 사용자가 암기용 카드 쌍을 만들고, 적응형 퀴즈로 학습하고, 학습 기록을 보고, 필요하면 Google 로그인 + Supabase로 기기 간 동기화를 할 수 있게 만든 앱이다. UI는 실제 휴대폰 앱 기준으로 구성되어 있고, Expo SDK 54를 기준으로 맞춰져 있다.

## 핵심 사용자 기능

### 1. 저장 탭
- 하단 탭 구성: `저장 / 암기 / 기록 / 보관함 / 앱 정보`
- 카드 저장 방식:
  - `한쌍씩`: 앞면/뒷면을 직접 입력해서 저장
  - `파일로`: 파일을 읽어 여러 쌍을 한 번에 저장
  - `사진으로`: 코드상 존재하지만 현재는 숨김 처리
- 파일 import 지원 형식:
  - `txt`
  - `csv`
  - `xls`
  - `xlsx`
  - `docx`
- import 규칙:
  - `txt`, `docx`: 한 줄 + 다음 줄이 같은 카드 쌍, 빈 줄 한 줄이 다른 카드 쌍 구분
  - `csv`, `xls`, `xlsx`: 1열 = 앞면, 2열 = 뒷면, 행 = 다른 카드
- `.doc`는 지원하지 않음. `docx`를 사용해야 함.

### 2. 암기 탭
- 저장된 카드 기반으로 적응형 퀴즈를 생성
- 출제 방향 선택 가능:
  - 양방향
  - 앞면만
  - 뒷면만
- 문제 수 조절 가능
- 정답 비교는 대소문자/연속 공백 정규화 후 비교
- 카드 우선순위는 완전 랜덤이 아니라 아래 요소를 반영:
  - 새 카드
  - 최근에 틀린 카드
  - 오답률 높은 카드
  - 오래 안 본 카드
  - 여러 번 잘 맞힌 카드는 비중 감소

### 3. 기록 탭
- 오늘 학습 횟수
- 최근 세션
- 틀린 카드
- 누적 학습 통계
- 학습 완료 시 세션 단위 기록을 저장하고, 카드별 시도/정답/오답/방향별 기록을 누적

### 4. 보관함 탭
- 저장된 카드 목록 확인
- 수정 / 삭제 가능
- 최근 저장순 / 가나다순 / 오답 많은 순 정렬 지원
- 긴 텍스트는 목록에서 말줄임으로 제한하고, 수정 시 전체 내용 확인 가능

### 5. 앱 정보 탭
- 로그인 상태 확인
- 다크 / 라이트 모드 전환
- 튜토리얼 다시 보기
- 문의하기
- 관리자 계정이면 관리자 패널 표시

## 튜토리얼
- 최근 커밋들로 튜토리얼이 크게 강화됨
- 현재 상태:
  - 채팅형 온보딩
  - 단계별 가이드
  - 탭 이동 유도
  - 저장 탭에서 실제 카드 하나를 직접 저장하도록 유도
  - 사용자가 단순히 넘기는 방식이 아니라 흐름을 따라가도록 더 강하게 제어
- 관련 최근 커밋:
  - `5b3b3e5 feat: add chat-style onboarding tutorial`
  - `ba6ec60 feat: make tutorial interactive`
  - `c8ba20b feat: enforce guided tutorial flow`

## 로컬 저장 / 클라우드 동기화 구조

### 로컬
- 기본 동작은 로컬만으로도 가능
- `AsyncStorage`를 사용
- Supabase 미설정 상태에서도 앱 자체는 사용 가능

### 클라우드
- `Supabase`가 연결되면 Google 로그인 가능
- 로그인 후 카드(`memory_pairs`)를 클라우드와 동기화
- 세션은 모바일에서는 `expo-secure-store`, 웹에서는 `AsyncStorage` 기반으로 유지
- Supabase 클라이언트 파일: `/D:/github/APP/memorize_app2/src/lib/supabase.js`

## 관리자 기능
- 일반 사용자 카드는 본인 것만 접근 가능
- 관리자 역할은 `public.user_profiles.role = 'admin'`
- 관리자 전용 기능:
  - 전체 문의 목록 조회
  - 문의 상태 변경
  - 운영 지표 확인
- 문의는 메일로 자동 발송되지 않음
- 현재 구조는:
  - 사용자 문의 -> `support_inquiries` 테이블 저장
  - 관리자 -> 앱 정보 탭 관리자 패널 또는 Supabase에서 확인

### 관리자 패널 운영 지표
- 연결 사용자 수
- 30일 활성 사용자
- 30일 앱 실행 수
- 사용자당 평균 카드 수
- 활성 사용자당 평균 실행 수
- 7일 재방문율
- 최근 24시간 문의 수
- 문의 요약:
  - 전체
  - 미해결
  - 상태별(received / reviewing / resolved)

## Supabase 스키마 개요
파일: `/D:/github/APP/memorize_app2/supabase/schema.sql`

주요 테이블:
- `user_profiles`
  - 사용자 프로필 및 role(`user`, `admin`)
- `memory_pairs`
  - 카드 저장 테이블
- `support_inquiries`
  - 사용자 문의
- `app_usage_events`
  - 앱 실행 같은 운영 지표용 이벤트

주요 함수 / 정책:
- `public.is_admin()`
- `public.get_admin_dashboard_metrics()`
- RLS 정책으로 일반 사용자 접근 제한
- `user_profiles` 쪽 role self-escalation 위험은 이미 한 차례 보완함

중요:
- 백엔드 구조가 바뀌는 커밋을 pull한 뒤에는 Supabase SQL Editor에서 `schema.sql`을 다시 실행해야 최신 테이블/함수/정책이 맞춰짐

## 사진 OCR 기능 상태
- 완전히 삭제한 것은 아님
- 현재는 feature flag로 숨김
- 위치: `/D:/github/APP/memorize_app2/src/config/features.js`
- 현재 값:
  - `photoImport: false`

즉, 앱 UI에서는 사진 import를 숨겨두었지만 아래 코드는 남아 있음:
- `/D:/github/APP/memorize_app2/src/lib/photo-ocr.js`
- `/D:/github/APP/memorize_app2/supabase/functions/ocr-photo-cards/index.ts`
- 커스텀 ML Kit 네이티브 모듈:
  - `/D:/github/APP/memorize_app2/vendor/react-native-mlkit-text-recognition`

설계 방향:
- Google Cloud Vision OCR 우선
- 실패하거나 부족하면 로컬 OCR fallback
- 한글 / 일본어 / 영어 혼합 인식을 고려한 힌트 재시도 로직 있음

현재 판단:
- 당장은 사용자 노출 비활성화
- 나중에 다시 살릴 때 feature flag만 켜서 이어갈 수 있게 유지

## 파일 import 로직
파일: `/D:/github/APP/memorize_app2/src/utils/import-files.js`

현재 구현 포인트:
- 확장자 판별
- `csv/xls/xlsx` 행/열 기반 파싱
- `docx`는 `word/document.xml`을 `jszip`으로 읽어 문단 텍스트 추출
- `txt/docx`는 최종적으로 memory parser 규칙으로 해석

파일 파싱 관련 주요 라이브러리:
- `xlsx`
- `jszip`

## 학습 알고리즘
파일: `/D:/github/APP/memorize_app2/src/utils/memory.js`

핵심 함수:
- `buildPracticeDeck()`
- `recordStudyAttempt()`
- `appendStudySession()`
- `createPersistableStudyStats()`
- `parseImportedPairs()`
- `extractPairsFromRecognizedText()`

알고리즘 포인트:
- 카드마다 signature를 만들어 학습 통계 연결
- 방향별 통계(`A_TO_B`, `B_TO_A`)를 따로 관리
- 새 카드 / 오답 / 최근 결과 / 오래 안 본 정도를 weight 계산에 반영
- 카드 편집 시 signature migration 처리
- 세션 저장 시 JSON persist 가능한 형태로 정리

## 다국어
- 기준 언어: 한국어
- 지원 언어:
  - 한국어
  - 영어
  - 일본어
- 파일: `/D:/github/APP/memorize_app2/src/i18n.js`
- 이전 점검에서 `en/ja missing=0, extra=0` 기준으로 정리된 상태

## UI / 레이아웃 상태
- 휴대폰 앱 중심으로 많이 다듬어짐
- 태블릿에서 너무 넓게 늘어나지 않도록 layout guard 추가
- 최근 디자인 보정:
  - 저장 탭 입력 UI 정리
  - 보관함 카드 높이/버튼 간격 정리
  - 학습 탭 문제 수/출제 방향 구조 정리
  - 앱 정보 탭 단순화

## 실행 방식

### 자주 쓰는 명령
- `npm run start`
  - dev client + tunnel/LAN 실행용 스크립트
- `npm run start:lan`
- `npm run start:tunnel`
- `npm run start:go`
  - Expo Go용
- `npm run build:dev`
  - Android development build
- `npm run build:preview`
  - Android preview build

### dev build 재생성 여부 기준
- 대부분의 JS/UI 로직 수정은 새 dev build 불필요
- 새 dev build가 필요한 경우:
  - 새 네이티브 라이브러리 추가
  - package / scheme 변경
  - config plugin / 권한 변경

최근 `txt/csv/xls/xlsx/docx` import 추가는 JS-only 변경이라 기존 dev build로 확인 가능하다고 정리된 상태

## 현재 코드 구조

### 큰 흐름
- `/D:/github/APP/memorize_app2/App.js`
  - 메인 앱 상태 / 화면 / 탭 / 튜토리얼 / 관리자 패널까지 대부분이 들어 있는 중심 파일
- `/D:/github/APP/memorize_app2/src/utils/memory.js`
  - 카드 데이터 / 학습 통계 / adaptive quiz / OCR 텍스트 분해
- `/D:/github/APP/memorize_app2/src/utils/import-files.js`
  - 파일 import 파싱
- `/D:/github/APP/memorize_app2/src/lib/supabase.js`
  - Supabase 클라이언트
- `/D:/github/APP/memorize_app2/src/lib/photo-ocr.js`
  - 숨겨진 사진 OCR 기능
- `/D:/github/APP/memorize_app2/src/config/features.js`
  - feature flag
- `/D:/github/APP/memorize_app2/supabase/schema.sql`
  - backend schema / RLS / metrics

### 현재 구조상 특징
- 기능이 많아지면서 `App.js`가 매우 커진 상태
- 다음 리팩터링 후보:
  - 탭별 컴포넌트 분리
  - 관리자 패널 분리
  - 튜토리얼 분리
  - 스타일/테마 분리

## 최근 기능 추가 흐름
- `d02f0dd`: cloud OCR fallback 추가
- `e871987`: OCR/기록 UI 보완
- `359e906`: photo import를 feature flag 뒤로 숨김
- `64d5e29`: 태블릿 레이아웃 가드
- `5aed80e`: Supabase 관리자 문의 패널
- `bfad6c8`: 관리자 지표 + 프로필 보안 보완
- `e237357`: 7일 재방문율 + 24시간 문의 수
- `840f626`: `txt/csv/xls/xlsx/docx` import 지원
- `11b2ace`: Expo SDK 54 의존성 정렬
- `5b3b3e5`, `ba6ec60`, `c8ba20b`: 튜토리얼 강화

## 운영상 기억할 점
- 문의는 메일 자동 발송이 아니라 DB 저장형
- 관리자 계정이어야 운영 패널이 열림
- Supabase backend 변경 후 `schema.sql` 재실행 필요
- 사진 OCR은 숨겨졌지만 코드가 남아 있으므로, 관련 네이티브 모듈/함수도 같이 존재
- 원격 최신은 `develop` 브랜치 기준으로 작업

## 다음 채팅방에서 바로 이어서 보면 좋은 것
1. `App.js`에서 현재 어떤 탭/상태가 어떻게 연결되는지 먼저 확인
2. `memory.js`에서 adaptive quiz 로직과 study stats 구조 파악
3. `schema.sql`에서 관리자/문의/metrics 정책 확인
4. photo import를 다시 열 계획이 있으면 `APP_FEATURES.photoImport`부터 확인
5. 배포 직전이면 Play Store용 자산, privacy policy, release build 점검 필요

## 한 줄 요약
이 프로젝트는 `카드 저장 + 적응형 암기 + 학습 기록 + Supabase 기반 계정 동기화 + 관리자 문의/운영 지표`까지 갖춘 실제 모바일 암기 앱이고, 현재는 사진 OCR 기능만 숨겨둔 채 거의 출시 직전 수준으로 다듬어진 상태다.
