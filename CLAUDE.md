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
- 시간: 공중 이동 0분(기력 `MOVE_SP_*`), 지상 타일 1칸 `DUNGEON_STEP_SEC`=60초(1분)+기력 1(험난한 지형도 같음, `ROUGH_EXTRA_SEC`는 0), 채집 1회 5분, 전투 1회 6분(고정), 조사는 시간 0(칸마다 12시간에 한 번). 제작은 `state.crafting`(별도 작업, 다른 행동과 동시).
- 스테이터스 효과(`effects()`): 근력=공격력 증가(`atk`, 전투 데미지 배율→사냥 성공 확률), 민첩=피격 감소, 지능=채집 대성공, 의지=희귀 채집, 감각=제작 시간 단축, 행운=제작 대성공.
- 타일(`a~e`=`terrains[0..4]`)마다 재료·희귀템·몬스터·설명이 다르다. 채집 선택지는 재료마다 문구가 다르고(`GATHER_VERBS`: '나무를 벤다' 등, 아이콘은 `GATHER_KINDS` 방식별), 칸마다 지형 재료 중 0~2개만 나타난다(`tileGatherIds`, 입장 시드 `dungeon.seed`로 정해져 같은 칸은 같은 결과). 전투 문구는 몬스터별('…의 흔적을 쫓는다').
- **반복/재설정**: 같은 행동(`state.repeats[id]={n,at}`)을 4번째 이상 반복하면 아이템 획득 확률이 떨어진다(`repeatChance`, 경험치는 그대로). 12시간 뒤 초기화. 조사는 `state.invAt[구역,x,y]` 기준 12시간 뒤 다시 가능.
- **개발자 도구**: 배포 코드에는 없다. `tools/dev-preview.js`(즉시 완료 버튼)는 `python3 tools/build_preview.py <out.html>`로 만든 미리보기 빌드에만 합쳐진다. `tools/`는 배포 금지. 클라이언트 코드는 어차피 열람 가능하므로 실서비스 보호는 서버 권한이 필요하다.
- **T9 추가 기능**: 상점 탭+판매, 본부 승급(F→E→D), 임무 24시간 리셋, 농장, 펫(동행/보관/24시간 탐험/별도 도감), 서브잡(납품·레벨·태그), 메일(운송장치·15일 만료·보존 30통·친구 선택, 현재는 샘플 친구), 칭호, 이동장치(구역 선택), 글자 크기, BGM 페이드, 맵 이동=마우스 휠 버튼, 타일 이동 1분, 휴식 30분/잠자기 6시간, 용어 '대원'.
- **전투 드롭/요리/귀환**: 몬스터는 `drops`(짐승=고기·가죽, 이능=이능 조직)를 확률로 떨어뜨리고, 고기 요리 레시피로 기력을 보충한다. 귀환 신호기(상점)는 어디서든 본부로 돌아온다.
- **쓰러짐/구조**: 죽지 않는다. 지상에서 HP 1이 되거나, 기력이 모자라 움직일 수 없고 회복 아이템도 없으면 본부로 구조(HP 1, 부상, 보유 CR의 10% 최대 80 차감). 안전구역끼리 이동은 기력이 들지 않는다.
- **레시피/단련**: 처음에는 `STARTER_RECIPES` 7종만 안다. 나머지는 개인실 '단련'(kind `train`, 25분, 기력 10)으로 무작위 1종씩 배운다(`state.learned`). 후보는 `RECIPE_RANK`의 등급(F/E/D) 이하만(`learnableRecipes`). 장비·장신구·무기 레시피 포함. 단련 도입 전 저장은 로드할 때 등급 기준으로 이어받는다.
- **레벨 제한**: 서브잡 Lv.5(`SUBJOB_MIN_LV`), 펫 Lv.7(`PET_MIN_LV`) — `levelGate(id)`. 레벨업 EXP는 `EXP_SLOW`=1.18배, 몬스터 CR은 `CR_BONUS`=1.1배.
- **장비 강화/세공**: 본부 '장비 강화'(kind `enhance`) 창에 탭 2개(`view.enhTab`). **강화**=무기 F→A랭(`state.reinforce`, `REINFORCE_*`: 보너스 [0,2,4,7,10,14]·비용·성공률, 실패하면 CR만 잃고 랭크는 유지, `reinforceItem`, `weaponAtk`에 반영). **세공**(옛 강화)=아래 설명대로 `ENCHANT_COST`=100 CR을 내면 그 장비 이름에 무작위 효과 1개(스탯 +1~2 또는 최대 HP/기력 +5~15, `ENCHANT_POOL`)가 붙고, 다시 하면 바뀐다(`state.enchants`). 장착한 장비만 적용되며 최대치는 `syncMax()`가 100+보너스로 맞춘다.
- **교환**: 주위 대원과 하루 `TRADE_DAILY`=3회 (`tradeWith`, `state.trades`). 상대는 `NEARBY_PLAYERS`의 `[이름, 상태, [[아이템,수량]]]`뿐이다(서버 전까지 테스트용).
- **길드 알림**: `settings.guildAlert`. 새 메시지는 `receiveGuildMessage`/`onGuildMessage`로 들어온다(서버 연결용 훅).
- **이동 규칙**: 안전구역끼리는 즉시·기력 0. 이동장치→지상은 1분(`ZONE_TRIP_SEC`, 확인창, 도착하면 미궁 입구 자동 입장, `startTrip`). 미궁 퇴장은 바로 이동장치로. 가 본 칸은 `state.explored`에 구역별로 저장되어 다시 들어가도 보인다.
- **전투 HP 손실**: 일반 전투 1회 최대 4(`BATTLE_HP_CAP`). 특별한 전투는 몬스터에 `hpCap`을 지정한다(지금은 없음).
- **더미 데이터 없음**: 샘플 대원/샘플 길드/자동 답장/가짜 채팅을 제거했다. `NEARBY_PLAYERS`는 서버 연결 전까지 비어 있어 친구·길드 초대·메일 수신자가 생기지 않는다(기능 코드는 남김, 테스트는 임시 대원을 주입). 가입(signup) 모듈의 모의 서버는 별도라 그대로 둔다.
- **지상 구역/난이도**: 제1~5구역(숲·바다·화산·협곡·설원). 난이도는 모두 비슷하게 맞췄고(`z.level`·사고 확률·몬스터 체력/공격 동일 수준) 멀수록 EXP·CR만 조금 늘어난다(`ZONE_REWARD`). 등급 제한은 `ZONE_MIN_RANK`(지금은 비어 있음). 위험도 표시는 없다. 지형마다 몬스터가 2종(`t.monsters`, 칸마다 하나: `tileBattleId`). 지도는 `tools/gen_maps.py`로 만들어 data.js `MAPS`에 붙인다(`.`=허공, 불규칙한 모양, 타일 크기는 무대에 맞춰 자동). 행동 확률 저하는 같은 장소의 같은 행동끼리만 쌓인다(`repKey`). 이벤트 지점은 `EVENT_RESET_MS` 뒤 다시 생긴다(`state.eventAt`), 이동 중 `TRAVEL_FIND` 확률로 재료를 줍는다.
- **미구현**: 대원 간 상점, 실제 서버 채팅/메일/길드/계정/보안, D 이후 승급.
- 캐릭터 생성은 튜토리얼 안에서(`createCharacter`): 전원 F/Lv1/100CR/스탯 총합 동일(모든 스탯 0에서 시작, 12포인트 자유 분배). 필수는 이름과 이능력 이름뿐, 나이는 10~60(비우면 20). 처음 임무는 메인 임무(`adapt`)만 있고 서브 임무는 본부에서 수주한다. 튜토리얼 끝에 `chooseWeapon`(무기 6종 중 1) + `START_KIT`(건조 식량×3, 응급 키트×1).
- **임무 수주**: `QUESTS`에서 `board`가 있는 임무는 그 장소(`'본부'` 또는 지상 구역 이름의 안전 캠프 C 타일)에서 수주해야 임무 패널에 나타난다(`takeQuest`, 동시 `BOARD_MAX_ACTIVE`=5). 장소 판정은 `placeKey()`. need.type: `kill`(수주 후 처치 수, `countKill`), `item`(`consume:true`면 완수 시 납품), `visit`, `flag`. board 없는 임무는 처음부터 진행 중.
- **상점**: 캠프는 `SHOPS[장소]`={base, special}(탭 `SHOP_TABS`). 상점가는 `SHOPS['보급품 상점']`/`SHOPS['종합 상가']`={title, at:'상점가', tabs, sections:{탭:[[이름,가격]]}} — `shopAt/shopTabs/shopSections/shopRows`가 둘을 같게 다룬다. `buyItem`이 장소·CR·가방 칸을 검사, `sellItem`은 두 상점 모두 가능.
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
- 서버 소셜(모두 `supabase/friends.sql`, 로그인 시): 친구 신청→상대 수락(`friend_reqs`/`friendships`), 메일(`mails`, 친구에게만, 받으면 `receiveServerMail`), 교환(`trades`, 제안 때 내 물건을 맡기고 수락/거절/취소/3일 만료 시 메일로 지급·반환), 길드(`guilds`/`guild_members`/`guild_reqs`: 초대→초대받은 사람 수락, 가입 신청→길드장 수락; 서버가 기준이라 `guildSyncState`가 state.guild를 맞춤). `friendPoll()`이 60초마다 가져온다. 길드 채팅은 아직 서버 미연결.
- 전투/이동 묘사: 진행 중 화면의 남은 시간 아래 임시 로그(`#battleLog`, `activityLogFor`)가 **1분에 한 줄**(`BATTLE_LOG_SEC`=60) 나온다. 전투는 시작 때 `state.active`에 저장한 `seed/hp0/bs/d`로 `battleRuns`가 실제 결과(`resolveAction`)와 **같은 시드 계산**을 다시 돌려 6분 회차를 1분 6칸으로 풀어 쓴다(`battleSlotLine`, 문구 변형 다수). 이동은 지나는 칸 지형 이름+능력치 스타일을 섞는다(`travelLogFor`). 결과 화면이 되면 사라진다. 모의 전투(`mockRound`)만 별도 계산.
- 스테이터스 2페이지(`view.statusPage`, `combatPageHtml`)와 '추가 기능' → 모의 전투 오버레이(`openMock`/`mockStart`, 실제 진행에 영향 없음).
- 재료: 타일/구역 노드 툴팁에 `[채집]`/`[재료]`, 지도 왼쪽 위 검색창(`#mapSearch`, `view.mapQ`)이 해당 지형 칸(`.tile.hl`)·구역 노드를 하이라이트.
- 개방 알림: `newUnlocks()`가 승급 시험 가능·레벨 개방(`LEVEL_UNLOCK_NOTES`)을 한 번만 알린다(`state.unlockSeen`). 단련 25분(`TRAIN_SEC`).
- 난이도: 입구(S)에서 걸어서 멀수록 몬스터가 강해진다. `entranceDist`/`tileDifficulty`(0~1)/`scaleMonster`(체력 ×0.7~×17, 공격·피격률·보상 증가), 전투 시작 때 `active.d`에 고정. `simulateBattle`은 개체마다 체력 ×0.6~1.5 변동. 모의 전투 목록은 약한 몬스터가 위(`mockMonsters`, hp×atk 순).
- 도박성 선택지(`GAMBLES`, kind `gamble`): 상점가·본부·개인실·이동장치·캠프 칸. 80% 좋은 일/20% 나쁜 일(`GAMBLE_WIN`), 즉시 결과, 장소별 1시간에 한 번(`state.gambleAt`), 판돈이 있으면 CR 부족 시 불가. 손실 CR은 보유량 이하로 제한.
- 알림 탭 글쓰기: 서버 `admins` 표 등록 계정이면 `view.isAdmin`(개발자 도구 없이)으로 가능. 실제 권한은 서버 `post_notice`가 검사.
- 스테이터스 2페이지: 공격력/방어력/모의전투 3칸(1페이지와 같은 크기, `view.statH`). 친구 목록은 2열(`#friendList`).
- 서버 채팅: 월드/길드 탭은 로그인 시 서버(`chat_msgs`, RPC `chat_send/chat_fetch`)로 연결된다. `chatPoll()`이 6초마다 새 글만 가져오고(`view.chatLast`), 길드 채널은 서버에서 내 길드로 풀린다. 서버가 없거나 로그아웃이면 예전처럼 로컬 전용. 알림은 공지 전용 그대로. `supabase/friends.sql` **전체를 다시 실행**해야 한다.
- 대원 아이콘: 프로필 이미지를 64px로 줄여 서버 `avatars`에 올린다(`syncMyAvatar`, 바꾸거나 지울 때·접속 때). `avatarOf(이름)`이 채팅·친구창·길드 목록에 이미지(없으면 기본 얼굴)를 그리고, 모르는 이름은 `get_avatars`로 한 번에 가져와 10분 캐시(`view.avatars`).
- 지역 칭호: `LIT_TITLES` — 지역의 걸을 수 있는 칸을 모두 밝히면(`zoneFullyLit`) '○○을 밝힌 자'(고요한 숲/파도 해안/용암계곡/붉은 협곡/눈보라 설원).
- 글자 크기: 설명류 +1px, 확인창의 예상 시간·보상·소모는 13px 굵게, 설정은 제목 14/항목 13/설명 12.
- 채팅 기록: 서버 채팅의 최근 60개를 이 기기(`deeplayer-chat`, 아이디별)에 남겨 새로고침해도 바로 보인다(`saveChatCache`). 서버에서는 새 글만 `chatLast` 이후로 가져온다. 길드원·친구 목록의 프로필 이미지는 창을 열 때 못 찾은 이름을 다시 묻는다. 길드원 목록은 2열(`.member-grid`), 친구 교환창 물건·수량은 한 줄(`.trade-row`), 모의전투 카드 전체가 버튼(`.mock-card`).
- 날씨: `todayWeather()`(한국 시간 하루 단위 시드, 맑음 40/흐림 30/비 20/눈 10%). 비·눈이면 채집·채굴·낚시 재료 획득 확률 +15%p, 아니면 사냥 공격력 +10% (`weatherFx`, 버프 아이콘 `.buff-icon.weather`). 채팅 주사위 버튼 `#diceBtn`(1~6). 제작 탭 높이는 소지품 탭과 같다(`invHeight`).
- 밟은 칸: `state.visited[구역]`(`revealAround`에서 기록, 이전 저장은 본 칸을 모두 밟은 것으로 이어받음). 보이기만 한 칸은 `.tile.unvisited`(배경 흑백, 아이콘 유지)라 벽과는 아이콘으로 구분된다. 지도 검색(`#mapSearch`)은 재료뿐 아니라 출몰 몬스터 이름도 찾는다.
- 상점가 특산 장비/소모품: 고양이귀 헤드기어(머리), 망토(목), 중식도·곡괭이(무기), 사탕·망개떡(기본 보급품).
- 채팅 시간: 서버 글은 `at`, 로컬 글은 3번째 값(ms)을 `fmtChatTime`으로 '오후 7:35'(다른 날은 '10/20 오후 7:35')로 표시. 채팅은 글자 13px·메시지 구분선.

