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
- 숙련 10/20/30 칭호 `MASTERY_RANKS`/`masteryTitleOf`(TITLE_DEFS 33개). 아이템에 도장 찍는 방식이 아니라 칭호.
- 실시간 교환: `state.bench={id,items,cr}`가 맡긴 물건의 기준(늘릴 땐 내 쪽에서 먼저 빼고 서버, 줄일 땐 서버 먼저). `settleLive`가 `state.ltSeen`으로 멱등 정산. 서버 `live_trades`/`live_trade_*`, 상대 물건은 메일(sid `lt<id>`)로 지급.
- 상대 조건(`_lt_near`): 같은 파티(어디서든)/같은 `presence.loc`(둘 다 90초 안 접속). 위치 `locKey()`(던전 `zone:x,y`, 개인실 ''), `nearbyPoll()` 10초마다 `nearby_players` RPC → `view.nearby`(상황 탭 목록). 상단 `#tradeHubBtn`(openTradeHub).
- CR 거래: 한쪽만(`both_cr` 거절), 한도 `tradeCrLimit`=받는 물건 `tradeValue`(상점 최저 구매가, 없으면 판매가×2)×`TRADE_CR_RATE`(1.5), 최대 `TRADE_CR_MAX`(3000). 규칙은 클라이언트 기준(세이브가 클라이언트 권한). `TRADE_DAILY`=3. `friends.sql` 전체 재실행 필요.
- A급 승급 `promo_a`(`PROMO_ORDER`에 A), 승급하면 `announce_rank` RPC → 채팅 `sys='rank:A'` 줄(가운데 정렬 `.msg-sys`). 설정은 `applySettingsNow`로 즉시 적용(저장 버튼 없음).
