# 공중도시 DEEP LAYER — Claude 작업 가이드

정적 웹게임 프로토타입. 빌드 도구 없음. `index.html`을 브라우저로 열면 동작한다 (file:// 가능). 가입 페이지는 `signup.html`.

## 파일 역할 (수정할 때 이 표만 보면 된다)
| 파일 | 역할 | 이럴 때 수정 |
|---|---|---|
| `js/data.js` | 콘텐츠/상수 정의 (로직 없음) | 아이템·레시피·구역·행동·임무(QUESTS)·상점(SHOPS)·버프·게시글·기본 상태 |
| `js/core.js` | 상태/저장/규칙 (DOM 금지) | 전투·보상·기력·제작·임무·상점·길드·반복/재설정 규칙, 저장 검증(`hardenState`) |
| `js/ui.js` | 렌더링·이벤트·소리 | 화면 갱신, 버튼 동작(`A` 객체), 창(임무 수주/상점/길드), BGM/효과음 |
| `js/auth.js`, `js/signup.js` | 가입 규칙(가짜 서버)·가입 화면 | 서버 연결 시 `AuthApi.signup`만 fetch로 교체 |
| `css/theme.css` | 색상 변수 (라이트/다크) | 색 변경. 새 색은 두 테마 블록에 같은 이름으로 추가 |
| `css/style.css`, `css/signup.css` | 컴포넌트·레이아웃 (색은 변수만) | 모양/배치 |
| `tests/smoke.py` | Playwright 스모크 테스트 | 기능 추가 후 항목 추가 |
| `SECURITY.md` | 보안 방어선 / 실서비스 요구사항 | 보안 관련 변경 시 |

로드 순서: data → core → ui (전역 공유, ES 모듈 아님). 저장 키 `deeplayer-ui`; 저장 구조를 바꾸면 `SAVE_VERSION`(현재 8)을 올린다(이전 저장은 무시). 필드를 더하기만 하면 `hardenState`에서 검증/보정한다(채팅 채널 개편처럼 올리지 않고 이전 저장을 살릴 수 있음).

## 용어
- **공중** = 안전지대(본부·개인실·상점가). 이동에 시간이 안 걸리고 기력만 든다. **지상** = 제1~5구역(타일 지도). 코드의 `danger`/`DANGER_ZONES`가 지상.

## 핵심 구조
- 상태는 `state` 하나. `save()`로 localStorage 저장. 화면은 `render*()`가 `state`에서 다시 그린다.
- 버튼은 `data-act="이름"` → `ui.js`의 `A[이름]`. 툴팁은 `data-tip-title/desc[/end]`.
- 방치형 행동: `startAction` → `state.active{id,startAt,endAt,cycles,cycleSec,spCost[,path]}` → `finishIfDue()`('step'=타일 도착 / true=결과 대기) → `state.pending` → `claimResult()`. 기력은 시작 시 차감(중단 시 환불).
- 이동·입장·퇴장·타일·채집·전투는 `askAction` 확인창을 거친다. 시간이 걸리지 않는 행동은 누르면 바로 실행된다: 조사(`A.choice`가 `startAction` 직행), 임무 수주/상점(kind `board`/`shop`, 창을 바로 연다).
- 구역 활동 패널(`#actionMain`/`#choices`)은 내용만큼 늘어나며 스크롤이 생기지 않는다(`.action-panel{flex:0 0 auto}`). 확인/취소 버튼이 항상 보여야 한다.
- 로그(`addLog`)는 특별한 사건만 남긴다: 임무 수주/완수, 길드 생성, 이벤트·대성공·사고·패배·희귀 획득·레벨 업·가방 부족이 있는 행동 결과, 제작 대성공. 채팅·이동·행동 시작은 남기지 않는다.
- 시간: 공중 이동 0분(기력 `MOVE_SP_*`), 지상 타일 1칸 `DUNGEON_STEP_SEC`=180초(3분)+기력 1(험난한 지형 `ROUGH_EXTRA_SEC`: 들어가는 칸마다 +2분/+3분), 채집/전투 1회 300~480초, 조사는 시간 0(칸마다 12시간에 한 번). 제작은 `state.crafting`(별도 작업, 다른 행동과 동시).
- 스테이터스 효과(`effects()`): 근력=공격력 증가(`atk`, 전투 데미지 배율→사냥 성공 확률), 민첩=피격 감소, 지능=채집 대성공, 의지=희귀 채집, 감각=제작 시간 단축, 행운=제작 대성공.
- 타일(`a~e`=`terrains[0..4]`)마다 재료·희귀템·몬스터·설명이 다르다. 채집 선택지는 재료마다 문구가 다르고(`GATHER_VERBS`: '나무를 벤다' 등, 아이콘은 `GATHER_KINDS` 방식별), 칸마다 지형 재료 중 0~2개만 나타난다(`tileGatherIds`, 입장 시드 `dungeon.seed`로 정해져 같은 칸은 같은 결과). 전투 문구는 몬스터별('…의 흔적을 쫓는다').
- **반복/재설정**: 같은 행동(`state.repeats[id]={n,at}`)을 4번째 이상 반복하면 아이템 획득 확률이 떨어진다(`repeatChance`, 경험치는 그대로). 12시간 뒤 초기화. 조사는 `state.invAt[구역,x,y]` 기준 12시간 뒤 다시 가능.
- **개발자 도구**: 배포 코드에는 없다. `tools/dev-preview.js`(즉시 완료 버튼)는 `python3 tools/build_preview.py <out.html>`로 만든 미리보기 빌드에만 합쳐진다. `tools/`는 배포 금지. 클라이언트 코드는 어차피 열람 가능하므로 실서비스 보호는 서버 권한이 필요하다.
- **T9 추가 기능**: 상점 탭+판매, 본부 승급(F→E→D), 임무 24시간 리셋, 농장, 펫(동행/보관/24시간 탐험/별도 도감), 서브잡(납품·레벨·태그), 메일(운송장치·15일 만료·보존 30통·친구 선택, 현재는 샘플 친구), 칭호, 이동장치(구역 선택), 글자 크기, BGM 페이드, 맵 이동=마우스 휠 버튼, 타일 이동 1분, 휴식 30분/잠자기 6시간, 용어 '대원'.
- **전투 드롭/요리/귀환**: 몬스터는 `drops`(짐승=고기·가죽, 이능=이능 조직)를 확률로 떨어뜨리고, 고기 요리 레시피로 기력을 보충한다. 귀환 신호기(상점)는 어디서든 본부로 돌아온다.
- **쓰러짐/구조**: 죽지 않는다. 지상에서 HP 1이 되거나, 기력이 모자라 움직일 수 없고 회복 아이템도 없으면 본부로 구조(HP 1, 부상, 보유 CR의 10% 최대 80 차감). 안전구역끼리 이동은 기력이 들지 않는다.
- **레시피/단련**: 처음에는 `STARTER_RECIPES` 7종만 안다. 나머지는 개인실 '단련'(kind `train`, 3시간, 기력 10)으로 무작위 1종씩 배운다(`state.learned`). 후보는 `RECIPE_RANK`의 등급(F/E/D) 이하만(`learnableRecipes`). 장비·장신구·무기 레시피 포함. 단련 도입 전 저장은 로드할 때 등급 기준으로 이어받는다.
- **레벨 제한**: 서브잡 Lv.5(`SUBJOB_MIN_LV`), 펫 Lv.7(`PET_MIN_LV`) — `levelGate(id)`. 레벨업 EXP는 `EXP_SLOW`=1.18배, 몬스터 CR은 `CR_BONUS`=1.1배.
- **장비 강화**: 본부 '장비 강화'(kind `enhance`). `ENCHANT_COST`=100 CR을 내면 그 장비 이름에 무작위 효과 1개(스탯 +1~2 또는 최대 HP/기력 +5~15, `ENCHANT_POOL`)가 붙고, 다시 하면 바뀐다(`state.enchants`). 장착한 장비만 적용되며 최대치는 `syncMax()`가 100+보너스로 맞춘다.
- **교환**: 주위 대원과 하루 `TRADE_DAILY`=3회 (`tradeWith`, `state.trades`). 상대는 `NEARBY_PLAYERS`의 `[이름, 상태, [[아이템,수량]]]`뿐이다(서버 전까지 테스트용).
- **길드 알림**: `settings.guildAlert`. 새 메시지는 `receiveGuildMessage`/`onGuildMessage`로 들어온다(서버 연결용 훅).
- **이동 규칙**: 안전구역끼리는 즉시·기력 0. 이동장치→지상은 1분(`ZONE_TRIP_SEC`, 확인창, 도착하면 미궁 입구 자동 입장, `startTrip`). 미궁 퇴장은 바로 이동장치로. 가 본 칸은 `state.explored`에 구역별로 저장되어 다시 들어가도 보인다.
- **전투 HP 손실**: 일반 전투 1회 최대 4(`BATTLE_HP_CAP`). 특별한 전투는 몬스터에 `hpCap`을 지정한다(지금은 없음).
- **더미 데이터 없음**: 샘플 대원/샘플 길드/자동 답장/가짜 채팅을 제거했다. `NEARBY_PLAYERS`는 서버 연결 전까지 비어 있어 친구·길드 초대·메일 수신자가 생기지 않는다(기능 코드는 남김, 테스트는 임시 대원을 주입). 가입(signup) 모듈의 모의 서버는 별도라 그대로 둔다.
- **지상 구역/난이도**: 제1~5구역(숲·바다·화산·협곡·설원). 난이도는 모두 비슷하게 맞췄고(`z.level`·사고 확률·몬스터 체력/공격 동일 수준) 멀수록 EXP·CR만 조금 늘어난다(`ZONE_REWARD`). 등급 제한은 `ZONE_MIN_RANK`(지금은 비어 있음). 위험도 표시는 없다. 지형마다 몬스터가 2종(`t.monsters`, 칸마다 하나: `tileBattleId`). 지도는 `tools/gen_maps.py`로 만들어 data.js `MAPS`에 붙인다(`.`=허공, 불규칙한 모양, 타일 크기는 무대에 맞춰 자동). 행동 확률 저하는 같은 장소의 같은 행동끼리만 쌓인다(`repKey`). 이벤트 지점은 `EVENT_RESET_MS` 뒤 다시 생긴다(`state.eventAt`), 이동 중 `TRAVEL_FIND` 확률로 재료를 줍는다.
- **미구현**: 대원 간 상점, 실제 서버 채팅/메일/길드/계정/보안, D 이후 승급.
- 캐릭터 생성은 튜토리얼 안에서(`createCharacter`): 전원 F/Lv1/100CR/스탯 총합 동일(모든 스탯 0에서 시작, 12포인트 자유 분배). 필수는 이름과 이능력 이름뿐, 나이는 10~60(비우면 20). 처음 임무는 메인 임무(`adapt`)만 있고 서브 임무는 본부에서 수주한다. 튜토리얼 끝에 `chooseWeapon`(무기 6종 중 1) + `START_KIT`(건조 식량×3, 응급 키트×1).
- **임무 수주**: `QUESTS`에서 `board`가 있는 임무는 그 장소(`'본부'` 또는 지상 구역 이름의 안전 캠프 C 타일)에서 수주해야 임무 패널에 나타난다(`takeQuest`, 동시 `BOARD_MAX_ACTIVE`=5). 장소 판정은 `placeKey()`. need.type: `kill`(수주 후 처치 수, `countKill`), `item`(`consume:true`면 완수 시 납품), `visit`, `flag`. board 없는 임무는 처음부터 진행 중.
- **상점**: `SHOPS[장소]`={base, special}. `상점가`와 각 구역 캠프. `buyItem`이 장소·CR·가방 칸을 검사. 판매는 미구현.
- **채팅/길드**: 채널은 월드·길드·알림(`CHAT_TABS`). 알림은 공지만 받는 읽기 전용(저장값을 믿지 않고 항상 `NOTICE_FEED()`로 다시 만든다). 길드(`state.guild`): `createGuild`(길드장), `joinDemoGuild`, `inviteGuild`(길드장만, 최대 `GUILD_MAX`), `leaveGuild`. 서버 연결 전에는 `NEARBY_PLAYERS` 샘플만 초대할 수 있고 '자리 비움'은 응답이 없다. 파티 기능은 삭제됨.
- 패널 접기는 ≤1200px에서만 보이며, 폭이 넓어지면(`restorePanels`) 접은 패널을 모두 펼친다. 좁은 화면은 한 줄 쌓기.
- 설정: 스위치(`sw()`), BGM 기본 25%, 클릭음/알림음 따로 on/off. 테마는 `applyTheme(임시설정)` 미리보기.
- 아바타: `deeplayer-avatar`에 압축 저장(`compressImage`, ≤256px/≈200KB). 프로필 창 안에서 이미지 삽입.
- 도감 `state.codex`, 지도/지역 UI는 `LOCATIONS`에서 생성.

## 새 콘텐츠 추가법
- 아이템: `defItems`. 회복템은 `use:{hp|sp}`. 장비는 `slot`, `mods`.
- 제작: `RECIPES`에 `{out, mats, sec}`.
- 임무: `QUESTS`에 추가(`board`로 수주 장소 지정). 상점 상품: `SHOPS`.
- 지상 구역/지형: `DANGER_ZONES`(terrains 5개)와 `MAPS`. 맵을 바꾸면 `maps_connected` 테스트가 연결성을 검사한다.
- 소리: BGM `audio/bgm.mp3`(없으면 합성음). 효과음 `ui.js SFX`(WebAudio).

## 테스트
```
for f in js/*.js; do node --check $f; done
STUB_ICONS=1 python3 tests/smoke.py   # 아이콘 폰트를 못 받는 환경(샌드박스)에서. 실제 환경은 STUB_ICONS 없이
```
실패 항목은 `FAILED`에 출력된다. 스크린샷은 `tests/out/`.

## 규칙
- 기존 UI/기능을 유지하고, 미구현 기능을 구현된 것처럼 표시하지 않는다.
- 규칙(core)·화면(ui)·콘텐츠(data)를 섞지 않는다. 색을 style.css에 직접 쓰지 않는다.
- 사용자 입력은 `esc()`/`cleanText()`로만 화면·저장에 넣는다. `innerHTML`에 원본 문자열을 넣지 않는다. (SECURITY.md)
- 변경 후 문법 검사 + 스모크 테스트를 돌리고 결과를 보고한다.

## 최근 변경
- 프로필(아바타 클릭) 창에서 이름·나이·키워드·이능력 설명·허용 설정 수정 + 컴팩트 칭호 칩(펜 버튼 제거). 아바타 92px.
- 제작: 탭 장비/음식/약/재료(`craftCat`), '제작 가능만', 수량(`#craftQty`) 여러 개 제작(`craft(index, qty)`, `state.crafting.qty`), 아이템 모달에서 여러 개 사용(`useItem(name, n)`).
- 승급 보상 가방(정찰 배낭 32 / 원정 배낭 40), 도감 아이템 '획득' 줄(`itemSources`), 길드 기본 이름(`defaultGuildName`), 보석·광물 장비 레시피 12종, 채팅 줄바꿈 CSS 수정.
- 레이아웃(데스크톱 ≥1201px): 스테이터스·지도 패널 아래 틈(`.vgrip`)을 끌어 세로 높이 조절(`state.layout.statusH/mapH`, 0=자동, 더블클릭 초기화). 로그는 지도 오른쪽(`.map-body` 가로), ≤1200px에서는 지도 아래. 모든 지도(노드/타일)에서 가운데 버튼 끌기 이동 + 확대/축소/동서남북 표시(타일 지도는 `view.dpan/dzoom`, 저장 안 함).
- 레시피: 건조 식량=민물고기, 구운 고기=짐승 고기만. 버프/디버프는 스테이터스 제목줄 아이콘으로만 표시.
- 프로필 수정: 이능력 이름 포함, 첫 수정은 바로, 이후 24시간 간격(`state.profileEditAt`, `profileLockLeft()`; 칭호 제외). 전투 승리 확률은 최대 99%(`BATTLE_MAX_WIN_MISS`). 설정에 로컬 저장/불러오기(세이브 .json 파일: `{game,version,savedAt,data}`), 튜토리얼 다시 보기 버튼은 오른쪽.
- 친구 찾기: 서버 로그인 시 `Cloud.searchPlayers`(RPC `search_players`, `supabase/friends.sql` 을 한 번 실행해야 함)로 `saves`의 캐릭터 이름을 검색. 결과는 `REMOTE_PLAYERS`에 담아 `addFriend` 가능. 메일·교환·길드 초대는 아직 서버 미연결.