## 버프 위치 / 대원 정보 / 세계관 cr
- `#buffIcons`(날씨 포함)는 프로필 패널(`.profile-panel`) 오른쪽 위에 절대 배치. 스테이터스 제목(`.panel-title`)은 nowrap, 포인트 배지는 `flex:none`.
- 이름·아이콘에 `data-user="이름"`을 달면 클릭 시 `viewUser(name)`(대원 정보 창; 나는 내 프로필). 서버 로그인 시 `searchPlayers`로 레벨·등급을 가져옴(SQL 변경 없음). 채팅/친구/길드/신청 목록에 적용.
- 세계관 게시판에 'cr(크레딧)' 항목(별명 "체리") 추가.

## 2026-10-21 추가
- 버프/디버프 아이콘은 종류별 1개만 표시(`renderBuffs`), 초과분은 `data-tip-more`로 툴팁에 함께 표시(`+N` 배지).
- 묘사: `EQUIP_LINES`(착용 장비별 이동 t / 전투 b 한 줄)·`EQUIP_SET_LINES`(data.js)를 `equipLine()`이 가끔 끼워 넣는다(이동 25%, 전투 슬롯 22%; 별도 시드라 기존 묘사/결과 계산에 영향 없음). 이동/전투 문구 풀 확장.
- 장비 세트: `ITEM_SETS`(닌자 두건+닌자 복면 → 민첩 +1, `statMods`). 신규 장비 6종(상점가): 페르소나(eyeglasses), 운명의 붉은실(손 2), 꼬깔콘(손 1), 비닐바지, 닌자 두건, 닌자 복면.
- 임무 정렬: 메인 → 완수 가능 → 원래 순서. 농장: 다 자란 밭은 `tick`에서 한 번 알림(`view.farmBack`). 도박 '낡은 서랍 뒤지기'·'수상한 승차권 뽑기' 삭제.
- 서브잡 납품 리셋은 한국 시간 자정(`kstDayOf`/`nextKstMidnight`, `jobActive`/`jobCooldown`).
- 프로필 이미지: 선택 후 `startCrop`(정사각형 범위 지정·드래그/모서리/슬라이더) → `crop-ok`에서 기존 `compressImage(bmp, rect)`로 압축.
- 친구 삭제·길드 해산/탈퇴는 `askConfirm`(취소 시 원래 창으로) 후 `friend-remove-do`/`guild-leave-do`.
- 총기 아이콘은 직접 그린 SVG(`CUSTOM_ICONS.pistol`, `icon()`이 처리).
- 타인 프로필(`viewUser`): 칭호·이름, 2열 정보, 이능력/설명. 서버 `get_profile(p_name)` RPC(`friends.sql` 전체 재실행 필요), 없으면 `search_players`로 기본 정보만.
- 메일: 첨부는 소지품과 같은 칸 UI(`renderMailAttach`, 탭/페이지, `view.mailAtt`), 창은 단말기 스타일(`#modal.terminal`). `sendMail.sent`=실제로 가방에서 뺀(중복·운송장치 제외) 첨부 목록이며 서버로도 이것만 보낸다(같은 아이템을 두 줄 넣으면 서버엔 두 번 가고 운송장치/가방에선 한 번만 빠지던 문제 수정).
- 메일 창은 친구·길드 창과 같은 기본 창 스타일(단말기 스타일은 롤백). 첨부는 "소지품에서 고르기" 버튼 → `#mailPicker`(소지품과 같은 칸·탭·페이지)에서 선택.
- 상점 장비 행에 효과 줄(`itemEffect`: 공격력·스탯·세트). 아이템 설명은 모두 '~다' 체로 통일(새 아이템도 ~다 체로 쓴다).
- 최적화: 전투/이동 묘사는 같은 분에는 다시 계산하지 않고(`#battleLog` `data-key`), 탭이 가려져 있으면 채팅 폴링을 24초에 한 번으로 줄인다. 저장 데이터는 건드리지 않는다.
- 공지 게시판 맨 위에 '업데이트 · 10월 21일' 패치 내역 추가(POSTS['공지'][0]). 새 업데이트마다 맨 위에 추가한다.
- 프로필 창: '캐릭터 정보 수정' 제목 오른쪽 위 '편집'(`profile-edit`)/'편집 취소' 버튼(`.pf-edit`)으로 입력칸을 열고, 하단 '저장'(`char-save`)은 편집 중에만 활성. 닫기·이미지 삭제는 항상 표시.
- 채집·채굴·낚시(kind `gather`)도 진행 중 `#battleLog`에 1분마다 묘사(`gatherLogFor`, `GATHER_STYLE`): 능력치 비율로 근력/지능/민첩/의지/감각/행운 문장이 섞이고(전투 문장은 5 이상만, 채집은 1 이상), 나머지는 방식별 풍경 문장. 결과 계산과 무관한 묘사.
- 프로필 창: 스위치는 편집 버튼 아래 세로·오른쪽 정렬(`.pf-side/.pf-sw`), 하단 닫기 없음(헤더 X로만), 편집 전 입력칸은 테두리·배경 없음. 테스트는 `#closeModal`로 닫는다.
- 스테이터스 카드 슬라이드(`STAT_BUFFS`, 카드 숫자 아래 화살표 `stat-slide`/`view.statSlide`로 기본 효과↔추가 효과 전환, 3페이지는 없음;  `effects()`의 petTime/travelHurt/farmTime/repeatKeep/travelFind/reinforce): 펫 탐험 시간(`p.exp.ms`에 시작 시점 값 저장)·이동 중 사건 피해 회피(`applyMove`)·작물 성장(`growMs`)·반복 채집(`gatherRepeat`)·이동 중 줍기·무기 강화 확률에 반영. 1페이지와 같은 칸 크기.
- 오른쪽 탭: 임무 / 서브잡(가입 후만 표시, `jobPanelHtml(true)`, 그만두기 없음, 선택 수량은 `view.jobPicks`) / 펫(보유 시 표시, `petPanelHtml`, 탐험 상태·수확, 도감·펫 돌보기 버튼) / 주위 대원. 도감 '펫' 탭은 지금 보유한 펫만 발견으로 표시. 펫 이름 `p.name`(최대 `PET_NAME_MAX`=8, 빈 값=종 이름, `renamePet`/`petName`).
- 펫 탭(`petPanelHtml`)은 소지품과 같은 하위탭(`.subtabs`: 상태/도감/돌보기, `view.petSub`). 돌보기는 `petCareHtml()`(펫 돌보기 창과 공용, 핸들러는 `petRoot(el)`/`petRefresh(el)`로 탭·창 모두 처리).
- 단련은 25분(`TRAIN_SEC`=1500).
- 길들이기 확인창에 먹이 선택(`baitPickHtml`, `#tameBait`, `view.bait`) → `startAction(id, mi, baitName)`. 탐험 보내기도 돌보기의 '줄 먹이'(`view.feed`)를 `sendExpedition(i, zone, baitName)`에 넘긴다. 이름을 안 넘기면(코드 호출) 가장 약한 먹이가 기본.
- 다중행동 옵션에 '직접 입력'(`MULTI_OPTIONS` 마지막, `custom:true`): 분 단위 5~1440(`CUSTOM_MIN_*`), `customMultiMin`/`setCustomMin`/`multiOpt(mi)`가 core에서 실제 시간을 계산, UI는 `#customMin` 입력(실행 시 값 반영).
- 프로필 창: 친구 추가/길드 초대 허용 스위치는 프로필 카드 안(`.profile-card .pf-sw`), 아이콘 이미지와 같은 높이의 오른쪽에 세로 배치.
- 저장 안전장치: 저장 검증(`hardenState`)이 불러오는 순간(core.js 맨 위 `const state = loadState()`) 쓰는 상수는 반드시 data.js(또는 그 이전)에 둔다 — core.js 아래쪽의 `const`는 TDZ로 ReferenceError가 나서 loadState의 catch가 빈 새 캐릭터를 돌려준다(펫 이름 `PET_NAME_MAX` 사고). 읽기에 실패하면 원본을 `deeplayer-ui-backup`에 보관하고 `window.__loadError`에 사유를 남긴다. 서버 로그인 상태에서 `created=false`면 서버 저장 확인(`cloudRecover`)을 먼저 하고, 빈 상태는 서버로 올리지 않는다(`cloudAutoPush`/`cloud-push`).
- 스토리(튜토리얼 첫 화면) 오른쪽 아래 `#tutCloudLoad` '서버 불러오기': 서버 로그인 + `created=false`일 때만 보이고, 서버 진행이 있으면 `cloudApply`. 저장 검증에서 `crafting.out`은 `RECIPES[index].out`으로 다시 채운다. 테스트 `load_path_has_no_late_consts`(정적)·`reload_keeps_character_*`(동적)가 불러오기 사고를 막는다.
- 서버 백업(`supabase/backups.sql` 한 번 실행): `saves`가 덮어써지기 직전(BEFORE UPDATE 트리거) 이전 진행을 `save_backups`에 유저별 최대 12개 보관(6시간마다 auto, 캐릭터 있던 저장이 빈 상태로 덮일 때 guard, 수동 manual). RPC `list_backups/get_backup/backup_now`, 클라이언트 `Cloud.listBackups/getBackup/backupNow`, 설정 → 서버 백업(`openBackups`, `backup-now`/`backup-restore(-do)`). 불러오기 전에 현재 서버 상태를 먼저 `backup_now`. 서버 저장이 비었을 때 스토리의 `#tutCloudLoad`가 가장 최근 백업을 찾는다.
- 프로필 이미지 기기 간 동기화: 이미지(`deeplayer-avatar`)는 세이브와 별개라 다른 기기에는 없다. `syncMyAvatar(clear)`는 이 기기에 이미지가 있으면 64px로 서버에 올리고, 없으면 서버에서 내 것을 받아 저장한다(예전엔 빈 값을 올려 서버 이미지를 지웠음). 서버에서 지우는 건 `avatar-clear`(clear=true)뿐. 받는 이미지는 64px라 원본 화질은 아니다.

