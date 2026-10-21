# 온라인으로 올리기 · 업데이트하기

이 게임은 **정적 파일(HTML/CSS/JS)** 이라서 서버 프로그램 없이 "파일을 올려 두는 곳"만 있으면 인터넷에서 열립니다.

## 먼저 알아둘 것 (중요)
- 올리면 **누구나 주소로 접속해서 혼자 플레이**할 수 있습니다.
- 하지만 **저장은 각자 브라우저(localStorage)** 에만 됩니다. 기기를 바꾸거나 브라우저 데이터를 지우면 사라집니다.
- 채팅·친구·메일·길드는 **다른 사람과 이어지지 않습니다.** (서버가 없어서 대원이 비어 있습니다)
- 가입 화면의 계정·초대코드도 그 브라우저 안에서만 셉니다. 정원 50명은 "브라우저마다" 따로입니다.
- 진짜 멀티(계정·공유 월드·거래)는 **서버(DB 포함)** 를 만들어야 합니다. 이 문서는 "일단 온라인에 올려 지인들이 해 보게 하는 단계"입니다.

## 방법 A. GitHub Pages (무료, 추천)
1. GitHub에서 새 저장소를 만듭니다. (예: `deep-layer`)
2. 이 폴더의 파일을 올립니다. (`tests/`, `tools/`는 올려도 되지만 배포에는 쓰이지 않습니다)
   ```
   git init
   git add .
   git commit -m "첫 배포"
   git branch -M main
   git remote add origin https://github.com/내아이디/deep-layer.git
   git push -u origin main
   ```
3. 저장소 **Settings → Pages → Build and deployment → Source: GitHub Actions** 로 바꿉니다.
4. `main`에 푸시될 때마다 `.github/workflows/pages.yml`이 자동으로 배포합니다. 1~2분 뒤 `https://내아이디.github.io/deep-layer/` 로 열립니다.

## 방법 B. Netlify / Cloudflare Pages (끌어다 놓기)
- Netlify: 로그인 → Add new site → Deploy manually → `index.html, signup.html, css, js, audio` 폴더를 끌어다 놓기.
- Cloudflare Pages: 저장소 연결 → Build command 비움, Output directory `/`.
- 두 곳 모두 HTTPS 주소를 자동으로 줍니다. (가입 화면의 암호화는 HTTPS가 필요합니다)

## 업데이트하는 법
1. 파일을 고칩니다.
2. 로컬에서 시험: `python3 tests/smoke.py` (Playwright 필요)가 통과하는지 봅니다.
3. `git add . && git commit -m "무엇을 바꿨는지" && git push` → 자동으로 다시 배포됩니다. (Netlify 수동 방식은 폴더를 다시 끌어다 놓기)
4. 유저 브라우저에는 캐시가 남을 수 있어서 반영이 늦으면 새로고침(Ctrl+F5)을 안내합니다.

### 저장 데이터와 업데이트
- 저장 키 `deeplayer-ui`, 저장 버전 `SAVE_VERSION`(js/data.js)입니다. 새로 생긴 항목은 불러올 때 기본값으로 채워지므로 **대부분의 업데이트는 저장을 지우지 않아도 됩니다.**
- 저장 구조를 **깨는** 변경(항목 이름 변경 등)을 하면 `SAVE_VERSION`을 올리고 `hardenState`(js/core.js)에서 옛 데이터를 옮겨 주는 코드를 넣으세요.
- 아이템/임무/레시피 id를 바꾸거나 지우면 옛 저장에서 사라지니 가급적 이름은 유지하세요.

## 초대코드와 개발자 코드
- 일반 유저 초대코드(50명)와 개발자 코드는 **해시만** 코드에 들어 있습니다. 원문은 운영자(당신)만 가지고 있어야 합니다. 새 코드를 만들려면 `SHA-256(대문자 원문)`을 구해 `js/auth.js`의 `INVITE_TABLE`(초대코드) 또는 `js/data.js`의 `DEV_CODE_HASH`(개발자 코드)에 바꿔 넣습니다.
- 개발자 코드 입력란은 없앴습니다. 개발자 도구는 **관리자 계정**(아래 '관리자 · 버그 리포트' 참고)으로 로그인했을 때만 켜지고, 설정 맨 아래에 접힌 '개발자' 항목으로 나타납니다.
- ⚠ 클라이언트(브라우저) 코드라서 마음먹은 사람은 파일을 열어 우회할 수 있습니다. "일반 유저에게 안 보이게" 하는 용도이고, **진짜 권한/정원 관리는 서버가 필요**합니다.

## 서버를 붙이고 싶다면 (다음 단계)
SECURITY.md의 "실서비스로 가려면" 목록을 따릅니다. 요약: 계정 로그인 → 서버가 저장·보상·시간 계산 → 초대코드 정원은 DB에서 차감 → 채팅/메일/길드는 서버 중계.

## 서버 저장 켜기 (Supabase, 아이디/비밀번호 + 초대코드)
1. supabase.com에서 프로젝트를 만든다. **Authentication → Providers → Email**에서 *Confirm email*을 끈다. (아이디를 `아이디@deeplayer.game` 형태로 가입시키므로 메일 인증이 없다)
2. **SQL Editor**에 `supabase/schema.sql` 전체를 붙여 실행한다. 마지막 줄 주석의 `insert into public.invites…`에서 초대코드 원문과 정원(지인 3~4명이면 `5` 정도)을 넣어 실행한다.
3. **Project Settings → API**에서 *Project URL*과 *anon(publishable) key*를 복사해 `js/cloud.js` 맨 위 `CLOUD = { url: '…', key: '…' }`에 넣는다. 서비스 롤 키(secret)는 절대 넣지 않는다.
4. 푸시하면 배포된다. 설정 화면에 **서버 저장** 항목이 생기고 `signup.html` 가입이 서버로 처리된다.
5. 모의 서버 테스트: `python3 tests/cloud_test.py` (실제 Supabase 연결은 따로 확인해야 한다)

## 관리자 · 버그 리포트 · 업데이트 알림
- **관리자 아이디**: 게임 가입 페이지에서 평소처럼 가입한 뒤, `supabase/admin.sql` 맨 아래 `'관리자아이디@deeplayer.game'`을 그 아이디로 바꿔 SQL Editor에서 실행한다. 그 아이디로 로그인하면 개발자 코드 없이 개발자 도구가 켜진다.
- **버그 리포트**: 상단 가이드 오른쪽 벌레 버튼. 보내기는 로그인한 누구나(1시간 5건 제한), 읽기·삭제는 서버가 관리자만 허용한다. 설정 → 개발자 → "버그 리포트 보기". (`admin.sql` 전체를 실행해야 동작)
- **업데이트 알림**: 배포 때 `version.json`이 생성되고(`pages.yml`), 접속 중 값이 바뀌면 알림 채널에 "업데이트되었어요, 새로고침해 주세요" 공지가 뜬다. (5분마다 + 탭으로 돌아올 때 확인)
- **첫 화면**: `cloud.js`에 서버 설정이 있고 로그인하지 않았다면 `signup.html`(가입/로그인)이 먼저 열린다.
- **공지 쓰기 (관리자)**: 개발자 도구에서 '개발자 모드'가 켜져 있으면 알림 채널에 말머리(서버 공지·점검 일정 등)를 달아 공지를 쓸 수 있다. 서버 연결 시 `admin.sql`의 `notices` 표에 저장되어 모든 유저에게 5분 안에 보인다(쓰기는 관리자만).
