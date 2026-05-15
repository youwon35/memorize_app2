# MEMORIA Google Play 출시 체크리스트

이 문서는 MEMORIA를 Google Play에 올릴 때 따라갈 실전 순서입니다. 현재 앱 식별자는 `com.youwon35.memoria`이며, Google Play에 한 번 업로드한 패키지명은 바꾸거나 재사용할 수 없습니다.

## 1. 출시 전에 직접 준비할 것

1. Google Play Console 개발자 계정을 만듭니다. 개인 계정으로 새로 만들었다면 폐쇄 테스트 12명, 14일 연속 참여 조건이 적용될 수 있습니다.
2. Play Console에서 앱을 만듭니다.
   - 앱 이름: `MEMORIA`
   - 기본 언어: `한국어`
   - 유형: 앱
   - 가격: 무료로 시작 권장
   - 연락 이메일: 실제로 받을 수 있는 운영 이메일
3. 개인정보처리방침과 데이터 삭제 안내를 공개 URL로 준비합니다.
   - 초안: `docs/privacy-policy-ko.md`
   - 삭제 안내 초안: `docs/data-deletion-ko.md`
   - Play Console에는 PDF가 아닌 공개 웹 URL을 넣어야 합니다.
4. Google 로그인/동기화를 계속 사용할 경우, Supabase와 Google OAuth 설정에 실제 출시 앱 정보를 맞춥니다.
   - 앱 스킴: `memoria://auth/callback`
   - Android 패키지명: `com.youwon35.memoria`
   - Play 앱 서명 인증서가 생기면 Google OAuth 설정에 필요한 SHA 인증서 정보를 추가로 반영합니다.

## 2. 앱 빌드

출시용 Android App Bundle은 다음 명령으로 만듭니다.

```bash
npm run build:production
```

EAS 빌드가 끝나면 `.aab` 다운로드 링크가 나옵니다. Google Play 첫 업로드는 Play Console에서 수동 업로드를 먼저 해야 하며, 그 뒤부터 `npm run submit:production`으로 자동 제출을 연결할 수 있습니다.

기기 설치 테스트용 APK는 다음 명령입니다.

```bash
npm run build:preview
```

## 3. Play Console 앱 콘텐츠 입력

Play Console의 `정책 및 프로그램 > 앱 콘텐츠`에서 아래 항목을 채웁니다.

- 개인정보처리방침: 공개 URL 입력
- 앱 액세스: 앱 대부분이 로그인 없이 접근 가능하면 제한 없음. Google 로그인 검수가 필요하면 테스트 계정 또는 설명 제공
- 광고: 현재 광고 SDK 없음, `광고 없음`
- 데이터 보안: 아래 `store/google-play-listing.md`의 데이터 보안 초안을 기준으로 입력
- 콘텐츠 등급: 교육/학습 도구 기준으로 설문 작성
- 타겟층: 어린이를 주요 대상으로 삼지 않는다면 성인/일반 사용자 연령대로 설정
- 뉴스 앱/정부 앱/금융 기능: 해당 없음

## 4. 테스트 트랙

처음에는 `내부 테스트`에 AAB를 올려 설치와 로그인, 파일 가져오기, 폴더/카드 저장, 암기, 문의하기를 확인합니다. 새 개인 개발자 계정이면 이후 `폐쇄 테스트`에서 최소 12명의 테스터가 14일 연속 opt-in 상태를 유지해야 프로덕션 신청이 가능합니다.

테스트할 핵심 흐름:

- 첫 실행 튜토리얼 시작/건너뛰기
- 저장 탭에서 폴더와 카드 생성
- txt/csv/xls/xlsx/docx 파일 가져오기
- 암기 탭에서 문제 수 조정 후 학습 완료
- 기록 탭에서 학습 기록 확인과 오답 다시 풀기
- 보관함에서 카드 수정/삭제
- 앱 정보에서 정책 확인, Google 로그인/로그아웃, 문의하기, 계정 / 데이터 삭제

## 5. 프로덕션 출시

1. 내부/폐쇄 테스트에서 심각한 오류가 없는지 확인합니다.
2. Play Console `프로덕션 > 새 버전 만들기`에서 테스트한 AAB를 선택합니다.
3. 출시 노트 예시:

```text
MEMORIA 첫 출시
- 카드와 폴더 저장
- 파일 가져오기
- 맞춤 암기와 오답 다시 풀기
- 학습 기록 확인
```

4. 모든 오류 요약을 해결한 뒤 검토 요청을 보냅니다.

## 참고 공식 문서

- Google Play 앱 생성/설정: https://support.google.com/googleplay/android-developer/answer/9859152
- Google Play 출시 준비: https://support.google.com/googleplay/android-developer/answer/9859348
- 새 개인 개발자 계정 테스트 조건: https://support.google.com/googleplay/android-developer/answer/14151465
- 개인정보처리방침/앱 콘텐츠: https://support.google.com/googleplay/android-developer/answer/9859455
- 데이터 보안 양식: https://support.google.com/googleplay/android-developer/answer/10787469
- 계정 삭제 요구사항: https://support.google.com/googleplay/android-developer/answer/13327111
- 목표 API 요구사항: https://developer.android.com/google/play/requirements/target-sdk
- Expo Android 제출: https://docs.expo.dev/submit/android/