## 2026-10-22 추가
- 스테이터스 포인트는 `view.statDraft`(저장 안 함)에 먼저 나눠 두고 `stat-commit`(저장)→`commitStatDraft`로 확정, `stat-reset`(취소)/`stat-down`(되돌리기). 세이브에는 확정된 값만 들어간다.
- 로그인 화면(signup.html): 로그인 탭에서는 초대코드 안내 문구를 숨기고 입력란을 위로, 로그인 버튼을 살짝 아래로(`#liForm` CSS).
- 메일 답장: 열어 본 메일의 `mail-reply` → 보내기 탭에 받는 사람·`RE: 제목` 미리 채움(`view.mailSubj`). 친구가 아닌 발신자는 거절.
- 아이템 설명 통일: `itemLines(이름)` → ['설명 | 효과(설명에 없는 것만, 없으면 생략)', '[태그] … [판매가] nCR']. 툴팁은 `itemTip(이름)`(줄바꿈 \n, `#tip span{white-space:pre-line}`), 창은 `itemInfoHtml`.
- 도감 정렬: `codexView.sort`('' 기본순 / 'name' 가나다순, 미발견은 항상 뒤).
- 임무 수주 리셋: 수주한 뒤 처음 맞는 한국 시간 오전 4시(`BOARD_RESET_HOUR`, `nextBoardReset`).
- 뽑기: 임무를 완수할 때마다 `state.questCount`++, 5번마다(`TICKET_EVERY`) `state.tickets`++. 상점가 '뽑기' → `openGacha`/`drawGacha`. 경품 묶음 3가지(`GACHA_SETS`), 확률 `GACHA_RATES`(1등 1%), 1등이 나오면 `state.gacha.pat`이 다음 묶음으로(이 기기 기준; 서버 전체 공유는 미구현). 가방이 가득 차 경품을 못 받으면 뽑기권을 쓰지 않는다.
- 신규 재료: 돌(채굴)/달걀·나뭇가지·라벤더(채집)/슬라임·마석(이능 몬스터 드롭). `data.js`의 2026-10-22 블록. **규칙: 이미 있는 아이템·레시피·작물은 건너뛴다** — `defItems`는 중복 이름을 무시하고, `NEW_RECIPES`는 `RECIPES` 맨 뒤에만 붙인다(제작 중 저장이 번호로 가리킨다), `addCrop`도 중복이면 무시.
- 상점가 분리: 보급품 상점(기본 보급품/음식/약/레시피/판매), 종합 상가(장비/재료/농사/RP템(공란)/판매), 서브잡, 뽑기, 뒷골목 카드 한 판. '레시피' 탭은 아직 모르는 레시피를 CR(`RECIPE_PRICE`)로 바로 배운다(`buyRecipe`, 등급 필요).
- 칭호 '시간 가는 줄 모르는': 끝낸 행동 시간의 합 `state.actMs`가 24시간 이상(`finishIfDue`에서 누적).
- 프로필 이미지가 없으면 모든 유저 `icon('person')`. 프로필 창 '캐릭터 정보'는 항목별 상자(`.pf-row`), 순서 이름·나이·키워드·이능력 이름·이능력 설명. 채팅 단말기 `.term-screen` 좌우 여백 4px.
- 펫 성격 6종(`PET_PERS`, data.js): 길들일 때 무작위(`pers`), 옛 펫은 불러올 때 무작위로 채워 저장. `petFeedLine/petCareLine`이 성격별 문구. 성격 허브(`활발 허브` 등, `addCrop`)를 간식으로 주면 성격 변경(같은 성격이면 소모 안 함). 허브 씨앗은 채집 중 `PERS_SEED_DROP`=1.2%.
- 패치노트: `isPatchPost`(제목 '업데이트 · M월 D일')는 알림 채팅(`NOTICE_FEED`)에서 제외. 오늘(KST) 날짜 패치노트가 있으면 알림 탭 위 `#noticeBanner` → `openBoard('공지', 번호)`. 게시글 본문의 줄 머리 `[말머리]`는 `.head-tag`(포인트 색, `postHtml`). 새 업데이트는 POSTS['공지'] 맨 위에 '업데이트 · M월 D일'로 추가.
- 새 저장 필드(tickets/questCount/gacha/actMs/pets[].pers)는 SAVE_VERSION을 올리지 않고 `hardenState`가 기본값·범위를 채운다(옛 저장 호환 테스트 `old_save_gets_new_defaults`).

## 2026-10-22 동기화·결과·메일 (폰↔PC)
- 결과 카드: `state.results`(가장 최근 1개(`RESULT_KEEP`=1), `{t,text,at,gain[],loss[]}`)에 저장되어 다른 활동·새로고침 후에도 남는다. 닫기는 `A['result-close']`(data-i). 예전 `view.lastResult`는 없다.
- 자동 동기화 `cloudSync()`(ui.js): 시작 0.6초 뒤·화면 복귀(visibilitychange/focus)에 서버 rev와 비교(`Cloud.pull(true)`는 rev를 건드리지 않음). 서버가 더 새롭고 이 기기에서 사람이 한 조작이 없든 있든 묻지 않고 항상 서버 진행으로 교체한다(덮어쓰기 직전 이 기기 진행은 `deeplayer-replaced` 에 한 번 보관). 자동 저장 충돌도 같은 창을 띄운다. 화면을 떠날 때(hidden)는 20초 대기 없이 즉시 저장.
- 모든 서버 저장은 `cloudPushNow()` 한 곳(저장 성공 시 syncedat 갱신). `cloudApply(data, rev)`는 `__avatar`를 풀고 이 기기에만 있는 서버 메일(sid)을 합친 뒤 reload.
- 프로필 이미지: 서버 세이브에 64px `__avatar`로 함께 실린다(`cloudPayload`). 이미지 RPC가 없어도 서버 불러오기만으로 따라온다. 변환 실패(빈 값)는 서버 이미지를 지우지 않는다.
- 메일: 서버 메일은 `sid`('s'+서버번호)로 중복을 막고, 서버 보관함에서 지우기(ack) 전에 `cloudPushNow()`로 먼저 올린다.
- 테스트: cloud_test의 result_/save_carries_avatar/auto_sync_/keep_local_/mail_ 항목.
- 한 번에 한 기기: 서버 세이브에 `__dev`(이 브라우저의 `deeplayer-device` 번호)를 실어 올린다(`cloudPayload`). 이미 이 기기가 올린 적이 있는데(`_claimed`) 서버의 `__dev`가 다른 번호면 `lockDevice()`가 `#devLock` 오버레이로 화면을 막고 저장도 멈춘다. '이 기기에서 계속하기'는 서버 진행을 받아 reload 후 다시 현재 기기가 된다. 확인은 시작·화면 복귀·60초마다(`cloudSync`). 서버 SQL 추가 없음.
- 승급 시험 처치 현황 리셋 버그: `hardenState`의 `known()`이 조건별 진행도 키(`id#n`)를 걸러내 불러올 때마다 지워졌다 → `#` 앞 id로 판정. 4시 리셋(`resetBoardQuests`)은 완수해 둔 임무만 되돌리고 진행 중 임무·진행도는 유지.
- 장비 설명: `itemEffectParts`(base/extra)로 기본 효과는 설명에 없을 때만, 강화·세공·세트는 항상 붙인다. 착용 칸 툴팁도 `itemTip` 사용.
- 위험지대 터치 드래그: 타일 위에서 시작해도 8px 이상 끌면 지도 이동(`drag.pend`), 끈 직후 클릭은 무시(`view.noClickUntil`).
- 서버 백업 삭제: `supabase/backups.sql`의 `delete_backup` (SQL 다시 실행 필요), 목록의 '삭제' → 확인창.
- 승급 시험 C(Lv.10)/B(Lv.15) 추가(`promo_c`, `promo_b`, `PROMO_ORDER`=F,E,D,C,B): C=제4구역 급류 수달3·석상 골렘2·동굴 거미2 + 구리 광석6·수정 원석4 → 개척 배낭(44칸) 등. B=제5구역 빙하 곰2·서리 정령2·설원 늑대3 + 서리 결정8·설산 약초6 → 정예 배낭(52칸) 등. `FARM_PLOTS`에 C~S도 6칸으로 추가(등급 키가 없으면 3칸으로 떨어지므로 주의). 칭호 '정예 대원'/'상급 대원'.

## 2026-10-23 추가 (재료 분류 · 정글 · 깊이 난이도 · 반지 · 펫 간식)
- 재료 분류 `MAT_GROUPS`(data.js): '물고기'·'알'·'과일'. 레시피 `mats`에 분류 이름을 쓰면 그 분류의 아무 아이템이나 쓴다(`matCount/canCraft/maxCraft/takeMats`, picks={분류:아이템}). 고르지 않으면 값싼 것부터. 제작 시작 때 실제로 쓴 재료를 `state.crafting.used`에 기록하고 취소하면 그대로 돌려준다(옛 저장은 분류의 첫 항목으로 환불). 레시피 UI: 분류가 있고 가진 종류가 2개 이상이면 `openCraftQty` 창에 `select.mat-pick`. 새 물고기·알은 `how:'낚시'/'채집'`·`group` 자동. **`countItem(분류이름)`은 오류** — 반드시 `matCount`를 쓴다.
- 민물고기·바닷물고기는 더 이상 새로 잡히지 않고(호수=붕어·잉어, 바다=고등어·광어·오징어) 가진 것은 '물고기'로 쓴다.
- 제6구역 정글(열대숲·강·늪지: 사탕수수·과일·물고기·알). 지형 5개를 가정한 테스트는 `>=3`으로 바꿨다. `ZONE_REWARD`는 구역 간 차이 미세(1~1.15), 몬스터 HP/ATK도 `1+0.03(n-1)`. 입구에서 멀수록: HP×0.7~17, EXP·CR ×(1+`DEPTH_REWARD`=3.2·d), 전투 드롭·재료 확률 +`DEPTH_DROP`, 채집 추가 +1개/희귀 확률 `DEPTH_GATHER`(`resolveAction`의 `dd`=act.d; 채집 행동도 act.d 저장). 상수는 data.js 한 곳에서 조절.
- 결혼반지·우정반지(`hold:{luk:1}`): 소지만으로 행운 +1(종류마다 1번). `statMods`에서 소지품을 훑는다. 종합 상가 RP템에서 판매.
- 펫 간식: `select#feedSel` 대신 칩 목록(`pet-feed-pick`, `view.feed`).

## 2026-10-24 추가 (전광판 · 이름 붙이기 · 낚시 크기 · 일일 의뢰 · 꼬시기 · 숨은 요소)
- 전광판: `BILLBOARD`(뉴스/광고/공지/잡담, 리코 진행), `BILLBOARD_EVENT`에 문구를 넣으면 이벤트 동안 그것만 나온다(비우면 평소). 본부 화면(`billboardHtml`), 14초마다 글자만 교체.
- 무기 이름: `state.nicks`, A랭(강화 5)만 `setNick`. 설명에 '○○의 애착이 담긴 무기'. 강화 창의 '이름 붙이기' 버튼.
- 낚시: `FISH_SIZE`(cm 범위), 결과 `r.fish/fishShow`, 최고 기록 `state.fishBest`(도감에 표시, claimResult에서 범위 검증 후 기록).
- 일일 의뢰: `DAILY_QUESTS` 6종 중 하루(오전 4시 기준 `todayIndex`)마다 `dailyQuestId()` 1개가 본부 게시판에 걸린다.
- 펫 꼬시기: `tameShown`(칸 시드, `TAME_APPEAR` 30%), 실패는 `dungeon.tf[x,y]`에 누적, `TAME_FAIL_MAX`(3)번이면 그 칸에서 사라진다.
- 도감 아이템 분류: 장비/요리/낚시/소모품/재료(`codexItemSub`). `hidden:true` 아이템은 얻기 전에는 도감에 나오지 않는다.
- 숨은 요소가 하나 있다(구역별 특수 드롭과 캠프 전달). 상수는 data.js `LOST_*`. 패치노트·툴팁에는 일부러 쓰지 않는다.
- 스테이터스 2페이지: 공격력/방어력, 이동속도(`stepSec`), 모의전투. 버프 `+N` 배지는 CSS로 숨김.
- 종합 상가 '장비' 탭을 '무기'/'장비'로 분리(코드에서 슬롯으로 나눔). 숨은 요소를 처음 마치면 전용 칭호와 `hidden` 얼굴 장비를 준다(`state.flags`의 비밀 플래그, 도감·패치노트에는 안 나옴).
- 추가 테스트: `python3 tests/fuzz.py [시드수] [횟수]`(게임 함수 무작위 대량 호출 + 불변 조건: NaN/가방/체력/sanitize 멱등·손실 없음/저장-불러오기 동일), `python3 tests/uifuzz.py [시드수] [클릭수]`(보이는 버튼 무작위 클릭 중 JS 오류 탐지).

## 2026-10-24 버그 수정
- 긴 전투(여러 회차)에서 한 번 지면 남은 회차를 모두 버리고 후퇴하던 규칙 제거(`battleRuns`/`resolveAction`). 진 회차는 보상 없이 부상만 입고 이어가며, HP가 `HP_RETREAT`(20) 이하가 되면 그때 중단. 재로그인·저장 불러오기와는 무관(`state.active`는 그대로 보존됨). 테스트 `battle_loss_does_not_end_long_run`/`battle_long_run_survives_reload`.
- 스테이터스 본문(`#statusBody`)은 스크롤바를 숨긴다(높이를 줄여도 막대가 안 보임).

## 2026-10-24 분해 · 펫 교감
- 본부 '분해'(kind `dismantle`, `openDismantle`): 소지품(착용 제외)의 장비·가방을 `dismantleItem`으로 분해. 재료=레시피 재료의 절반(내림, 최소 1종), 레시피 없는 장비(승급 가방 등)는 크기별 기본 재료, CR=판매가의 1/4(최소 2). 가방이 모자라면 아무것도 바뀌지 않고 거절, 같은 이름의 마지막 1개를 분해하면 그 이름의 강화·세공·이름도 삭제. `hidden` 아이템은 불가.
- 펫 탭: 도감은 눌러야 펼쳐짐(`view.petDexOpen`), 함께 다니는 펫이 맨 위(`petOrder`), 동행 펫은 탐험 보내기 버튼 없음, 돌보기(간식·쓰다듬기·기분 묻기)는 개인실 또는 동행 펫이면 어디서든(`petCareErr`). 쓰다듬기=친밀도 +1, 펫마다 10분(`PET_STROKE_MS`, 저장 `petAt`). 기분 묻기/쓰다듬기는 울음소리+(기분) 한 줄(`petCry`, `petMood`).

## 2026-10-24 (2) 대량 추가
- 타인 프로필 장비: `otherEquipHtml(eq)`(칸 UI, 이름은 ITEMS·슬롯 검증), 서버 `get_profile`에 `equipment` 추가(friends.sql 재실행 필요). `itemLines(name, plain)`은 내 강화·세공 없이 설명.
- 펫 탭 '돌보기'는 `petCareHtml(true)`(동행 펫 카드+펫 목록+탐험 남은 시간). 쓰다듬기 문구 `PET_PAT`(성격별), 기분 묻기 `PET_FEEL` — '(…한 기분을 느끼는 것 같다)'.
- 고기·가죽: 짐승마다 `<이름> 고기/가죽`(data.js `BEAST_*`, 드롭 확률·가격은 예전과 같음), 분류 `MAT_GROUPS['고기'|'가죽'|'두꺼운 가죽']`, 레시피는 분류 이름을 쓴다. 옛 '짐승 고기/가죽'도 같은 분류.
- 오른쪽 탭 '상황'(`state.side` 옛 '주위 대원'은 불러올 때 변환): 접히는 두 칸 `state.sitOpen`, 투두 `state.todos`(`TODO_MAX`=30, `TODO_LEN`=40).
- 숙련 `state.mastery[태그]`(총 숙련도, `MASTERY_*`, `masteryInfo/addMastery/masteryBonus/masteryText`). 채집류는 `claimResult`(r.mast), 제작은 `collectCraft`, 농사는 `harvestPlot`. 보너스: 수확+1 확률/제작 시간/성장·수확/회복량. 상태 3페이지 `masteryPageHtml`.
- 반지 이름 `state.engraves`(아이템 `engrave:true`, `ENGRAVE_MAX`=8, `shownName`). 소지 효과 아이템(`hold`)은 분해 불가.
- 헤더: `seasonOf`(KST 날짜 기준 계절·일차), `altitude`(상공 ≈8,4xx m / 지상 `ZONE_ALT`+칸별 편차), 날씨는 `todayWeather`. 표시만 바뀌고 게임 효과는 날씨만 기존대로.
- 임무: 본부 비일일 임무는 `once`(완수하면 게시판에서 사라지고 4시 리셋 안 됨), 일일 의뢰 12종 중 `dailyQuestIds()` 5개/일, `BOARD_MAX_ACTIVE`=7. 구역 캠프 임무는 예전처럼 반복.
- 단련 레시피는 처음부터 `pick(pool)` 무작위(순서 아님) — 테스트 `train_picks_are_random_not_in_order`.

## 2026-10-23 파티 · 여가구역 · 무기 · 주/부 스탯
- **파티**(서버 기준, `supabase/friends.sql` 전체 재실행 필요): 표 `parties/party_members/party_reqs`, RPC `party_info/invite/answer/leave/kick`. 2~4명, 파티장만 초대(파티가 없으면 첫 초대 때 만들어짐), 파티장이 나가면 먼저 들어온 사람이 승계, 2명 미만이면 해산. `chat_channel('party')`='p<번호>', `propose_trade`는 같은 파티원도 허용. 클라이언트: 전역 `PARTY={id,members,invites}`(core.js, 저장 안 함), `partySync()`(채팅 폴링 20초마다 + friendPoll), 초대는 친구 창·프로필 창의 '파티 초대', 상황 탭 '파티' 칸(수락/거절/내보내기/나가기), 파티원은 상황→주위 대원에 항상 나타나 교환(`ftrade-open`; uid는 `view.partyUid`) 가능, 채팅 탭 '파티'(`CHAT_CH['파티']`).
- **채팅 탭 설정**: `settings.chatTabs`{월드,길드,파티,알림}. 설정의 '채팅창 탭' 스위치(최소 1개), 끈 탭은 숨김·폴링·알림 제외(`chatTabOn`).
- **여가구역**(안전지대, `LEISURE`, kind `leisure`): 6곳 중 하루(오전 4시 기준 `todayIndex`) 한 번 확인창을 거쳐 버프 '여가 · 장소'(해당 스탯 +2, 8시간 `BUFFS[..].ms`). 받은 뒤에는 확인 없이 분위기 묘사만(버프 교체 불가). 파티에 있으면 70% 확률로 파티원 이름이 들어간 묘사(2/3/4인용 따로, `p2/p3/p4`). `state.leisure={day,id}`.
- **무기**: 채찍·빗자루·요요(종합 상가). **장비 묘사**: `WEAPON_LINES`·`SLOT_LINES`(이동 t/전투 b/채집 g/조사 i)를 `equipLine(kind, r)`가 아이템 전용 문장과 섞어 쓰고 `fixJosa`로 조사를 맞춘다. 채집 로그 20%, 조사 30%.
- **이능력 주/부 스탯**: `character.mainStat(+2)/subStat(+1)`(`MAIN_STAT_BONUS/SUB_STAT_BONUS`), 캐릭터 생성 2단계·프로필 수정(24시간 간격 공유)에서 선택, `gearMods`에 반영. 서버 `get_profile`에도 포함.
- **교환은 상대가 접속 중일 때만**: 서버 `presence`(`touch_presence()`를 `chat_fetch`/`party_info`가 부름, 90초 안 신호면 접속 중, `is_online`). `propose_trade`가 오프라인이면 `offline`으로 거절(맡긴 물건은 되돌림), 파티원은 `party_info`의 `online`으로 상황 탭에 '접속 중/오프라인' 표시, 오프라인이면 교환 창이 열리지 않음.

## 2026-10-23 (2) 소소한 개선
- 소모품 사용: 개수 드롭다운 `select#useQty`(기본 1)+회복량 `#useGain`(`useGain/useGainText`). 알림 탭은 이모티콘/주사위 숨김. 개발자(관리자)는 알림 공지 삭제(`delete_notice`, `supabase/admin.sql` 재실행 필요). 업데이트 안내 막대는 새로고침 전까지 유지(`showUpdateBar`).
- 프로필: 쿨타임 중에도 주/부 스탯이 둘 다 비어 있으면 그것만 설정 가능(타이머 불변). 타인 프로필은 이능력이 `.user-card .uc-ability`(오른쪽). 도감 검색 `#codexQ`(발견한 항목만). 펫 돌보기는 비동행 펫도 `editRow`의 가운데 '이름 수정' 버튼으로 개명. 가이드는 9항목으로 통합, 게시글 글자 확대.
- 종합 상가 장비/무기 행에 `착용 위치 · 슬롯` 태그(`.slot-tag`)와 안내문(`.slot-hint`).
- 새 레시피 `NEW_RECIPES3`(data.js, 쓰이는 곳 없던 재료 14종 소진: 요리 5·약 3·장비 6). 약은 `MEDICINES.add`. 테스트 `unused_materials_now_have_recipes`/`new_recipes_valid`.
- 펫 사료(`PET_FOOD`): 길들이기 성공 확률 +`TAME_FOOD_BONUS`(8%p, `tameChance(bait)`, 결과 계산은 `act.bait`), 간식 친밀도 ×`FOOD_BOND_MULT`(1.5, `feedGain`). 먹이 선택 표시도 `feedGain`.
- **RP템 규칙**: RP템(`tags:['RP']`)은 모두 소지만으로 스탯이 붙는다(`hold`). 우정/결혼반지 행운, 노트북 지능, 헝겊인형 의지, 기타 케이스·소중한 사람의 사진 감각(각 +1, 종류마다 1번). 새 RP템도 반드시 `hold`를 넣는다(테스트 `every_rp_item_has_hold_stat`).
- 지도 칸 툴팁(`tileMats`)은 그 칸에 실제로 나타나는 재료·몬스터만 보여 준다(지형 전체 목록은 검색·범례용 `terrainMats`).

## 2026-10-23 (3) 창고 · 칭호 · 실시간 교환 · CR 거래 · A 승급
- 창고 `state.storage`(이름→수량, `STORAGE_KINDS`=60/`STORAGE_STACK`=999, 개인실에서만, `storeItem/takeStored`). 소지품 버리기 `discardItem`.
- 숙련 칭호(제작 계열만: 초보 5 · 숙련 20 · 레전드 30) `MASTERY_RANKS`/`masteryTitleOf`(TITLE_DEFS 33개). 아이템에 도장 찍는 방식이 아니라 칭호.
- 실시간 교환: `state.bench={id,items,cr}`가 맡긴 물건의 기준(늘릴 땐 내 쪽에서 먼저 빼고 서버, 줄일 땐 서버 먼저). `settleLive`가 `state.ltSeen`으로 멱등 정산. 서버 `live_trades`/`live_trade_*`, 상대 물건은 메일(sid `lt<id>`)로 지급.
- 상대 조건(`_lt_near`): 같은 파티(어디서든)/같은 `presence.loc`(둘 다 90초 안 접속). 위치 `locKey()`(던전 `zone:x,y`, 개인실 ''), `nearbyPoll()` 10초마다 `nearby_players` RPC → `view.nearby`(상황 탭 목록). 상단 `#tradeHubBtn`(openTradeHub).
- **교환(실시간 교환대)은 물건만**(CR 칸 없음), `TRADE_DAILY`=3. **거래**=상점가 '대원 간 상점'(ACTIONS kind `market`) + 상단 `#tradeHubBtn` 아이콘(어디서든, `openMarket`). 탭 사기/팔기/내 목록. 교환은 상황 탭 사람/프로필(`viewUser`)의 '교환' 버튼(파티원·같은 칸 대원)으로 시작.
- 거래 구조: 서버 표 `market`(RPC `market_list/browse/mine/buy/cancel/ack`, `friends.sql` 전체 재실행). 올릴 때 물건을 먼저 빼 `state.market.sell`({key,id,item,qty,price=개당,got=정산한 개수})에 기록, 같은 key 로 다시 보내도 한 번만 올라간다(`marketSync`가 60초 friendPoll·창 열 때 재전송/정산). 팔린 개수만큼 `marketNet`(수수료 `MARKET_FEE`=10%)을 CR 로(부분 판매 가능, `got`으로 한 번만), 취소·3일 만료면 남은 개수만 반환(`state.mseen` 멱등). 구매는 사는 사람이 개수를 정하고(`#mkN<id>`), 자리 확인 후 값을 먼저 치르고(`marketBuyStart`→req) 서버 결과 `marketBuyResult(req)`: ok→바로 소지품(자리가 갑자기 없으면 남은 것만 메일), gone/short→환불, 모르면 `state.market.buy`에 남겨 같은 req 로 다시 확인(서버 buy는 멱등, 표 `market_buys`). 가격 한도: 개당 `marketUnitMax`=상점 시세(`tradeValue`)×`MARKET_UNIT_RATIO`(2), 한 건 `MARKET_TOTAL_MAX`(5000), 동시 `MARKET_SLOTS`(5). 이 규칙은 클라이언트 기준(CR 은 세이브 권한).
- A급 승급 `promo_a`(`PROMO_ORDER`에 A), 승급하면 `announce_rank` RPC → 채팅 `sys='rank:A'` 줄(가운데 정렬 `.msg-sys`). 설정은 `applySettingsNow`로 즉시 적용(저장 버튼 없음).

## 2026-10-24 ROOM (개인실 'ROOM' · 프로필 '구경')
- 코드: 상수·가구 정의 data.js 맨 끝 MyHome 블록(`ROOM_*`, `ROOM_GEO`, `FURN`/`defFurn`, 문자 도트 `map` + `FURN_PALETTE`, 칠할 부분 `FURN_MASK`='mno'), 검증 core.js `cleanRoom`(hardenState에서 `state.room`), 화면 js/room.js(index.html에서 ui.js 뒤, build_preview 루프에 포함).
- 방 창 `view.room`: 600×600 무대(창 너비에 맞춰 축소, +/−·휠 확대, 빈 곳 끌기=이동), 500×400 큐브 방. 격자·겹침 금지 없음. 가구 z: 누른/놓은 가구가 같은 층 맨 위(`roomBring`), 벽 소품(layer 'wall')은 항상 바닥 가구 뒤(`roomItemZ`). 편집은 `draft` 복사본, '룸 저장'에서만 `state.room` 반영.
- 가구 편집기(`#rmEd`)는 제목줄로 끌 수 있는 떠 있는 창: 좌우반전/색상변경(마스크 부분만 곱하기)/삭제. 진짜 그림은 def에 `src`+`maskSrc`(PNG)를 주면 문자 도트 대신 쓴다.
- 배경 이미지(10/24 개정): 600×600 JPEG ≤100000자(`ROOM_BG_MAX`/`ROOM_BG_PX`, 넘으면 화질→크기 순으로 낮춤; SQL 제한도 100000, friends.sql이 옛 제한을 alter). 배경은 `.room-bg`(무대 밖 고정 층, 방을 움직여도 안 움직임). 룸 편집/이미지 출력 바는 ROOM 창 오른쪽 위 바깥(`roomBarPlace`), 가구 편집기는 방 이미지 왼쪽 아래에 겹쳐 기본 배치(`R.ed`), 분류 탭은 5개씩 좌우 화살표(`room-tabs`), '벽소품' 분류(clock1/frame1). 옛: 이 기기 `deeplayer-roombg` + 서버 별도 표 `room_bgs`(세이브에 안 실림). CSP가 blob:을 막으므로 FileReader로 data: 읽기. 서버 RPC `set_room_bg/get_my_room_bg/get_room(p_name)`(friends.sql 전체 재실행).
- 구경: `viewUser`의 `otherEquipHtml(eq, name)` 제목줄 오른쪽 '구경'(`room-peek`, 서버 로그인 시) → `peekRoom` → 읽기 전용. 받은 데이터는 `cleanRoom`·`ROOM_BG_RE`로 다시 거른다.
- 테스트: `python3 tests/room_test.py`(단독·빠름), cloud_test의 `room_peek_sanitized`/`room_bg_rpc_roundtrip`.
- ROOM 개편(10/24): 이름 'ROOM', 개인실 선택지 맨 위. 휴식/잠자기는 선택지 하나('휴식')로 합치고 확인창 칩 `rest-mode`로 30분/6시간 선택(ACTIONS 둘은 그대로라 보상 동일). 창은 슬림(`.modal.room`, 편집 아닐 땐 `.solo`). 룸 편집/이미지 출력은 `#roomFloat`(오버레이 직속, 흐린 부분 오른쪽 위 `.room-bar`)에, 가구 편집기 `#rmEd`도 같은 곳에 fixed 로 떠서 화면 어디로든 이동. 확대/축소/중앙은 지도와 같은 `.map-tools`. 가구 목록은 소지품과 같은 `.inv-grid/.slot/.inv-footer`(5×5), 기본 배경 `b_white`(단색). `modal()`/`closeModal()`이 `#roomFloat`을 지운다.
- 가구는 이제 PNG: data.js `ROOM_FURNITURE` 표에 한 줄 + `assets/room/<id>.png`(+색상변경은 `<id>_mask.png`). 방법은 `assets/room/README.md`. 더미 도트 가구는 삭제(옛 저장의 그 가구는 불러올 때 사라진다). 색 없는 PNG는 파일을 그대로 쓰고(file://에서도 보임) 색을 입힐 때만 캔버스(file://에서는 색 없이 폴백). 테스트는 `defFurn`으로 data: PNG 가구를 만들어 쓴다.
- 벽지·바닥·배경도 직접 그린 PNG(각 600×600, 방 무대와 같은 좌표): data.js `ROOM_SKIN_PNG` 표 한 줄 + `assets/room/<id>.png`, 안내 그림 `assets/room/_guide_room.png`(꼭짓점 좌표는 `ROOM_GEO`). PNG가 있으면 SVG `<image>`로 벽지/바닥을 그리고(없으면 색 다각형), 배경은 `.room-bg` img. 내보내기도 같은 순서로 합친다.
- 기본 배경 색은 '하얀 배경'(`b_white`)과 '내 배경 이미지'(`b_custom`) 둘뿐(나머지 색 배경 삭제, 저장된 옛 배경 id는 하얀 배경으로 돌아간다). PNG 배경은 `ROOM_SKIN_PNG`로 추가.

## 2026-10-24 임무 보상 · 가방 가득 참 / ROOM 버튼 순서
- 임무 보상 아이템이 가방에 다 안 들어가면(`questOverflow(q, drop)`; 납품으로 비는 칸 반영, 상태는 안 바꿈) `quest-done`이 바로 완수하지 않고 `openQuestFull`(가방이 가득 찼어요) 창을 띄운다. 소지품 칸(스택)을 고르면 확인창 후 `discardStack`으로 통째로 버리고, 못 담는 보상은 `qfull-drop`(확인창)으로 포기(`view.qfull.drop`)한다. 자리가 생기거나 포기하면 `questFinish(q, drop)` → `completeQuest(id, drop)`. 이 임무의 납품·필요 아이템은 버릴 목록에서 빠진다. 테스트 `python3 tests/qfull_test.py`.
- ROOM 버튼 순서: 이미지 출력, 룸 편집(오른쪽).
- 색상변경은 네이티브 색 입력 대신 편집기 아래에 뜨는 고르개(`#rmPick`, 팔레트+색조/채도/밝기).

## 2026-10-24 파티 동행
- 파티원이 상황 탭 '파티' 칸의 `동행 모드`(`follow-toggle`, `state.follow`)를 켜면 파티장이 움직일 때 자동으로 따라간다(파티장은 스위치 없음, 파티가 없어지거나 내가 파티장이 되면 `partySync`가 끈다). 각자 정상 기력·시간이 든다.
- 파티장은 위치가 바뀔 때만 `partyPlacePush`→`Cloud.setPlace`(RPC `set_place`, `presence.place`)로 올리고, `party_info` 멤버에 `place`가 실려 온다(`friends.sql` 전체 재실행). 위치 문자열: 공중=장소 이름, 지상=`구역:x,y`(`placeNow`). 받은 값은 `parsePlace`가 다시 검증(모르는 구역·벽·글자 거부).
- 따라가기 `followStep(raw)`(core, DOM 없음): 한 번에 한 걸음 — 공중 이동(`travelTo`), 이동장치→`startTrip`(1분), 같은 구역 칸 이동(`startMove`), 미궁 안에서 파티장이 다른 곳이면 입구로 걸어가 `leaveDungeon`. 개인실은 따라가지 않는다. 행동 진행 중/결과 대기/확인창이 열려 있으면 기다리고, 기력 부족 등 오류는 한 번만 알리고 30초 쉰다(`followTick`, ui.js, 매 틱). 켜 있는 동안 파티 확인은 5초마다.
- 테스트: cloud_test.py의 `follow_*`/`leader_*` 항목.
- 동행 개선(10/24): 파티장은 이동을 시작하면 목적지(`타일 이동`=경로 끝 칸, `구역 이동`=그 구역 입구)를 위치로 올려(`placeNow`) 파티원이 함께 출발한다. 지도에서 '밟은 칸'(`state.visited`)은 이제 직접 누른 칸(경로의 끝)과 입구만 친다(`revealAround(d, mark)`); 지나간 칸은 주변이 보이기만 하고(`explored`/`seen`) 흑백 그대로.
- 이동 속도 맞추기(10/24): 모든 파티원이 `partyPlacePush`로 위치·칸당 이동 시간(`stepSec`)·동행 여부를 올리고(RPC `set_place(p_place,p_spd,p_fol)`, 이전 1인자 버전은 SQL이 drop), `party_info` 멤버에 `spd/fol`이 실린다. `paceSec()`: 나(파티장이거나 동행 켬)와 함께 움직이는(파티장이거나 동행 켠, 접속 중) 파티원 중 가장 짧은 칸당 시간을 쓴다(더 느려지지 않고, 10초 미만·60초 초과 값은 무시). `tileSec`/`planMove`가 이 값을 쓴다. 이동속도는 지금 펫(`petSpeed`)에서만 나온다.
- 거래 '사기' 목록(10/24): 올라온 상품을 전부(서버 `market_browse` 최대 300건) 보여 주고 판매자 이름은 내려보내지도 않는다. 내가 올린 상품은 `mine:true`로 같이 보이되 '내 상품' 표시만 있고 구매 버튼은 없다(취소는 '내 목록'). `friends.sql` 재실행 필요.
- 파티 이동(10/24): 파티장은 '파티 이동'(`partymove-toggle`, `state.partyMove`)을 켜야 파티원의 동행이 작동한다. 서버는 기존 `fol`을 그대로 쓴다(`partyFlag()`: 파티장=파티 이동, 파티원=동행) — SQL 변경 없음. `followTick`은 파티장 `fol`이 꺼져 있으면 "파티장이 파티 이동을 켜면 따라가요" 대기, `paceSec`도 파티장이 켠 동안만 맞춘다. 파티가 없거나 파티장이 아니면 `partyMove`는 `partySync`에서 꺼진다.
- 낚시터(10/24): `FISH_SPOTS`(data.js)가 구역마다 지도의 한 칸(x,y)을 낚시터로 지정한다(맵 문자는 그대로 두고 좌표로 덮어씀: 바탕 지형 `base` 위). `spotAt(z,x,y)`, `tileInfo(z,ch,x,y)`(이름·설명 덮어씀), `currentGroups`가 그 칸에서 `sp.ids`(낚시 행동 `제N구역 낚시터 <물고기>`, `spot:true`)를 먼저 보여 줌. 낚시 크기: spot이면 `u=max(난수, 평균 난수)`, 대물(+15%) 확률 `SPOT_BIG` .1(일반 .03). 제3구역은 물이 없어 '열수 뱀장어'(신규 낚시 재료)를 추가. 테스트의 LEGACY 맵 때문에 smoke에서는 `window.__M` 실제 맵으로 바꿔 검사한다. 맵 타일을 바꾸면 FISH_SPOTS 좌표도 확인할 것.
- 제7구역 사막(10/24): `DANGER_ZONES[6]`(n7·level7·tone 'desert'), 지형 5(모래언덕·오아시스·선인장 군락·붉은 바위지대·모래 속 폐허), `MAPS['제7구역']` 17x11, 지도 좌표 (64,74), 신규 재료(석영 모래·선인장·대추야자·사막 유리·오아시스 틸라피아)·작물 사막 수박, `ZONE_REWARD[7]`, `ZONE_SEEDS`, `ZONE_ALT`, `LOST_ITEMS`, `LIT_TITLES`, 캠프 보급소, 낚시터 `FISH_SPOTS`, CSS `--tone-desert`. 구역을 더 늘릴 때 같은 표들을 모두 채울 것.
- '?' 칸·저널(10/24, 히든 — 패치 노트 금지; 묘사 낮·밤 각 7개 100자 안팎, 저널 600자 이상, 전광판 리코 떡밥 2건 포함): `QMARKS`(data.js, 구역별 name/day/night/vday/vnight/journal), 지도 문자 `?`(구역마다 1칸), 행동 `제N구역 시간을 보낸다`(kind 'lounge', 즉시·기력 0), `isNightNow()`(한국 시간 18~06시), `state.lounge`(횟수)·`state.journals`(얻은 저널), `LOUNGE_NEED`=5번째에 저널 획득. 도감 '저널' 탭은 하나라도 얻어야 `codexTabs()`에 나타남. 지도를 고치면 `?` 칸이 길을 막지 않는지 확인.

- **구역을 추가할 때 반드시 함께 넣을 것**: 캠프 보급소 `SHOPS[구역].special`의 특산 장비 1종(`'제N구역 캠프의 특산'` 설명, 장비 슬롯 있음) + 구역 고유 임무(`QUESTS`의 `board:'제N구역'`, 처치 1개·납품 1개, 납품 재료는 그 구역에서 얻을 수 있어야 함). 테스트 `every_zone_has_special_gear_and_own_quests`가 확인한다.
- `view.matPick`은 자동 선택을 `''`로 저장한다. 이 값을 `countItem`에 넘기면 안 된다(예전에 두 번째 제작이 먹통이던 원인). `countItem`은 이제 모르는 이름이면 0.

## 2026-10-24 (3) 내 프로필 보기 · HP 10/클론 · 디버프 · 대원 구조 · 마지막 저널 · 요청 줄이기
- 내 프로필 보기: `viewUser(내 이름)`은 남이 보는 것과 같은 `.user-card`(`myCard()`, 서버 조회 없음, 교환·파티·친구 버튼 없음). 편집 화면 `openProfile`은 왼쪽 위 `#avatarButton`만. 'ROOM 구경' 버튼(`roomPeekBtn`, 나는 `room-self`→`peekMyRoom` 읽기 전용), `.equip-head` 아래 여백.
- 전투: `HP_RETREAT`=10. HP 10 이하에서도 전투 시작 가능하지만 `active.risk`(1회만), 지면 `r.death`(`deathWhy:'battle'`) → `dieAndRebirth`. 확인창에 경고. 지면 적별 디버프 `foeDebuff(이름)`(data.js `FOE_DEBUFF`+`FOE_DEBUFF_WORDS` 추측, 없으면 '부상'): 화상·동상·중독·출혈·감전·혼란. 새 몬스터는 FOE_DEBUFF에 한 줄.
- 설정 → 표시 'UI 기본값으로 되돌리기'(`resetUiDefaults`): layout·collapsed·zoom/pan·fontSize·cursor만.
- 칭호: `.title-strip`(1줄 가로 스크롤, 넘치면 `.ts-arrow` 표시, 마우스 끌기·휠·터치 스와이프, `initTitleStrip`/`titleArrows`).
- 낚시터: 칸 채집 중 낚시터 물고기와 겹치는 낚시 행동은 선택지에서 빼고, 툴팁(`tileMats`)도 중복 제거.
- 분실물(히든): 설명 끝에 캠프 관리인 힌트. `state.lostCount`(돌려준 개수) ≥ `LOST_SAMARITAN`(20) → 칭호 '착한 사마리아인'. 패치노트에 쓰지 않음.
- 펫: 간식 칩 목록 제거. '간식 주기'→`openPetFeed`(고르고 주기), '탐험 보내기'→`openPetSend`(구역+먹이 고르고 보내기, `pet-send-do`). `view.petFrom`으로 돌아갈 곳.
- 서브잡 납품: 납품한 물건 태그 중 서브잡 태그(채집·채굴·낚시 제외)에 `MASTERY_GAIN.job`(1)×개수 숙련.
- 마지막 저널(히든): `allJournals()`(QMARKS 전부, 구역이 늘면 그것까지)이면 도감 저널 끝에 `LAST_JOURNAL`(제목 '저널의 마지막 페이지', 본문+맨 아래 `tail` '보고싶어, 리코.' — 본문과 같은 글씨, `.j-last`는 큰 위 여백만). 모으기 전에는 자리도 안 보임.
- 대원 구조(kind `rescue`, `제N구역 대원 구조`): 지형 칸에 `rescueShown`(입장 시드, `RESCUE_APPEAR` 7%, 구역별 `state.rescueAt` 2시간 쿨다운, 칸별 `dungeon.rs`). `startAction`이 즉시 `mockRound`로 결과를 정해 `state.pending`(`r.rescue.log`)에 두고 UI `openRescueFight`가 한 줄씩 보여 준다(창이 열려 있는 동안 tick은 claim하지 않음, 닫거나 확인하면 받음). 승리=희귀 재료(55%) 또는 CR+감사 인사, 패배=`rescueHpLoss(d)` 1~14, 죽지 않음.
- 요청 줄이기: `POLLS`+`pollTick`(3초마다 확인) 한 곳에서 모든 주기 호출 관리. `pollMode()`='active'(5분 안 조작)/'idle'/'hidden'. 채팅 6초(조용하면 10초)/30초/안 함, 위치(nearby) 바뀔 때만 즉시+30~60초/90초, 교환 15/45초, 친구·메일 60/180/300초, 동기화 60/180초, 공지 5/10분, 파티 20/60초(동행 5초). 동기화는 먼저 `save_head`(rev·기기 번호만)로 확인하고 서버가 더 새로울 때만 `pull_save`(없으면 `_noHead`로 예전 방식). **friends.sql 재실행 필요(save_head 추가).**
- 아이콘 폰트는 opsz 24 고정(`GRAD@24,400,0,0`)으로 받는 크기를 줄였다.
- 미리보기 빌드 `tools/build_preview.py`는 10/24에 게시본과 같게 다시 만든 것(이전 파일 분실). zip에 tools/가 빠지므로 따로 보관할 것.
- 펫 허기(10/24): `p.full`(0~100)·`p.fullAt`·`p.decayAt`. `petFull(p)`=시간에 따라 줄어든 배부름(`PET_FULL_DRAIN_MS` 24h에 100→0), `petFed`=배부름>0(동행 효과·EXP 조건). 간식 `feedFull`(작물 60·펫 사료 90, 하루 2번이면 충분), 배불러도 먹는다(100에서 멈춤). 배가 빈 채 `PET_HUNGRY_MS`(6h)마다 친밀도 -`PET_HUNGRY_BOND`(2) (`petHungerTick`, tick에서, 탐험 중 제외). 옛 펫은 `petHungerOf`가 fedAt으로 변환, 필드가 없는 펫은 petFull이 fedAt 방식으로 계산.
- 이모티콘: '주의'·'잠깐' 삭제(`STICKERS_OLD`로 예전 메시지는 그림 유지), 신남·당황·걱정·잘 자 추가. 브이 손·선글라스·놀란 얼굴은 Material Symbols에 없음(필요하면 CUSTOM_ICONS SVG).
- 스탯 칭호: `state.statPeak`(버프·장비 포함 최고값, `noteStatPeak`은 checkTitles에서) ≥ `STAT_PEAK_NEED`(40) → `STAT_PEAK_TITLES`. 배달의 민족: `state.mailItemSent`(아이템 메일 보낸 수, sendMail) ≥ 20. 이전 발송분은 서버 `my_item_mail_count`(받지 않아 남은 것만)로 한 번 보정(`view.mailBackfill`).
- 숙련 완화(10/24): `MASTERY_NEED`=8+2.4·lv^1.35(만렙 누적 3138, 예전 4504), `MASTERY_GAIN` 수확·납품 2. 숙련은 누적 숙련도로 저장하므로 곡선을 바꾸면 레벨이 다시 계산된다(옛 값이 새 MASTERY_TOTAL보다 크면 만렙에서 잘린다).
- 제작자별 아이템(10/25): 스택 `{n,q,mk?:{제작자:개수}}`(나머지는 이름 없음), 같은 칸을 쓰고 따로 센다. `countItem(n,mk)`/`takeItem`/`removeItem(n,q,mk)`/`addItem(n,q,mk)`(mk 생략=이름 없는 것 먼저), `itemVariants(n)`, 장비 착용 `state.equipMk[슬롯]`, 창고 `state.storageMk`, 메일·교환대·거래소 목록 줄 `[이름,수량,제작자?]`(`ilKey/ilRow`, 서버 `_lt_items_ok` 3칸 허용, `market.mk`·`market_list(p_mk)`). 섞인 칸을 누르면 `openVariantPick`. 옛 `madeBy`는 불러올 때 가진 것에 붙이고 비운다. **hardenState에서 쓰는 헬퍼는 function 선언(TDZ 주의)**.
- 10/25 (2): HUD 스타일(css 끝 블록: `--cut` 잘린 모서리 clip-path + 대각선 테두리 그라데이션, `.bars .bar` skew 20칸, 패널 제목 슬림·mono). 상단 줄 grid(날씨 등 왼쪽·로고 가운데). 퀵슬롯 `state.quick`(QUICK_SLOTS=8)·`renderQuick`(#quickBar, body.has-quick, ≤1200px 숨김, `settings.quickBar`, 우클릭 빼기, `state.quickOpen` 펼치기). 펫 먹이통 `state.petBowl`·`bowlPut/bowlTake/bowlAutoFeed`(비동행 펫, 배부름<40%). 숙련 '운동'(JOB_TAGS, 사냥 승리 `r.mast=['운동',wins]`, `MASTERY_GAIN.hunt`, 공격력 보너스는 effects().atk, 몬스터 드롭 아이템에 '운동' 태그 — data.js 맨 끝). `WIN_DEBUFF` 승리 디버프, `RESCUE_APPEAR` .03, `DANGER_LEVELS` 지도 헤더 위험도, 농장 `plot.told`, 임무↔채팅 `layout.questH` 그립, 제작 헤더 `#craftCount/#craftOnly`, 레시피 검색 `#craftQ`, 별 `.stat-star`, '단련' 표시 이름 '속성학습'(키는 그대로).

## 2026-10-25 HUD · 퀵슬롯 · 먹이통 · 운동 숙련 외
- HUD 스타일: style.css 끝의 'HUD 스타일 (시안 B)' 블록이 색은 두고 모양만 바꾼다(`--cut`/`--cut-s` 잘린 모서리, 패널은 clip-path + 대각선 배경, 바는 기울어진 20칸, 지도 노드 마름모). 채팅 단말기·퀵슬롯도 같은 모양.
- 퀵슬롯 `#quickBar`(state.quick 8칸·`quickSet/quickClear`, 클릭=1개 사용, 우클릭=빼기, 소리 3개 토글, 펼치기 `state.quickOpen`, 설정 `settings.quickBar`, ≤1200px 숨김). 먹이통 `state.petBowl`(`bowlAutoFeed`), 운동 숙련(사냥 승리 `MASTERY_GAIN.hunt`, 드롭 아이템 '운동' 태그), 승리 디버프 `WIN_DEBUFF`, SOS `RESCUE_APPEAR` .03, 지도 헤더 위험도(`DANGER_LEVELS`), 임무↔채팅 높이(`layout.questH`), 농장 알림 `plot.told`, '단련' 표시 이름은 '속성학습'(ACTIONS 키는 그대로).
- HUD 보정(10/25): 탭 제목은 원래 글씨·높이 34px 통일·강조줄 없음, 대각선 테두리는 남는 쪽에 그림, HP바는 기울어진 20칸(합성 레이어 skew로 계단 없이, px 칸), 작은 버튼·탭·칩·채팅 화면·퀵슬롯도 잘린 모서리 + 잘린 자리 테두리 선(background-origin:border-box), 퀵슬롯 위쪽(top 78px), 시간·날씨 아래 정렬, 지도: 휠 확대·축소 + 빈 곳 왼쪽 끌기 이동(타일·노드 클릭은 그대로).
- HUD 테두리 정밀(10/25): 패널·창은 배경=테두리색 + ::before 안쪽 도형(--icut = cut-0.59px, 단말기 2px은 -1.17px)으로 대각선도 1px. 작은 버튼은 1px 그라데이션 선. 안전지대 지도 노드는 원래 동그라미. 퀵슬롯 여백 .app padding-right 58px.
