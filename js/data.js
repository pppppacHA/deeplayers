/* ==========================================================
   data.js - 게임 콘텐츠 정의 (로직 없음)
   새 아이템/지역/행동/레시피/버프는 여기에만 추가한다.
   ========================================================== */

/* ---------- 상수 ---------- */
const SAVE_KEY = 'deeplayer-ui';
const SAVE_VERSION = 8;        // 저장 구조가 바뀌면 올린다 (이전 버전 저장은 무시됨)
const DEFAULT_LOCATION = '본부';
const BASE_BAG_CAPACITY = 24;  // 기본 가방 칸 수 (장비/소모품/재료 합계)
const PAGE_SIZE = 24;          // 인벤토리 한 페이지 칸 수
const STACK_MAX = 99;
const CYCLE_SEC = [300, 480];  // 전투 1회 소요 시간(초): 5~8분 중 무작위
const GATHER_SEC = 300;        // 채집·채굴·낚시 1회 소요 시간(초): 5분 고정
const MULTI_OPTIONS = [{ label: '1회', sec: 0 }, { label: '30분', sec: 1800 }, { label: '1시간', sec: 3600 }, { label: '4시간', sec: 14400 }]; // 다중행동
const DUNGEON_STEP_SEC = 180;  // 지상 안에서 타일 1칸 이동 시간(초): 3분 (험난한 지형은 더 걸린다). 지도(구역 간) 이동은 시간이 걸리지 않는다
const INVESTIGATE_SP = 1;      // 조사(즉시) 기력 소모
const HP_RETREAT = 20;         // HP가 이 값 이하면 반복 행동 중단/전투 시작 불가
const BUFF_MS = 5 * 60 * 1000;
const MAX_LEVEL = 30;
const MOVE_SP_SAFE = 0;        // 공중(안전구역)끼리 이동은 기력이 들지 않는다
const MOVE_SP_DANGER = 5;      // 지상으로/에서 이동할 때 기력 소모 (시간은 걸리지 않는다)
const REST_SP = 10;            // 휴식으로 회복되는 기력
const BGM_FILE = 'audio/bgm.mp3'; // 배경음악 파일. 로드에 실패하면 내장 앰비언트 음이 재생된다
const BGM_DEFAULT_VOLUME = 25;
const FONT_SCALES = { s: 0.92, m: 1, l: 1.15, xl: 1.3 }; // 글자 크기 배율 (설정 > 표시)
const COLLAPSE_LOSS = .1, COLLAPSE_LOSS_MAX = 80; // 쓰러져 구조될 때 잃는 CR (보유액의 10%, 최대 80)
const BATTLE_HIT = .03;       // 몬스터가 한 번 공격할 때 맞을 기본 확률 (민첩으로 줄어든다). 전투 한 번에 여러 번 공격하므로 '한 번이라도 다칠' 확률은 이보다 훨씬 높다
const BATTLE_HP_CAP = 4;      // 일반 전투 1회에서 잃는 HP 상한. 특별한 전투는 몬스터에 hpCap을 따로 지정한다
const ZONE_TRIP_SEC = 60;     // 이동장치에서 위험구역(지상)으로 내려가는 데 걸리는 시간(초): 1분
const DUNGEON_STEP_SP = 1;     // 미궁에서 한 칸 이동할 때 기력 소모

/* ---------- 장비 슬롯 ---------- */
const EQUIP_SMALL = ['머리', '상의', '하의', '장갑', '신발', '얼굴', '귀', '목', '손 1', '손 2'];
const EQUIP_BIG = ['무기', '가방']; // 장비 영역 오른쪽에 크게 표시
const EQUIP_SLOTS = [...EQUIP_SMALL, ...EQUIP_BIG];

/* ---------- 스탯: fx = [효과 키, 이름, 부호, 단위] (수치는 core.js effects()), tip = 설명 ---------- */
const STAT_DEFS = [ // 스탯당 보너스 1개 (행동 시간·경험치에는 영향을 주지 않는다. 제작 시간만 예외)
  { key: 'str', name: '근력', en: 'STR', fx: [['bgreat', '전투 대성공 확률', '+', '%p']], tip: '전투 대성공 시 전리품을 2개 얻습니다.' },
  { key: 'agi', name: '민첩', en: 'AGI', fx: [['evade', '전투 중 다칠 확률', '-', '%p']], tip: '전투에서 공격을 맞아 다칠 확률이 줄어듭니다.' },
  { key: 'int', name: '지능', en: 'INT', fx: [['ggreat', '채집 대성공 확률', '+', '%p']], tip: '채집 대성공 시 재료를 2개 채집합니다.' },
  { key: 'wil', name: '의지', en: 'WIL', fx: [['rare', '희귀 채집 확률', '+', '%p']], tip: '채집·조사에서 희귀한 재료가 나올 확률이 늘어납니다.' },
  { key: 'sen', name: '감각', en: 'SEN', fx: [['craftTime', '제작 시간', '-', '%']], tip: '아이템 제작에 걸리는 시간이 줄어듭니다.' },
  { key: 'luk', name: '행운', en: 'LUK', fx: [['craftGreat', '제작 대성공 확률', '+', '%p']], tip: '제작 대성공 시 아이템이 2개 만들어집니다.' }
];
const STAT_BASE = 0, STAT_POOL = 12, STAT_CAP = 12; // 캐릭터 생성: 모든 스탯은 0에서 시작해 12포인트를 자유롭게 나눈다(한 스탯에 몰아도 됨)
const AGE_MIN = 10, AGE_MAX = 60; // 캐릭터 나이 범위

/* ---------- 아이템 ----------
   tab: 장비/소모품/재료, slot: 장착 슬롯, mods: 스탯 보정, atk: 무기 공격력,
   capacity: 가방 수용량, use: 사용 효과(hp/sp) */
const ITEMS = {};
const defItems = (tab, rows) => rows.forEach(([name, icon, desc, extra]) => { ITEMS[name] = { tab, icon, desc, ...extra }; });

defItems('장비', [
  ['정찰용 바이저', 'visibility', '주변의 미약한 에너지 반응을 시야에 표시하는 정찰용 바이저.', { slot: '얼굴', mods: { sen: 2 } }],
  ['경량 방탄복', 'shield', '가볍고 기동성이 좋은 도시 방위대 지급 방탄복.', { slot: '상의', mods: { wil: 3 } }],
  ['전술 장갑', 'back_hand', '그립력을 높인 전술 장갑. 장비 조작이 한결 정확해진다.', { slot: '장갑', mods: { str: 1 } }],
  ['자력 부츠', 'steps', '금속 플랫폼에 밀착되는 자력 부츠. 낙하 위험을 줄여 준다.', { slot: '신발', mods: { agi: 2 } }],
  ['확장형 전술 가방', 'backpack', '장착하면 인벤토리 수용량이 48칸으로 늘어납니다.', { slot: '가방', capacity: 48 }],
  ['정찰 배낭', 'backpack', 'E등급 승급 보상. 장착하면 인벤토리 수용량이 32칸으로 늘어납니다.', { slot: '가방', capacity: 32 }],
  ['원정 배낭', 'backpack', 'D등급 승급 보상. 장착하면 인벤토리 수용량이 40칸으로 늘어납니다.', { slot: '가방', capacity: 40 }],
  ['플라즈마 블레이드', 'swords', '등급 B · 공격력 +12. 고온 플라즈마 날을 형성하는 근접 무기.', { slot: '무기', atk: 12 }],
  ['이끼 위장 망토', 'checkroom', '제1구역 캠프의 특산 장비. 숲에 녹아드는 위장 망토.', { slot: '목', mods: { agi: 2 } }],
  ['해무 고글', 'visibility', '제2구역 캠프의 특산 장비. 안개 낀 해안에서도 시야가 또렷하다.', { slot: '얼굴', mods: { sen: 3 } }],
  ['방열 장갑', 'back_hand', '제3구역 캠프의 특산 장비. 화산의 열기를 막아 주는 장갑.', { slot: '장갑', mods: { wil: 2, str: 1 } }]
]);
defItems('장비', [ // 튜토리얼 끝에 하나 고르는 F등급 무기 (성능은 모두 같다)
  ['훈련용 검', 'swords', '등급 F · 공격력 +3. 균형이 잘 잡힌 기본 장검.', { slot: '무기', atk: 3, weapon: '검' }],
  ['훈련용 단검', 'content_cut', '등급 F · 공격력 +3. 가볍고 빠른 단검.', { slot: '무기', atk: 3, weapon: '단검' }],
  ['훈련용 창', 'north_east', '등급 F · 공격력 +3. 리치가 긴 창.', { slot: '무기', atk: 3, weapon: '창' }],
  ['훈련용 활', 'target', '등급 F · 공격력 +3. 멀리서 쏘는 단궁.', { slot: '무기', atk: 3, weapon: '활' }],
  ['훈련용 너클', 'sports_mma', '등급 F · 공격력 +3. 주먹에 끼는 금속 너클.', { slot: '무기', atk: 3, weapon: '너클' }],
  ['훈련용 권총', 'water_pistol', '등급 F · 공격력 +3. 소음기가 달린 소형 권총.', { slot: '무기', atk: 3, weapon: '총' }]
]);
defItems('소모품', [
  ['응급 키트', 'medical_services', 'HP를 30 회복합니다.', { use: { hp: 30 } }],
  ['건조 식량', 'lunch_dining', '기력을 25 회복합니다.', { use: { sp: 25 } }],
  ['수분 팩', 'water_drop', '기력을 15 회복합니다.', { use: { sp: 15 } }]
]);
defItems('소모품', [ // 농장 작물로 만드는 음식 / 상점 상품 / 펫 먹이
  ['구운 감자', 'bakery_dining', '기력을 20 회복합니다.', { use: { sp: 20 } }],
  ['야채 수프', 'soup_kitchen', 'HP를 15, 기력을 30 회복합니다.', { use: { hp: 15, sp: 30 } }],
  ['허브 차', 'emoji_food_beverage', 'HP를 20, 기력을 10 회복합니다.', { use: { hp: 20, sp: 10 } }],
  ['고급 응급 키트', 'medical_information', 'HP를 70 회복합니다.', { use: { hp: 70 } }],
  ['운송장치', 'local_shipping', '메일에 아이템을 담아 보낼 때 1개 소모됩니다. (아이템 없이 글만 보내는 메일은 필요 없음)', {}],
  ['펫 사료', 'pets', '펫에게 먹이면 든든함이 24시간 유지되고 친밀도가 크게 오릅니다.', { feed: 15 }]
]);
/* 농장: 씨앗(seed) → 작물(crop). grow = 자라는 시간(분), yield = 수확량 범위, feed = 펫에게 먹였을 때 친밀도 */
const CROPS = {
  '감자': { seed: '감자 씨앗', grow: 30, yield: [3, 4], feed: 5, icon: 'potted_plant', desc: '밭에서 키운 감자. 구워 먹거나 펫에게 줄 수 있다.' },
  '허브': { seed: '허브 씨앗', grow: 40, yield: [3, 4], feed: 6, icon: 'grass', desc: '향이 좋은 허브. 차를 끓이거나 약을 만드는 데 쓴다.' },
  '사탕무': { seed: '사탕무 씨앗', grow: 60, yield: [3, 5], feed: 8, icon: 'spa', desc: '달고 단단한 사탕무. 펫이 좋아한다.' },
  '야생 열매': { seed: '야생 열매 씨앗', grow: 90, yield: [3, 5], feed: 10, icon: 'nutrition', desc: '제1구역 숲에서 얻은 씨앗으로 키운 열매.' },
  '해풍 콩': { seed: '해풍 콩 씨앗', grow: 120, yield: [3, 5], feed: 11, icon: 'egg', desc: '제2구역 해안에서 얻은 씨앗으로 키운 콩.' },
  '화산 고추': { seed: '화산 고추 씨앗', grow: 180, yield: [4, 5], feed: 14, icon: 'local_fire_department', desc: '제3구역 화산 지대에서 얻은 씨앗으로 키운 매운 고추.' },
  '협곡 보리': { seed: '협곡 보리 씨앗', grow: 210, yield: [4, 5], feed: 16, icon: 'grain', desc: '제4구역 협곡에서 얻은 씨앗으로 키운 단단한 보리.' },
  '설원 순무': { seed: '설원 순무 씨앗', grow: 240, yield: [4, 6], feed: 18, icon: 'ac_unit', desc: '제5구역 설원에서 얻은 씨앗으로 키운 달고 아삭한 순무.' }
};
defItems('재료', Object.entries(CROPS).flatMap(([name, c]) => [
  [c.seed, 'psychiatry', `농장에 심으면 ${c.grow}분 뒤 ${name}을(를) ${c.yield[0]}~${c.yield[1]}개 수확합니다.`, { seed: name }],
  [name, c.icon, c.desc, { crop: true, feed: c.feed }]
]));
defItems('재료', [
  ['합금 파편', 'hexagon', '도시 외벽에서 떨어져 나온 합금 조각.'],
  ['광물 코어', 'diamond', '미약한 에너지를 띠는 광물 덩어리.'],
  ['생체 섬유', 'eco', '질긴 식물 섬유.'],
  ['목재', 'forest', '숲에서 얻은 단단한 목재.'],
  ['약초', 'grass', '상처 치료에 쓰이는 약초.'],
  ['석재', 'landscape', '건축과 제작에 쓰이는 돌.'],
  ['철광석', 'terrain', '정련하면 금속이 되는 광석.'],
  ['민물고기', 'set_meal', '호수에서 잡은 물고기.'],
  ['수초', 'spa', '물가에서 자라는 풀.'],
  ['조개껍데기', 'beach_access', '백사장에서 주운 단단한 껍데기.'],
  ['소금', 'grain', '바닷가에서 얻은 천연 소금.'],
  ['바닷물고기', 'phishing', '바다에서 잡은 물고기.'],
  ['해초', 'waves', '바다에서 건진 해초.'],
  ['갯벌 조개', 'egg_alt', '갯벌에서 캔 조개.'],
  ['점토', 'circle', '갯벌 깊은 곳의 진흙 점토.'],
  ['화강암', 'filter_hdr', '산에서 캐낸 단단한 암석.'],
  ['고산 약초', 'nutrition', '고지대에서만 자라는 약초.'],
  ['흑요석', 'change_history', '용암이 식어 만들어진 검은 유리질 돌.'],
  ['유황', 'science', '화산 지대에서 나는 노란 광물.'],
  ['화염 결정', 'local_fire_department', '열기를 머금은 붉은 결정.'],
  ['사암', 'layers', '협곡 절벽에서 떨어져 나온 붉은 사암.'],
  ['구리 광석', 'terrain', '푸른 녹이 낀 구리 광석.'],
  ['협곡 송어', 'set_meal', '차가운 협곡 급류에서 잡은 송어.'],
  ['협곡 허브', 'grass', '그늘진 협곡 틈에서 자란 향이 강한 풀.'],
  ['동굴 버섯', 'nutrition', '동굴 벽에서 자라는 희미하게 빛나는 버섯.'],
  ['수정 원석', 'diamond', '동굴 깊은 곳에서 자란 맑은 수정.'],
  ['얼음 조각', 'ac_unit', '녹지 않는 단단한 얼음 조각.'],
  ['서리 결정', 'severe_cold', '냉기를 머금은 푸른 결정.'],
  ['빙어', 'phishing', '얼음 구멍으로 낚은 작은 물고기.'],
  ['설산 약초', 'nutrition', '눈 속에서 피는 약초.'],
  ['서리 이끼', 'spa', '얼어붙은 바위에 붙어 자라는 이끼.']
]);

/* 채집 방식: 재료마다 얻는 방법이 정해져 있다. 칸의 재료에 따라 채집/채굴/낚시 선택지가 나뉜다 */
const GATHER_KINDS = { '채집': 'eco', '채굴': 'hardware', '낚시': 'phishing' };
/* 채집 선택지 문구: 재료마다 '무엇을 어떻게 하는지'가 다르다. 칸마다 이 중 0~2개가 무작위로 나타난다 */
const GATHER_VERBS = {
  '생체 섬유': '덩굴을 베어 섬유를 거둔다', '목재': '나무를 벤다', '약초': '약초를 캔다', '수초': '물풀을 건져 올린다', '조개껍데기': '모래밭에서 껍데기를 줍는다',
  '해초': '파도에 밀린 해초를 건진다', '갯벌 조개': '갯벌을 파헤쳐 조개를 캔다', '고산 약초': '바위틈의 약초를 딴다',
  '합금 파편': '잔해 더미를 뒤진다', '광물 코어': '광맥을 곡괭이로 두드린다', '석재': '바위를 깨뜨린다', '철광석': '철광석을 캐낸다', '소금': '소금 결정을 긁어모은다',
  '점토': '진흙을 퍼 올려 점토를 얻는다', '화강암': '암벽에서 화강암을 떼어낸다', '흑요석': '식은 용암에서 흑요석을 깬다', '유황': '분기공에서 유황을 긁어낸다', '화염 결정': '열기가 남은 결정을 캐낸다',
  '민물고기': '호수에 낚싯줄을 드리운다', '바닷물고기': '파도 너머로 낚싯대를 던진다',
  '사암': '붉은 사암을 깎아낸다', '구리 광석': '푸른 녹이 낀 구리 광석을 캔다', '협곡 송어': '급류에 낚싯줄을 던진다', '협곡 허브': '바위 그늘의 풀을 뜯는다', '동굴 버섯': '동굴 벽의 버섯을 딴다', '수정 원석': '수정 줄기를 조심스레 떼어낸다',
  '얼음 조각': '얼음을 깨서 조각을 얻는다', '서리 결정': '서리 낀 암벽에서 결정을 캐낸다', '빙어': '얼음 구멍에 낚싯줄을 드리운다', '설산 약초': '눈을 헤치고 약초를 딴다', '서리 이끼': '언 바위의 이끼를 긁어모은다'
};
/* 행동 확률: 모든 행동은 빈손일 수도, 다치지 않을 수도 있다 */
const GATHER_FIND = .8;        // 채집·채굴·낚시 1회에서 재료를 얻을 기본 확률 (같은 행동 반복 시 더 낮아짐)
const BATTLE_MAT = .65;        // 전투 승리 시 지형 재료를 얻을 확률
const INVEST_ITEM = .35, INVEST_HURT = .06, INVEST_HURT_HP = [1, 2]; // 조사: 물건 발견 / 함정 확률
const TRAVEL_FIND = .015;      // 타일 한 칸을 지날 때 길가에서 재료를 주울 확률 (아주 낮다)
const EVENT_RESET_MS = 12 * 3600 * 1000; // 이벤트 지점은 이 시간이 지나면 다시 이벤트가 생긴다
const ROUGH_EXTRA_SEC = [0, 120, 180];   // 험난한 지형(1) 칸은 이동이 2분 더, 더 험난한 지형(2)은 3분 더 걸린다
const GATHER_COUNT_ODDS = [[.15, 0], [.65, 1], [1, 2]]; // 한 칸에 나타나는 채집 선택지 수: 0개 15% / 1개 50% / 2개 35%
const REPEAT_FREE = 3, REPEAT_RESET_SEC = 12 * 3600; // 같은 행동 4번째부터 아이템 획득 확률 저하 / 12시간 뒤 횟수 초기화
Object.entries({ '채집': ['생체 섬유', '목재', '약초', '수초', '조개껍데기', '해초', '갯벌 조개', '고산 약초', '협곡 허브', '동굴 버섯', '설산 약초', '서리 이끼'], '채굴': ['합금 파편', '광물 코어', '석재', '철광석', '소금', '점토', '화강암', '흑요석', '유황', '화염 결정', '사암', '구리 광석', '수정 원석', '얼음 조각', '서리 결정'], '낚시': ['민물고기', '바닷물고기', '협곡 송어', '빙어'] })
  .forEach(([how, names]) => names.forEach(n => { ITEMS[n].how = how; }));

/* ---------- 판매가 / 태그 ----------
   sell = 상점에 팔 때 받는 CR (없으면 판매 불가). 제작·농사로 이득이 나지 않도록 구입가·재료값보다 낮다.
   tags = 서브잡 납품 태그. 같은 태그를 가진 아이템만 그 서브잡에 납품할 수 있다. */
defItems('재료', [ // 몬스터 드롭
  ['짐승 고기', 'kebab_dining', '짐승에게서 얻은 날고기. 구워 먹으면 기력이 돌아온다.'],
  ['짐승 가죽', 'checkroom', '손질하면 쓸 만한 질긴 가죽.'],
  ['두꺼운 가죽', 'layers', '제3구역 짐승의 두껍고 단단한 가죽.'],
  ['이능 조직', 'bubble_chart', '이능 몬스터의 몸에서 떨어진 미약하게 빛나는 조직.']
]);
defItems('소모품', [ // 기력 보충용 요리 / 귀환 아이템
  ['육포', 'kebab_dining', '기력을 28 회복합니다.', { use: { sp: 28 } }],
  ['구운 고기', 'outdoor_grill', 'HP를 5, 기력을 35 회복합니다.', { use: { hp: 5, sp: 35 } }],
  ['고기 수프', 'ramen_dining', 'HP를 20, 기력을 45 회복합니다.', { use: { hp: 20, sp: 45 } }],
  ['생선 구이', 'set_meal', 'HP를 5, 기력을 28 회복합니다.', { use: { hp: 5, sp: 28 } }],
  ['해물 찜', 'rice_bowl', '기력을 38 회복합니다.', { use: { sp: 38 } }],
  ['매운 고기 볶음', 'local_fire_department', 'HP를 10, 기력을 55 회복합니다.', { use: { hp: 10, sp: 55 } }],
  ['에너지 젤', 'water_bottle', 'HP를 10, 기력을 30 회복합니다.', { use: { hp: 10, sp: 30 } }],
  ['귀환 신호기', 'flight_land', '사용하면 어디서든 본부로 즉시 귀환합니다. 미궁 안에서도 쓸 수 있지만 진행 중인 행동이 있으면 쓸 수 없습니다.', { use: { warp: true } }]
]);
defItems('장비', [ // 가죽 제작 장비
  ['가죽 장갑', 'back_hand', '짐승 가죽을 덧댄 장갑. 손에 착 감긴다.', { slot: '장갑', mods: { str: 1, agi: 1 } }],
  ['가죽 부츠', 'steps', '가죽으로 만든 가벼운 부츠.', { slot: '신발', mods: { agi: 1, sen: 1 } }],
  ['가죽 조끼', 'checkroom', '두꺼운 가죽을 겹쳐 만든 조끼.', { slot: '상의', mods: { wil: 2, str: 1 } }]
]);
defItems('장비', [ // 단련으로 레시피를 배워 만드는 장비
  ['가죽 모자', 'checkroom', '질긴 가죽을 덧댄 모자.', { slot: '머리', mods: { wil: 1, sen: 1 } }],
  ['가죽 하의', 'checkroom', '가죽으로 기운 튼튼한 하의.', { slot: '하의', mods: { agi: 1, wil: 1 } }],
  ['약초 팔찌', 'circle', '약초 향이 배어 있는 팔찌.', { slot: '손 2', mods: { wil: 1, luk: 1 } }],
  ['구리 반지', 'trip_origin', '구리로 만든 소박한 반지.', { slot: '손 1', mods: { str: 1, luk: 1 } }],
  ['철판 흉갑', 'shield', '합금 철판을 덧댄 묵직한 흉갑.', { slot: '상의', mods: { wil: 3, str: 1 } }],
  ['수정 귀걸이', 'diamond', '수정으로 만든 귀걸이.', { slot: '귀', mods: { sen: 2, luk: 1 } }],
  ['얼음 목걸이', 'ac_unit', '서리 결정이 박힌 차가운 목걸이.', { slot: '목', mods: { int: 2, wil: 1 } }],
  ['방한 코트', 'checkroom', '두꺼운 가죽과 이끼로 보온한 코트.', { slot: '상의', mods: { wil: 3, agi: 1 } }],
  ['합금 장검', 'swords', '등급 E · 공격력 +6. 합금 파편으로 벼린 장검.', { slot: '무기', atk: 6 }],
  ['구리 창', 'north_east', '등급 D · 공격력 +8. 구리 날을 단 창.', { slot: '무기', atk: 8 }],
  ['수정 너클', 'sports_mma', '등급 D · 공격력 +9. 수정을 박은 너클.', { slot: '무기', atk: 9 }]
]);
defItems('소모품', [
  ['협곡 송어 구이', 'set_meal', 'HP를 8, 기력을 40 회복합니다.', { use: { hp: 8, sp: 40 } }],
  ['버섯 스튜', 'ramen_dining', 'HP를 15, 기력을 50 회복합니다.', { use: { hp: 15, sp: 50 } }]
]);
defItems('장비', [ // 보석·광물로 만드는 장비 (단련으로 레시피 습득)
  ['흑요석 팔찌', 'circle', '검은 유리질의 흑요석을 갈아 만든 팔찌.', { slot: '손 2', mods: { str: 2, agi: 1 } }],
  ['흑요석 귀걸이', 'diamond', '날카롭게 깎은 흑요석 귀걸이.', { slot: '귀', mods: { agi: 2, luk: 1 } }],
  ['수정 머리띠', 'self_improvement', '수정 조각을 엮어 만든 머리띠. 생각이 맑아진다.', { slot: '머리', mods: { int: 2, sen: 1 } }],
  ['얼음 장갑', 'back_hand', '얼음 조각을 덧댄 서늘한 장갑.', { slot: '장갑', mods: { str: 1, int: 2 } }],
  ['화염석 반지', 'circle', '화염 결정을 박은 뜨거운 반지.', { slot: '손 1', mods: { str: 2, wil: 1 } }],
  ['화염 목걸이', 'local_fire_department', '화염 결정이 타오르는 목걸이.', { slot: '목', mods: { str: 2, wil: 1 } }],
  ['서리 수정 고글', 'visibility', '서리 결정과 수정 렌즈를 단 고글.', { slot: '얼굴', mods: { sen: 2, int: 1 } }],
  ['유황 장화', 'steps', '유황 가루를 먹여 질기게 만든 장화.', { slot: '신발', mods: { agi: 2, wil: 1 } }],
  ['흑요석 흉갑', 'shield', '흑요석 판을 덧댄 단단한 흉갑.', { slot: '상의', mods: { wil: 3, str: 1 } }],
  ['흑요석 단검', 'swords', '등급 D · 공격력 +7. 흑요석을 갈아 만든 날카로운 단검.', { slot: '무기', atk: 7 }],
  ['화염 장검', 'swords', '등급 D · 공격력 +10. 화염 결정이 박혀 열기를 내뿜는 장검.', { slot: '무기', atk: 10 }],
  ['서리 수정 지팡이', 'north_east', '등급 D · 공격력 +9. 서리 결정과 수정이 박힌 지팡이.', { slot: '무기', atk: 9 }]
]);
const SELL_PRICES = { '합금 파편': 4, '광물 코어': 9, '생체 섬유': 3, '목재': 3, '약초': 3, '석재': 3, '철광석': 4, '민물고기': 4, '수초': 2, '조개껍데기': 3, '소금': 4, '바닷물고기': 6, '해초': 3,
  '갯벌 조개': 4, '점토': 4, '화강암': 5, '고산 약초': 6, '흑요석': 8, '유황': 8, '화염 결정': 18, '사암': 6, '구리 광석': 9, '협곡 송어': 8, '협곡 허브': 8, '동굴 버섯': 9, '수정 원석': 20, '얼음 조각': 10, '서리 결정': 22, '빙어': 9, '설산 약초': 11, '서리 이끼': 8, '협곡 보리': 14, '설원 순무': 18, '협곡 보리 씨앗': 10, '설원 순무 씨앗': 12,
  '감자': 4, '허브': 5, '사탕무': 6, '야생 열매': 7, '해풍 콩': 8, '화산 고추': 12, '감자 씨앗': 2, '허브 씨앗': 3, '사탕무 씨앗': 4, '야생 열매 씨앗': 5, '해풍 콩 씨앗': 6, '화산 고추 씨앗': 8,
  '건조 식량': 4, '수분 팩': 2, '응급 키트': 8, '구운 감자': 6, '야채 수프': 8, '허브 차': 8, '고급 응급 키트': 18, '펫 사료': 10, '운송장치': 12,
  '짐승 고기': 5, '짐승 가죽': 6, '두꺼운 가죽': 10, '이능 조직': 8, '육포': 6, '구운 고기': 7, '고기 수프': 11, '생선 구이': 7, '해물 찜': 10, '매운 고기 볶음': 13, '에너지 젤': 8, '귀환 신호기': 18, '가죽 장갑': 18, '가죽 부츠': 20, '가죽 조끼': 30, '가죽 모자': 20, '가죽 하의': 26, '약초 팔찌': 14, '구리 반지': 20, '철판 흉갑': 30, '수정 귀걸이': 42, '얼음 목걸이': 48, '방한 코트': 44, '합금 장검': 20, '구리 창': 34, '수정 너클': 70, '협곡 송어 구이': 11, '버섯 스튜': 20,
  '정찰용 바이저': 100, '경량 방탄복': 120, '전술 장갑': 60, '자력 부츠': 80, '이끼 위장 망토': 100, '해무 고글': 110, '방열 장갑': 120 };
Object.entries(SELL_PRICES).forEach(([n, v]) => { ITEMS[n].sell = v; });
const JOB_TAGS = [ // 서브잡 태그: 아이콘과 설명 (버프는 core.js jobFx)
  ['요리', 'restaurant', '음식 소모품의 회복량이 늘어납니다.'], ['목공', 'carpenter', '제작 시간이 줄어듭니다.'], ['재봉', 'checkroom', '제작 시간이 줄어듭니다.'],
  ['대장', 'hardware', '제작 시간이 줄어듭니다.'], ['가죽공예', 'content_cut', '제작 시간이 줄어듭니다.'], ['보석공예', 'auto_awesome', '제작 시간이 줄어듭니다.'], ['채집', 'eco', '채집으로 얻는 재료가 늘어날 수 있습니다.'], ['채굴', 'diamond', '채굴로 얻는 재료가 늘어날 수 있습니다.'],
  ['낚시', 'phishing', '낚시로 얻는 재료가 늘어날 수 있습니다.'], ['약학', 'medication', '약·응급 키트의 회복량이 늘어납니다.'], ['농사', 'agriculture', '작물이 빨리 자라고 수확이 늘어날 수 있습니다.']
];
const TAG_NAMES = JOB_TAGS.map(t => t[0]);
const JOB_MAX_LV = 10, JOB_NAME_MAX = 10, JOB_TAG_MAX = 1, JOB_DAY_MS = 24 * 3600 * 1000;

(() => {
  const give = (tags, names) => names.forEach(n => { const it = ITEMS[n]; it.tags = [...new Set([...(it.tags || []), ...tags])]; });
  Object.values(ITEMS).forEach(it => { if (it.how) it.tags = [it.how]; }); // 채집/채굴/낚시 재료는 얻는 방식이 곧 태그
  give(['목공'], ['목재', '점토', '석재']); give(['재봉'], ['생체 섬유', '해초']); give(['보석공예'], ['광물 코어', '화염 결정', '흑요석', '조개껍데기', '수정 원석', '서리 결정']); give(['약학'], ['협곡 허브', '설산 약초', '약초', '고산 약초', '수초', '응급 키트', '고급 응급 키트']);
  give(['대장'], ['합금 파편', '철광석', '광물 코어', '화강암', '흑요석', '유황', '화염 결정', '구리 광석', '사암', '얼음 조각']); give(['요리'], ['짐승 고기', '육포', '구운 고기', '고기 수프', '생선 구이', '해물 찜', '매운 고기 볶음']); give(['가죽공예'], ['짐승 가죽', '두꺼운 가죽', '가죽 장갑', '가죽 부츠', '가죽 조끼', '가죽 모자', '가죽 하의', '방한 코트']); give(['보석공예'], ['수정 귀걸이', '얼음 목걸이', '구리 반지']); give(['약학'], ['약초 팔찌']); give(['대장'], ['철판 흉갑', '합금 장검', '구리 창', '수정 너클']); give(['요리'], ['협곡 송어 구이', '버섯 스튜']); give(['약학'], ['이능 조직', '에너지 젤']);
  give(['요리'], ['협곡 송어', '빙어', '동굴 버섯', '서리 이끼', '소금', '민물고기', '바닷물고기', '갯벌 조개', '건조 식량', '수분 팩', '구운 감자', '야채 수프', '허브 차']);
  give(['농사'], Object.keys(CROPS).concat(Object.values(CROPS).map(c => c.seed))); give(['요리'], Object.keys(CROPS));
  give(['대장'], ['정찰용 바이저', '자력 부츠', '해무 고글', '플라즈마 블레이드', ...['검', '단검', '창', '활', '너클', '권총'].map(w => `훈련용 ${w}`)]);
  give(['보석공예'], ['흑요석 팔찌', '흑요석 귀걸이', '수정 머리띠', '화염석 반지', '화염 목걸이', '서리 수정 고글']); give(['대장'], ['얼음 장갑', '유황 장화', '흑요석 흉갑', '흑요석 단검', '화염 장검', '서리 수정 지팡이']);
  give(['재봉'], ['경량 방탄복', '전술 장갑', '확장형 전술 가방', '이끼 위장 망토', '방열 장갑']);
})();

/* ---------- 제작 레시피 (sec = 제작 시간, 감각 스탯으로 단축) ---------- */
const RECIPES = [
  { out: '응급 키트', mats: { '약초': 2, '생체 섬유': 1 }, sec: 60 },
  { out: '건조 식량', mats: { '민물고기': 1, '소금': 1 }, sec: 45 },
  { out: '수분 팩', mats: { '수초': 2 }, sec: 30 },
  { out: '합금 파편', mats: { '철광석': 2 }, sec: 90 },
  { out: '확장형 전술 가방', mats: { '생체 섬유': 5, '합금 파편': 3 }, sec: 300 },
  { out: '구운 감자', mats: { '감자': 2 }, sec: 40 },
  { out: '허브 차', mats: { '허브': 2 }, sec: 40 },
  { out: '야채 수프', mats: { '감자': 1, '허브': 1 }, sec: 60 },
  { out: '고급 응급 키트', mats: { '허브': 2, '약초': 2, '생체 섬유': 1 }, sec: 120 },
  { out: '펫 사료', mats: { '감자': 1, '사탕무': 1, '허브': 1 }, sec: 60 },
  { out: '육포', mats: { '짐승 고기': 1, '소금': 1 }, sec: 30 },
  { out: '구운 고기', mats: { '짐승 고기': 1, '감자': 1 }, sec: 50 },
  { out: '고기 수프', mats: { '짐승 고기': 1, '감자': 1, '허브': 1 }, sec: 80 },
  { out: '생선 구이', mats: { '민물고기': 1, '허브': 1 }, sec: 45 },
  { out: '해물 찜', mats: { '바닷물고기': 1, '해초': 1, '소금': 1 }, sec: 70 },
  { out: '매운 고기 볶음', mats: { '짐승 고기': 1, '화산 고추': 1 }, sec: 90 },
  { out: '에너지 젤', mats: { '이능 조직': 1, '수초': 1 }, sec: 60 },
  { out: '가죽 장갑', mats: { '짐승 가죽': 3, '생체 섬유': 1 }, sec: 150 },
  { out: '가죽 부츠', mats: { '짐승 가죽': 4 }, sec: 180 },
  { out: '가죽 조끼', mats: { '두꺼운 가죽': 3, '생체 섬유': 2 }, sec: 240 },
  { out: '가죽 모자', mats: { '짐승 가죽': 3, '생체 섬유': 1 }, sec: 150 },
  { out: '가죽 하의', mats: { '짐승 가죽': 4, '생체 섬유': 2 }, sec: 180 },
  { out: '약초 팔찌', mats: { '약초': 3, '생체 섬유': 2 }, sec: 90 },
  { out: '구리 반지', mats: { '구리 광석': 2, '합금 파편': 1 }, sec: 120 },
  { out: '철판 흉갑', mats: { '합금 파편': 5, '짐승 가죽': 2 }, sec: 300 },
  { out: '수정 귀걸이', mats: { '수정 원석': 2, '합금 파편': 1 }, sec: 200 },
  { out: '얼음 목걸이', mats: { '서리 결정': 2, '생체 섬유': 2 }, sec: 240 },
  { out: '방한 코트', mats: { '두꺼운 가죽': 3, '서리 이끼': 2 }, sec: 300 },
  { out: '합금 장검', mats: { '합금 파편': 4, '목재': 2 }, sec: 240 },
  { out: '구리 창', mats: { '구리 광석': 3, '목재': 3 }, sec: 270 },
  { out: '수정 너클', mats: { '수정 원석': 3, '합금 파편': 3 }, sec: 300 },
  { out: '협곡 송어 구이', mats: { '협곡 송어': 1, '소금': 1 }, sec: 60 },
  { out: '버섯 스튜', mats: { '동굴 버섯': 2, '감자': 1 }, sec: 80 },
  { out: '흑요석 팔찌', mats: { '흑요석': 3, '생체 섬유': 1 }, sec: 150 },
  { out: '흑요석 귀걸이', mats: { '흑요석': 2, '합금 파편': 1 }, sec: 160 },
  { out: '수정 머리띠', mats: { '수정 원석': 2, '생체 섬유': 2 }, sec: 180 },
  { out: '얼음 장갑', mats: { '얼음 조각': 3, '짐승 가죽': 2 }, sec: 170 },
  { out: '화염석 반지', mats: { '화염 결정': 2, '구리 광석': 2 }, sec: 210 },
  { out: '화염 목걸이', mats: { '화염 결정': 2, '생체 섬유': 2 }, sec: 220 },
  { out: '서리 수정 고글', mats: { '서리 결정': 2, '수정 원석': 1, '합금 파편': 1 }, sec: 240 },
  { out: '유황 장화', mats: { '유황': 3, '두꺼운 가죽': 2 }, sec: 230 },
  { out: '흑요석 흉갑', mats: { '흑요석': 4, '두꺼운 가죽': 2, '합금 파편': 4 }, sec: 320 },
  { out: '흑요석 단검', mats: { '흑요석': 4, '목재': 1 }, sec: 250 },
  { out: '화염 장검', mats: { '화염 결정': 3, '합금 파편': 4, '목재': 1 }, sec: 330 },
  { out: '서리 수정 지팡이', mats: { '서리 결정': 3, '수정 원석': 2, '목재': 2 }, sec: 330 }
];
/* 보석 장비의 판매가는 재료 합계의 70% (제작 차익 방지) */
RECIPES.slice(-12).forEach(rc => { ITEMS[rc.out].sell = Math.floor(.7 * Object.entries(rc.mats).reduce((a, [n, q]) => a + q * (ITEMS[n].sell || 0), 0)); });

/* 레시피는 승급할수록 늘어난다: F = 처음부터, E / D = 해당 등급으로 승급하면 */
const STARTER_RECIPES = ['응급 키트', '건조 식량', '수분 팩', '합금 파편', '구운 고기', '가죽 장갑', '가죽 부츠']; // 처음부터 아는 레시피. 나머지는 개인실 '단련'으로 배운다
/* 단련으로 배울 수 있는 등급: 이 등급 이상이어야 그 레시피가 후보에 들어간다 (나머지는 F) */
const RECIPE_RANK = { E: ['흑요석 팔찌', '흑요석 귀걸이', '수정 머리띠', '얼음 장갑', '야채 수프', '해물 찜', '에너지 젤', '펫 사료', '고급 응급 키트', '구리 반지', '철판 흉갑', '합금 장검', '협곡 송어 구이', '수정 귀걸이'], D: ['화염석 반지', '화염 목걸이', '서리 수정 고글', '유황 장화', '흑요석 흉갑', '흑요석 단검', '화염 장검', '서리 수정 지팡이', '고기 수프', '매운 고기 볶음', '가죽 조끼', '확장형 전술 가방', '구리 창', '수정 너클', '얼음 목걸이', '방한 코트', '버섯 스튜'] };
RECIPES.forEach(rc => { rc.rank = Object.keys(RECIPE_RANK).find(k => RECIPE_RANK[k].includes(rc.out)) || 'F'; });
const MEDICINES = new Set(['응급 키트', '고급 응급 키트', '에너지 젤']);
/* 제작 분류 탭: 소모품은 음식 / 약으로 나눈다 */
const craftCat = name => { const t = ITEMS[name].tab; return t === '소모품' ? (MEDICINES.has(name) ? '약' : '음식') : t; };
const RANK_ORDER = 'FEDCBAS';
const recipeKnown = rc => STARTER_RECIPES.includes(rc.out) || state.learned.includes(rc.out);
const rankAtLeast = r => RANK_ORDER.indexOf(state.character.rank) >= RANK_ORDER.indexOf(r);
const learnableRecipes = () => RECIPES.filter(rc => !recipeKnown(rc) && rankAtLeast(rc.rank)); // 지금 단련으로 배울 수 있는 후보
const TRAIN_SEC = 3 * 3600, TRAIN_SP = 10, TRAIN_EXP = 30; // 단련: 3시간 · 기력 10 · EXP +30 · 새 레시피 1종

/* ---------- 버프/디버프 ---------- */
const BUFFS = {
  '부상': { type: 'debuff', icon: 'personal_injury', desc: '전투에서 입은 부상. 민첩 -2', mods: { agi: -2 } },
  '충분한 휴식': { type: 'buff', icon: 'bedtime', desc: '푹 쉬어 정신이 맑다. 의지 +2', mods: { wil: 2 } }
};

/* ---------- 지역 / 행동 ----------
   공중: 본부, 개인실, 상점가 / 지상: 제1~3구역 (지형마다 채집·전투)
   지도 노드는 본부를 중심으로 모두 연결된다. */
const ACTIONS = {};
const LOCATIONS = {};
const MAP_NODES = [], DANGER_NODES = {};

const TODO_ICONS = { '대원 간 상점': 'store' };
Object.entries(TODO_ICONS).forEach(([label, icon]) => {
  ACTIONS[label] = { kind: 'todo', icon, label, title: label, action: `${label} 기능은 아직 구현되지 않았습니다.` };
});
ACTIONS['임무 수주'] = { kind: 'board', icon: 'assignment', label: '임무 수주', title: '임무 수주', action: '이 장소에서 받을 수 있는 임무를 확인하고 수주합니다.' };
ACTIONS['상점'] = { kind: 'shop', icon: 'storefront', label: '상점', title: '상점', action: '이 장소에서 아이템을 구입합니다.' };
ACTIONS['승급'] = { kind: 'promo', icon: 'military_tech', label: '승급', title: '승급', action: '승급 시험(메인 임무)을 받고, 마치면 등급이 오릅니다.' };
ACTIONS['농장'] = { kind: 'farm', icon: 'yard', label: '농장', title: '농장', action: '씨앗을 심고 작물을 수확합니다. 시간이 지나면 자랍니다.' };
ACTIONS['펫 돌보기'] = { kind: 'pet', icon: 'pets', label: '펫 돌보기', title: '펫 돌보기', action: '지상에서 길들인 펫에게 먹이를 주고 함께 갈 펫을 고릅니다.' };
ACTIONS['서브잡 가입'] = { kind: 'subjob', icon: 'work', label: '서브잡', title: '서브잡', action: '나만의 서브잡을 만들고 하루 한 번 납품해 레벨을 올립니다.' };
ACTIONS['단련'] = { kind: 'train', icon: 'fitness_center', label: '단련', title: '단련', action: '개인실에서 3시간 동안 단련하며 새 제작 레시피를 익힙니다. 배울 수 있는 레시피는 등급이 오를수록 늘어납니다.', sec: 3 * 3600, cost: { sp: 10 } };
ACTIONS['휴식'] = { kind: 'rest', icon: 'bed', label: '휴식', title: '휴식', action: '개인실에서 쉬며 HP와 기력을 조금 회복합니다. (30분)', sec: 1800, cost: { sp: 0 } };
ACTIONS['잠자기'] = { kind: 'rest', icon: 'bedtime', label: '잠자기', title: '잠자기', action: '개인실에서 깊이 잠들어 HP와 기력을 모두 회복합니다. (6시간)', sec: 21600, cost: { sp: 0 }, full: true };

const SAFE_ZONES = [
  { id: '본부', icon: 'domain', meta: '행정 · 작전 거점', x: 50, y: 42, desc: '임무 수주와 승급 시험을 받을 수 있는 도시 본부입니다. CR을 내고 장비를 강화할 수도 있습니다.', items: ['임무 수주', '승급', '장비 강화'] },
  { id: '개인실', icon: 'bed', meta: '휴식 · 단련 · 농장', x: 22, y: 20, desc: '나만의 공간입니다. 휴식하고, 단련으로 새 레시피를 익히고, 농장을 가꾸고, 펫을 돌볼 수 있습니다.', items: ['농장', '펫 돌보기', '단련', '휴식', '잠자기'] },
  { id: '이동장치', icon: 'transfer_within_a_station', meta: '지상 이동 · 구역 선택', x: 50, y: 74, desc: '지상으로 내려가는 이동 장치입니다. 가고 싶은 구역을 고르면 바로 이동합니다.', items: ['이동 제1구역', '이동 제2구역', '이동 제3구역', '이동 제4구역', '이동 제5구역'] },
  { id: '상점가', icon: 'storefront', meta: '상점 · 대원 거래 · 서브잡', x: 78, y: 20, desc: '상점과 서브잡 가입을 이용할 수 있는 상업 구역입니다. 대원 간 상점은 아직 구현되지 않았습니다.', items: ['상점', '대원 간 상점', '서브잡 가입'] }
];

/* 지상은 지도에서 '입장'하면 타일 미궁(map)이 열린다.
   map 문자: # 벽 / S 입구·출구 / C 안전 캠프 / E 이벤트 / a~e = terrains[0..4] 지형 (칸마다 채집 재료·몬스터가 다르다)
   monster: hp/atk는 전투 시뮬레이션용, exp/cr는 승리 보상, kind는 도감 분류(이능 몬스터/짐승)
   level: 펫 속도 등급(난이도와 무관), tone: 색조, hazard: 채집 중 사고(확률, HP 손실 범위), events: E 칸(읽는 순서)의 이벤트 결과 */
const DANGER_ZONES = [
  { id: '제1구역', n: 1, level: 1, tone: 'forest', icon: 'forest', hazard: { chance: .12, hp: [1, 2], text: '낙석·독충' }, name: '제1구역 · 숲 구역', label: '제1구역 숲', x: 20, y: 76,
    desc: '울창한 숲과 채석지, 호수가 이어진 지상입니다.',
    terrains: [
      { name: '숲', icon: 'park', desc: '나무가 빽빽한 숲길. 목재와 약초를 구할 수 있다.', gather: ['목재', '약초'], rare: '생체 섬유', monster: { name: '숲 늑대', kind: '짐승', desc: '무리를 지어 숲을 순찰하는 늑대.', hp: 30, atk: 6, exp: 12, cr: 8 } },
      { name: '채석지', icon: 'landscape', desc: '바위를 캐던 옛 채석장. 석재와 철광석이 나온다.', gather: ['석재', '철광석'], rare: '광물 코어', monster: { name: '바위 도마뱀', kind: '짐승', desc: '바위 틈에 숨어 사는 단단한 도마뱀.', hp: 38, atk: 7, exp: 14, cr: 9 } },
      { name: '호수', icon: 'water', desc: '맑은 물이 고인 호숫가. 물고기와 수초가 있다.', gather: ['민물고기', '수초'], rare: '생체 섬유', monster: { name: '늪 악어', kind: '이능 몬스터', desc: '늪의 에너지에 오염되어 거대해진 악어.', hp: 44, atk: 8, exp: 16, cr: 10 } },
      { name: '깊은 숲', icon: 'forest', desc: '햇빛이 거의 닿지 않는 숲 깊은 곳. 목재와 생체 섬유가 풍부하다.', gather: ['목재', '생체 섬유'], rare: '약초', monster: { name: '멧돼지', kind: '짐승', desc: '숲 깊은 곳을 달리는 거대한 멧돼지.', hp: 36, atk: 7, exp: 13, cr: 9 } },
      { name: '폐막사', icon: 'cabin', desc: '버려진 군 초소. 합금 파편과 생체 섬유가 굴러다닌다.', gather: ['합금 파편', '생체 섬유'], rare: '광물 코어', monster: { name: '경비 드론', kind: '이능 몬스터', desc: '오작동한 채 순찰하는 경비 드론.', hp: 40, atk: 8, exp: 15, cr: 11 } }
    ],
    events: [
      { title: '버려진 보급 상자', text: '덤불 속에서 방치된 보급 상자를 발견했습니다.', items: [['응급 키트', 1], ['건조 식량', 1]], exp: 10 },
      { title: '독충 둥지', text: '모르고 독충 둥지를 건드려 물렸습니다.', hp: -8, sp: -4 }
    ] },
  { id: '제2구역', n: 2, level: 2, tone: 'sea', icon: 'sailing', hazard: { chance: .15, hp: [1, 3], text: '파도·해파리' }, name: '제2구역 · 바다 구역', label: '제2구역 바다', x: 50, y: 86,
    desc: '백사장과 바다, 갯벌이 펼쳐진 지상입니다.',
    terrains: [
      { name: '백사장', icon: 'beach_access', desc: '하얀 모래가 깔린 해안. 조개껍데기와 소금을 모을 수 있다.', gather: ['조개껍데기', '소금'], rare: '광물 코어', monster: { name: '모래게', kind: '짐승', desc: '모래 속에 숨어 집게로 습격하는 게.', hp: 55, atk: 10, exp: 22, cr: 14 } },
      { name: '바다', icon: 'waves', desc: '파도가 밀려드는 얕은 바다. 물고기와 해초가 있다.', gather: ['바닷물고기', '해초'], rare: '생체 섬유', monster: { name: '심해 해파리', kind: '이능 몬스터', desc: '전기 에너지를 방전하는 이능 해파리.', hp: 62, atk: 12, exp: 26, cr: 16 } },
      { name: '갯벌', icon: 'grass', desc: '발이 푹푹 빠지는 갯벌. 조개와 점토를 캘 수 있다.', gather: ['갯벌 조개', '점토'], rare: '합금 파편', monster: { name: '갯벌 괴어', kind: '이능 몬스터', desc: '진흙 속에서 기어 나오는 변이 물고기.', hp: 58, atk: 11, exp: 24, cr: 15 } },
      { name: '해안 절벽', icon: 'landscape', desc: '파도가 깎아낸 절벽. 석재와 소금을 얻을 수 있다.', gather: ['석재', '소금'], rare: '광물 코어', monster: { name: '절벽 매', kind: '짐승', desc: '절벽 위에서 급강하하는 맹금.', hp: 58, atk: 11, exp: 23, cr: 15 } },
      { name: '난파선', icon: 'directions_boat', desc: '좌초한 수송선 잔해. 합금 파편과 해초가 걸려 있다.', gather: ['합금 파편', '해초'], rare: '생체 섬유', monster: { name: '난파선 망령', kind: '이능 몬스터', desc: '선체에 깃든 에너지 덩어리.', hp: 64, atk: 12, exp: 27, cr: 17 } }
    ],
    events: [
      { title: '표류한 물자', text: '해안에 떠밀려 온 물자 상자를 건졌습니다.', items: [['수분 팩', 2], ['소금', 2]], money: 30 },
      { title: '갑작스러운 해일', text: '큰 파도에 휩쓸려 장비가 젖고 몸을 다쳤습니다.', hp: -12, sp: -5 }
    ] },
  { id: '제3구역', n: 3, level: 3, tone: 'volcano', icon: 'volcano', hazard: { chance: .2, hp: [2, 4], text: '열기·낙석' }, name: '제3구역 · 화산 구역', label: '제3구역 화산', x: 80, y: 76,
    desc: '산과 채석지, 활화산이 있는 가장 위험한 구역입니다.',
    terrains: [
      { name: '산', icon: 'terrain', desc: '가파른 산비탈. 화강암과 고산 약초가 자란다.', gather: ['화강암', '고산 약초'], rare: '광물 코어', monster: { name: '산악 곰', kind: '짐승', desc: '고지대를 지배하는 거대한 곰.', hp: 90, atk: 16, exp: 38, cr: 24 } },
      { name: '채석지', icon: 'landscape', desc: '용암에 그을린 채석지. 흑요석과 철광석이 나온다.', gather: ['흑요석', '철광석'], rare: '합금 파편', monster: { name: '용암 두꺼비', kind: '이능 몬스터', desc: '열기를 내뿜는 용암 속 두꺼비.', hp: 100, atk: 18, exp: 42, cr: 26 } },
      { name: '화산', icon: 'local_fire_department', desc: '끓어오르는 화구 주변. 유황과 화염 결정이 있다.', gather: ['유황', '화염 결정'], rare: '광물 코어', monster: { name: '화염 정령', kind: '이능 몬스터', desc: '불꽃이 의지를 가진 정령.', hp: 120, atk: 20, exp: 50, cr: 32 } },
      { name: '용암 동굴', icon: 'texture', desc: '열기가 가득한 동굴. 흑요석과 유황이 굳어 있다.', gather: ['흑요석', '유황'], rare: '화염 결정', monster: { name: '동굴 박쥐', kind: '짐승', desc: '열기 속에서 사는 거대한 박쥐 떼.', hp: 95, atk: 17, exp: 40, cr: 25 } },
      { name: '화산재 평원', icon: 'grain', desc: '화산재가 쌓인 황량한 평원. 화강암과 유황이 섞여 있다.', gather: ['화강암', '유황'], rare: '광물 코어', monster: { name: '재 늑대', kind: '이능 몬스터', desc: '재를 두르고 달리는 늑대.', hp: 105, atk: 18, exp: 44, cr: 28 } }
    ],
    events: [
      { title: '식은 용암굴의 보물', text: '식은 용암굴 안쪽에서 빛나는 결정을 발견했습니다.', items: [['화염 결정', 2], ['흑요석', 1]], exp: 25, money: 60 },
      { title: '가스 분출', text: '유독 가스가 분출해 숨이 막혔습니다.', hp: -15, sp: -8 }
    ] },
  { id: '제4구역', n: 4, level: 4, tone: 'canyon', icon: 'terrain', hazard: { chance: .2, hp: [2, 4], text: '급류·낙석' }, name: '제4구역 · 협곡 구역', label: '제4구역 협곡', x: 36, y: 90,
    desc: '깊게 갈라진 협곡. 급류가 흐르는 강과 채석지, 어두운 동굴이 이어진다.',
    terrains: [
      { name: '협곡 강', icon: 'water', desc: '협곡 바닥을 가르는 차가운 급류. 송어와 물가 풀을 구할 수 있다.', gather: ['협곡 송어', '협곡 허브'], rare: '생체 섬유', monster: { name: '급류 수달', kind: '짐승', desc: '급류를 거슬러 오르는 날랜 수달.', hp: 130, atk: 22, exp: 58, cr: 38 } },
      { name: '채석지', icon: 'landscape', desc: '붉은 사암을 캐던 협곡 채석지. 사암과 구리 광석이 나온다.', gather: ['사암', '구리 광석'], rare: '광물 코어', monster: { name: '석상 골렘', kind: '이능 몬스터', desc: '채석장의 바위가 움직이는 이능 골렘.', hp: 150, atk: 24, exp: 66, cr: 42 } },
      { name: '동굴', icon: 'texture', desc: '협곡 벽면에 뚫린 동굴. 동굴 버섯과 수정 원석이 있다.', gather: ['동굴 버섯', '수정 원석'], rare: '구리 광석', monster: { name: '동굴 거미', kind: '짐승', desc: '천장에 매달려 먹잇감을 노리는 거대 거미.', hp: 140, atk: 23, exp: 62, cr: 40 } },
      { name: '협곡 절벽', icon: 'terrain', desc: '아찔한 붉은 절벽. 사암과 협곡 허브를 얻을 수 있다.', gather: ['사암', '협곡 허브'], rare: '수정 원석', monster: { name: '절벽 염소', kind: '짐승', desc: '절벽을 평지처럼 뛰어다니는 뿔 달린 염소.', hp: 135, atk: 23, exp: 60, cr: 39 } },
      { name: '깊은 동굴', icon: 'dark_mode', desc: '빛이 닿지 않는 동굴 깊은 곳. 수정 원석과 버섯이 빽빽하다.', gather: ['수정 원석', '동굴 버섯'], rare: '구리 광석', monster: { name: '수정 박쥐', kind: '이능 몬스터', desc: '수정의 에너지를 먹고 자란 박쥐 떼.', hp: 160, atk: 26, exp: 72, cr: 48 } }
    ],
    events: [
      { title: '말라붙은 야영지', text: '협곡 바위 틈의 오래된 야영지에서 쓸 만한 물자를 찾았습니다.', items: [['고급 응급 키트', 1], ['건조 식량', 2]], exp: 30, money: 70 },
      { title: '급류에 휩쓸림', text: '발을 헛디뎌 급류에 휩쓸렸습니다.', hp: -14, sp: -8 }
    ] },
  { id: '제5구역', n: 5, level: 5, tone: 'snow', icon: 'ac_unit', hazard: { chance: .22, hp: [2, 5], text: '동상·눈사태' }, name: '제5구역 · 설원 구역', label: '제5구역 설원', x: 64, y: 90,
    desc: '끝없이 이어진 설원. 눈밭과 얼음 동굴, 얼어붙은 강이 있는 가장 위험한 구역입니다.',
    terrains: [
      { name: '눈밭', icon: 'ac_unit', desc: '무릎까지 푹푹 빠지는 눈밭. 눈 속의 약초와 이끼를 구할 수 있다.', gather: ['설산 약초', '서리 이끼'], rare: '약초', monster: { name: '설원 여우', kind: '짐승', desc: '눈 속에 몸을 숨기고 접근하는 하얀 여우.', hp: 170, atk: 28, exp: 78, cr: 52 } },
      { name: '설원 동굴', icon: 'texture', desc: '얼음이 반짝이는 동굴. 얼음 조각과 서리 결정이 있다.', gather: ['얼음 조각', '서리 결정'], rare: '광물 코어', monster: { name: '얼음 박쥐', kind: '이능 몬스터', desc: '냉기를 두른 채 날아다니는 박쥐.', hp: 185, atk: 30, exp: 86, cr: 58 } },
      { name: '얼어붙은 강', icon: 'water', desc: '두껍게 얼어붙은 강. 얼음 구멍으로 빙어를 낚을 수 있다.', gather: ['빙어', '서리 이끼'], rare: '생체 섬유', monster: { name: '빙하 곰', kind: '짐승', desc: '얼어붙은 강가를 어슬렁거리는 거대한 흰곰.', hp: 190, atk: 30, exp: 88, cr: 60 } },
      { name: '빙벽', icon: 'terrain', desc: '푸른빛이 도는 거대한 얼음 절벽. 서리 결정이 박혀 있고 이끼가 붙어 있다.', gather: ['서리 결정', '서리 이끼'], rare: '광물 코어', monster: { name: '서리 정령', kind: '이능 몬스터', desc: '얼음에 깃든 차가운 의지의 정령.', hp: 200, atk: 32, exp: 92, cr: 64 } },
      { name: '눈 덮인 폐허', icon: 'domain', desc: '눈에 반쯤 묻힌 옛 도시의 잔해. 합금 파편과 설산 약초가 섞여 있다.', gather: ['합금 파편', '설산 약초'], rare: '광물 코어', monster: { name: '설원 늑대', kind: '짐승', desc: '무리 지어 폐허를 도는 거대한 흰 늑대.', hp: 180, atk: 29, exp: 82, cr: 55 } }
    ],
    events: [
      { title: '얼어붙은 보급품', text: '눈 속에 묻힌 보급 상자를 파냈습니다. 아직 쓸 만합니다.', items: [['고급 응급 키트', 1], ['수분 팩', 2], ['귀환 신호기', 1]], exp: 40, money: 100 },
      { title: '눈사태', text: '갑작스러운 눈사태에 휩쓸려 체온을 잃었습니다.', hp: -18, sp: -10 }
    ] }
];
const MAPS = { // 문자: . 허공 / # 벽 / S 입구 / C 캠프 / E 이벤트 / a~e = 지형(terrains[0..4]). tools/gen_maps.py로 만든다. 지역마다 모양이 다르다
  '제1구역': ['.....aaC.....', '.....aeee....', '....aaeee....', '..aaEaaee....', '..cccabeEddd.', '..cccbbbddd#.', '..cccbbb#ddC.', '.Scccbbbb#d..', '.cc#cbEbddd..', '..cc.........', '.............'],
  '제2구역': ['.....cceeCe....', '...cEcceeeeee..', '..cccccce......', '.aa#ccc........', '.aaaccE........', '.Saaaac........', '.a#aab#........', '.aabbbb........', '.abbbbbb.......', '..bbbbbbdddddC.', '...b#Ebbddddd..'],
  '제3구역': ['.....ddddC...', '...Ed#ddddd..', '.aaaadd#ddd..', 'aaaaaddddddd.', 'aaaa#c#dddee.', 'aaa#.cEc.eeee', 'Saaccccceee##', 'aaac.ccc.eeeE', '.accccbceeeee', '.bbbbbbbeeeee', '..bbbbbbbeee.', '..bbbbbbbe...', '...bbbbC.....'],
  '제4구역': ['...........C.......', '..........eee#ed...', '.........ee#eeedd..', '.........eeeeeddEd.', 'c.......#eeeEedddd.', 'Sc.#...bbbee..ddddd', 'ccccaabbbbbe...dddd', 'cccaaabbbb.....dddd', '.caa#aabE.......ddd', '..aaaaab.........dC', '...Eaa#............'],
  '제5구역': ['..#E..aa#..c#..', '.eeaa.aaa.cccc.', 'eeeee.aaa.ccccC', 'eeeee.aaa.ccc#c', '.ee#eee#accccc.', '....eeeEecc....', 'eeeeeeeeebccccc', 'S#ddeeebbbbbbcc', 'dddddddbbbbbb#b', '....dddbbbb....', '.dddEddb#bbbbE.', 'd#ddd.dbb.bbbbb', 'ddddd.dbb.bbbbb', '.dddd.dbb.bbbb.', '..dd..dbC..bb..']
};
DANGER_ZONES.forEach(z => { z.map = MAPS[z.id]; });
/* 몬스터 드롭: [아이템, 확률] — 짐승은 고기·가죽, 이능 몬스터는 이능 조직 (core.js resolveAction) */
/* 장비 강화: CR을 내면 그 장비에 무작위 효과가 하나 붙는다. 장비를 장착하면 효과가 적용된다 (다시 강화하면 새 효과로 바뀐다) */
const ENCHANT_COST = 100;
const ENCHANT_POOL = [ // [종류, 가중치, 값 범위]
  ['str', 10, [1, 2]], ['agi', 10, [1, 2]], ['int', 10, [1, 2]], ['wil', 10, [1, 2]], ['sen', 10, [1, 2]], ['luk', 10, [1, 2]], ['hp', 20, [5, 15]], ['sp', 20, [5, 15]]
];
ACTIONS['장비 강화'] = { kind: 'enhance', icon: 'build', label: '장비 강화', title: '장비 강화', action: `CR ${ENCHANT_COST}을 내고 장비에 무작위 효과를 붙입니다. (스탯 또는 최대 HP·기력)` };
const SUBJOB_MIN_LV = 5, PET_MIN_LV = 7; // 서브잡은 Lv.5부터, 펫(길들이기·돌보기)은 Lv.7부터
const EXP_SLOW = 1.18, CR_BONUS = 1.1;   // 레벨업에 필요한 EXP는 18% 늘고, 몬스터가 주는 CR은 10% 는다
/* 모든 위험구역의 난이도는 비슷하다: 몬스터 체력·공격과 사고 위험을 같은 수준으로 맞추고, 구역이 멀수록 보수(EXP·CR)만 조금 늘어난다 */
const ZONE_REWARD = { 1: 1, 2: 1.3, 3: 1.6, 4: 1.9, 5: 2.2 };
DANGER_ZONES.forEach(z => {
  z.level = 2; z.hazard = { ...z.hazard, chance: .15, hp: [1, 3] };
  z.terrains.forEach((t, i) => { const m = t.monster; m.hp = 38 + (i % 3) * 5; m.atk = 7 + (i % 2); m.exp = Math.round((12 + i) * ZONE_REWARD[z.n]); m.cr = Math.round((8 + i) * ZONE_REWARD[z.n] * CR_BONUS); });
});
const ZONE_MIN_RANK = {}; // 등급 제한이 있는 구역 { 구역: 등급 }. 모든 구역의 난이도가 비슷해서 지금은 제한이 없다
const ROUGH = { '제1구역:깊은 숲': 1, '제2구역:갯벌': 1, '제2구역:해안 절벽': 2, '제3구역:산': 1, '제3구역:화산': 2, '제3구역:용암 동굴': 2, '제3구역:화산재 평원': 1, '제4구역:협곡 절벽': 2, '제4구역:동굴': 1, '제4구역:깊은 동굴': 2, '제5구역:눈밭': 1, '제5구역:설원 동굴': 1, '제5구역:빙벽': 2 }; // 험난한 지형 단계(ROUGH_EXTRA_SEC 참고)
DANGER_ZONES.forEach(z => z.terrains.forEach(t => { t.rough = ROUGH[`${z.id}:${t.name}`] || 0; }));
DANGER_ZONES.forEach(z => z.terrains.forEach(t => { t.monster.drops = t.monster.kind === '짐승' ? [['짐승 고기', .6], [z.n >= 3 ? '두꺼운 가죽' : '짐승 가죽', .4]] : [['이능 조직', .45]]; }));
/* 지형마다 몬스터가 2종 이상: 첫 번째는 t.monster, 나머지는 EXTRA_MONSTERS. 칸마다 그중 하나가 나타난다 (core.js tileBattleId). 능력치는 기본 몬스터에서 비율로 정한다 */
const EXTRA_MONSTERS = {
  '제1구역:숲': ['붉은 여우', '짐승', '재빠르게 덤불을 가르는 여우.', 0.85], '제1구역:채석지': ['돌무더기 정령', '이능 몬스터', '돌무더기가 사람 모양으로 일어난 정령.', 1.1],
  '제1구역:호수': ['큰 가물치', '짐승', '물가로 뛰어오르는 거대한 가물치.', 0.9], '제1구역:깊은 숲': ['그림자 사슴', '이능 몬스터', '그림자를 뿔에 두른 사슴.', 1.1], '제1구역:폐막사': ['고철 개', '이능 몬스터', '잔해로 이루어진 사냥개 모양의 기계.', 1.05],
  '제2구역:백사장': ['갈매기 떼', '짐승', '무리 지어 급강하하는 갈매기.', 0.85], '제2구역:바다': ['작살 가오리', '짐승', '꼬리 가시를 쏘는 가오리.', 1.0], '제2구역:갯벌': ['진흙 집게', '이능 몬스터', '진흙을 두르고 움직이는 집게.', 1.1],
  '제2구역:해안 절벽': ['바위 달팽이', '이능 몬스터', '단단한 껍질을 지닌 거대 달팽이.', 1.1], '제2구역:난파선': ['녹슨 갑옷', '이능 몬스터', '선원의 갑옷이 홀로 움직인다.', 1.05],
  '제3구역:산': ['눈표범', '짐승', '산등성이를 소리 없이 달리는 표범.', 0.95], '제3구역:채석지': ['화산 전갈', '짐승', '달궈진 바위 틈에서 나오는 전갈.', 0.95], '제3구역:화산': ['용암 거북', '이능 몬스터', '등딱지에서 용암이 흐르는 거북.', 1.1],
  '제3구역:용암 동굴': ['불꽃 도마뱀', '짐승', '벽을 타고 불꽃을 뿜는 도마뱀.', 1.0], '제3구역:화산재 평원': ['재 독수리', '짐승', '화산재 속을 선회하는 독수리.', 0.95],
  '제4구역:협곡 강': ['협곡 가재', '짐승', '집게가 바위만 한 가재.', 0.95], '제4구역:채석지': ['사암 전갈', '짐승', '붉은 모래에 숨은 전갈.', 0.95], '제4구역:동굴': ['버섯 균체', '이능 몬스터', '버섯 포자가 뭉쳐 움직이는 덩어리.', 1.05],
  '제4구역:협곡 절벽': ['협곡 독수리', '짐승', '절벽 위에서 내리꽂는 맹금.', 1.0], '제4구역:깊은 동굴': ['결정 파수꾼', '이능 몬스터', '수정으로 된 몸을 가진 파수꾼.', 1.1],
  '제5구역:눈밭': ['눈보라 토끼', '이능 몬스터', '눈보라를 몰고 다니는 토끼.', 0.9], '제5구역:설원 동굴': ['얼음 전갈', '짐승', '얼음 속에서 깨어난 전갈.', 0.95], '제5구역:얼어붙은 강': ['빙어 떼', '이능 몬스터', '얼음 밑에서 튀어나오는 이능 물고기 떼.', 0.9],
  '제5구역:빙벽': ['설표', '짐승', '빙벽을 오르내리는 설표.', 0.95], '제5구역:눈 덮인 폐허': ['동결 경비병', '이능 몬스터', '얼어붙은 채 순찰하는 옛 경비 로봇.', 1.1]
};
DANGER_ZONES.forEach(z => z.terrains.forEach(t => {
  const base = t.monster, ex = EXTRA_MONSTERS[`${z.id}:${t.name}`];
  t.monsters = [base];
  if (ex) {
    const [name, kind, desc, k] = ex, r = v => Math.max(1, Math.round(v * k));
    const m = { name, kind, desc, hp: r(base.hp), atk: r(base.atk), exp: r(base.exp), cr: r(base.cr) };
    m.drops = kind === '짐승' ? [['짐승 고기', .6], [z.n >= 3 ? '두꺼운 가죽' : '짐승 가죽', .4]] : [['이능 조직', .45]];
    t.monsters.push(m);
  }
}));
const ZONE_SEEDS = { '제1구역': '야생 열매 씨앗', '제2구역': '해풍 콩 씨앗', '제3구역': '화산 고추 씨앗', '제4구역': '협곡 보리 씨앗', '제5구역': '설원 순무 씨앗' }; // 지상에서 가끔 얻는 특산 씨앗 (채집 6% · 전투 승리 8%)
const SEED_DROP = { gather: .06, battle: .08 };
const TAME_SP = 3, TAME_SEC = 600, TAME_BASE = .3; // 길들이기: 기력 3 · 10분 · 기본 성공 30% (감각 +2%p/pt)
const PET_SPECIES = {}; // 길들일 수 있는 펫 종: 짐승 몬스터 이름 → { zone, level, base, name }
const PET_SPEED = { 1: .08, 2: .12, 3: .16, 4: .2, 5: .24 };      // 펫 이동속도 버프(타일 이동 시간 단축) 기본값: 구역 level별
const PET_FED_MS = 24 * 3600 * 1000;               // 먹이를 준 뒤 24시간 동안 든든함(버프 유지)
const PET_BOND_START = 20;                          // 친밀도 0~100. 버프 = 기본값 × (0.5 + 친밀도/200)
const PET_EXP_MS = 24 * 3600 * 1000;               // 펫 자동 탐험: 24시간 뒤 돌아온다 (먹이 1개 소모)
const PET_EXP_ROLLS = 4;                            // 탐험 기본 획득 횟수 (+친밀도 34마다 1, +고향 구역이면 1)
const PET_EXP_ODDS = { common: .78, rare: .16 };   // 나머지는 구역 특산 씨앗
const FARM_PLOTS = { F: 3, E: 4, D: 6 };            // 등급별 밭 칸 수

/* 미궁 안 공통 행동 */
ACTIONS['타일 이동'] = { kind: 'step', icon: 'directions_walk', label: '이동', title: '타일 이동', action: '선택한 타일로 이동합니다. 한 칸마다 3분(험난한 지형은 +2~3분)과 기력 1이 듭니다.' };
ACTIONS['구역 이동'] = { kind: 'trip', icon: 'transfer_within_a_station', label: '이동', title: '구역 이동', action: `지상으로 내려가는 중입니다. 도착하면 미궁 입구에 들어섭니다. (${ZONE_TRIP_SEC / 60}분)` };
ACTIONS['퇴장'] = { kind: 'leave', icon: 'logout', label: '퇴장', title: '퇴장', action: '미궁에서 나가 구역 지도로 돌아갑니다. (시간 걸리지 않음)' };
ACTIONS['캠프 휴식'] = { kind: 'rest', icon: 'camping', label: '캠프 휴식', title: '캠프 휴식', action: '안전 캠프에서 쉬며 HP와 기력을 회복합니다.', sec: 60, cost: { sp: 0 }, restSp: 15 };

SAFE_ZONES.forEach(z => {
  LOCATIONS[z.id] = { name: z.id, desc: z.desc, icon: z.icon, tone: 'safe', meta: ['공중', z.meta], groups: [{ items: z.items }] };
  MAP_NODES.push({ id: z.id, label: z.id, x: z.x, y: z.y, danger: false, links: z.id === '본부' ? [] : ['본부'] });
});
DANGER_ZONES.forEach(z => {
  const enter = `${z.id} 입장`;
  ACTIONS[enter] = { kind: 'enter', zone: z.id, icon: 'login', label: '입장', title: `${z.name} 입장`, action: `${z.name}의 미궁에 입장합니다. 타일을 옮겨 다니며 지형을 탐색합니다. (타일 1칸 이동 = 3분)` };
  ACTIONS[`${z.id} 이벤트`] = { kind: 'event', icon: 'priority_high', label: '이벤트', title: `${z.name} 이벤트`, action: '' };
  z.terrains.forEach(t => {
    const b = `${z.id} ${t.name} 전투`, inv = `${z.id} ${t.name} 조사`;
    ACTIONS[inv] = { kind: 'investigate', icon: 'search', label: '조사', title: `${t.name} 조사`, action: `${t.name} 일대를 살핍니다. 누르면 바로 실행되며 시간이 걸리지 않습니다. 같은 칸은 12시간에 한 번만 할 수 있습니다.`, cost: { sp: INVESTIGATE_SP }, terrain: t };
    t.gatherIds = {}; // 재료 → 채집 행동 id (칸마다 이 중 일부만 나타난다)
    t.gather.forEach(n => {
      const how = ITEMS[n].how, id = `${z.id} ${t.name} ${n}`, verb = GATHER_VERBS[n] || `${n}을(를) 모은다`;
      ACTIONS[id] = { kind: 'gather', method: how, items: [n], rare: ITEMS[t.rare].how === how ? t.rare : null, icon: GATHER_KINDS[how], label: verb, title: verb, action: `${z.name}의 ${t.name}에서 ${verb}. (${n} · 1회 5분, 다중행동 가능)`, cost: { sp: 1 }, hazard: z.hazard, terrain: t };
      t.gatherIds[n] = id;
    });
    t.battleIds = t.monsters.map((m, k) => { // 몬스터마다 전투 행동이 따로 있다. 칸마다 그중 하나가 나타난다
      const id = k ? `${b} ${k + 1}` : b;
      ACTIONS[id] = { kind: 'battle', monster: m, icon: 'swords', label: m.kind === '짐승' ? `${m.name}의 흔적을 쫓는다` : `${m.name}의 반응을 추적한다`, title: `${t.name} 전투`, action: `${t.name}의 ${m.name}와(과) 전투합니다. 전투 중 HP를 잃으며, 패배하면 부상을 입습니다. (1회 5~8분, 다중행동 가능)`, cost: { sp: 2 }, terrain: t };
      return id;
    });
    if (t.monster.kind === '짐승') { // 짐승이 있는 지형에서는 길들이기를 시도할 수 있다 (지상 펫 획득)
      t.tameId = `${z.id} ${t.name} 길들이기`;
      PET_SPECIES[t.monster.name] = { zone: z.id, level: z.level, base: PET_SPEED[z.level], name: `새끼 ${t.monster.name}`, icon: t.icon };
      ACTIONS[t.tameId] = { kind: 'tame', icon: 'pets', label: `${t.monster.name}에게 먹이를 건넨다`, title: `${t.name} 길들이기`, terrain: t, zoneId: z.id, action: `먹이가 될 작물이나 펫 사료 1개로 ${t.monster.name}을(를) 길들입니다. (10분 · 기력 ${TAME_SP})`, cost: { sp: TAME_SP }, hazard: z.hazard };
    }
    t.actions = [inv, b]; // 채집 행동은 칸마다 일부만 나타난다 (core.js tileActionIds)
  });
  LOCATIONS[z.id] = { name: z.name, desc: z.desc, danger: true, icon: z.icon, tone: z.tone, meta: [`제 ${z.n} 구역`, z.terrains.map(t => t.name).join(' · ')], groups: [{ items: [enter, '이동 이동장치'] }] };
  DANGER_NODES[z.id] = { id: z.id, label: z.label, x: z.x, y: z.y, danger: true, links: ['이동장치'] }; // 지도에는 그 구역에 있을 때만 나타난다
});

/* 이동 행동: 지도에서 구역 사이를 옮기는 이동은 시간이 걸리지 않고 기력만 든다 (core.js travelTo) */
Object.keys(LOCATIONS).forEach(id => {
  const d = LOCATIONS[id].danger, back = id === '이동장치';
  ACTIONS[`이동 ${id}`] = { kind: 'travel', to: id, icon: d ? LOCATIONS[id].icon : 'near_me', label: d ? LOCATIONS[id].name : back ? '이동장치로 귀환' : '이동', title: `${LOCATIONS[id].name}(으)로 이동`, action: d ? `${LOCATIONS[id].name}(으)로 내려갑니다. 도착하면 미궁 입구에 들어섭니다. (${ZONE_TRIP_SEC / 60}분 · 기력 ${MOVE_SP_DANGER})` : `${LOCATIONS[id].name}(으)로 이동합니다. (시간 걸리지 않음)` };
});

/* ---------- 기타 콘텐츠 ---------- */
/* 임무: need.type = visit(구역 방문) / item(보유) / flag(행동 달성). reward = { exp, money } */
const QUESTS = [
  { id: 'adapt', kind: '메인', title: '도시 적응', desc: '본부, 개인실, 상점가를 모두 둘러본다.', need: { type: 'visit', zones: ['본부', '개인실', '상점가'] }, reward: { exp: 40, money: 100 } },
  { id: 'material', board: '본부', kind: '서브', title: '재료 확보', desc: '합금 파편을 3개 모은다.', need: { type: 'item', name: '합금 파편', qty: 3 }, reward: { exp: 20, money: 50 } },
  { id: 'explore', board: '본부', kind: '서브', title: '첫 미궁 탐색', desc: '지상의 미궁에 입장한다.', need: { type: 'flag', flag: 'entered', text: '미궁 입장' }, reward: { exp: 30, money: 80 } },
  /* ----- 본부 (공통 임무) ----- */
  { id: 'hq_scrap', board: '본부', kind: '서브', title: '외벽 정비 지원', desc: '외벽 보수에 쓸 합금 파편 5개를 납품한다.', need: { type: 'item', name: '합금 파편', qty: 5, consume: true }, reward: { exp: 30, money: 80 } },
  { id: 'hq_herb', board: '본부', kind: '서브', title: '의무실 보급', desc: '의무실에 약초 4개를 납품한다.', need: { type: 'item', name: '약초', qty: 4, consume: true }, reward: { exp: 25, money: 60, items: [['응급 키트', 1]] } },
  { id: 'hq_hunt', board: '본부', kind: '서브', title: '지상 개체 소탕', desc: '지상의 몬스터를 아무거나 3마리 처치한다. (수주한 뒤부터 센다)', need: { type: 'kill', monster: null, qty: 3 }, reward: { exp: 40, money: 100 } },
  /* ----- 지상 구역 안전 캠프 (구역 특별 임무) ----- */
  { id: 'z1_wolf', board: '제1구역', kind: '서브', title: '숲 늑대 사냥', desc: '제1구역 야영지를 위협하는 숲 늑대를 3마리 처치한다.', need: { type: 'kill', monster: '숲 늑대', qty: 3 }, reward: { exp: 45, money: 120 } },
  { id: 'z1_wood', board: '제1구역', kind: '서브', title: '야영지 보수', desc: '캠프 보수에 쓸 목재 6개를 납품한다.', need: { type: 'item', name: '목재', qty: 6, consume: true }, reward: { exp: 35, money: 90, items: [['건조 식량', 2]] } },
  { id: 'z2_crab', board: '제2구역', kind: '서브', title: '모래게 퇴치', desc: '백사장을 점령한 모래게를 3마리 처치한다.', need: { type: 'kill', monster: '모래게', qty: 3 }, reward: { exp: 50, money: 130 } },
  { id: 'z2_salt', board: '제2구역', kind: '서브', title: '염전 복구', desc: '염전 복구용 소금 5개를 납품한다.', need: { type: 'item', name: '소금', qty: 5, consume: true }, reward: { exp: 40, money: 100, items: [['수분 팩', 2]] } },
  { id: 'z3_fire', board: '제3구역', kind: '서브', title: '화염 정령 진압', desc: '화산 중턱의 화염 정령을 2마리 처치한다.', need: { type: 'kill', monster: '화염 정령', qty: 2 }, reward: { exp: 70, money: 200 } },
  { id: 'z3_crystal', board: '제3구역', kind: '서브', title: '화염 결정 수집', desc: '연구실에서 요청한 화염 결정 3개를 납품한다.', need: { type: 'item', name: '화염 결정', qty: 3, consume: true }, reward: { exp: 60, money: 180, items: [['응급 키트', 2]] } }
];
/* 승급 시험: 메인 임무 형식. 본부 '승급'에서 받고, 임무를 마치면 등급이 오른다 (D등급까지). need.type 'multi' = 여러 조건을 모두 달성 */
QUESTS.push(
  { id: 'promo_e', promo: 'E', lv: 3, kind: '메인', title: '승급 시험 · E등급', desc: '숲 늑대 3마리를 처치하고 약초 3개를 납품한다.',
    need: { type: 'multi', parts: [{ type: 'kill', monster: '숲 늑대', qty: 3 }, { type: 'item', name: '약초', qty: 3, consume: true }] }, reward: { exp: 70, money: 150, items: [['응급 키트', 2], ['정찰 배낭', 1]] } },
  { id: 'promo_d', promo: 'D', lv: 6, kind: '메인', title: '승급 시험 · D등급', desc: '모래게 3마리와 화염 정령 1마리를 처치하고 합금 파편 8개를 납품한다.',
    need: { type: 'multi', parts: [{ type: 'kill', monster: '모래게', qty: 3 }, { type: 'kill', monster: '화염 정령', qty: 1 }, { type: 'item', name: '합금 파편', qty: 8, consume: true }] }, reward: { exp: 180, money: 400, items: [['고급 응급 키트', 2], ['원정 배낭', 1]] } }
);
const PROMO_ORDER = ['F', 'E', 'D']; // 지금은 D등급까지만 승급할 수 있다
const BOARD_RESET_MS = 24 * 3600 * 1000; // 임무 수주 임무는 수주한 뒤 24시간이 지나면 리셋된다
const BOARD_MAX_ACTIVE = 5;
/* 친구 / 메일. 다른 대원은 서버 연결 후에 나타난다 (그 전에는 친구를 만들 수 없다) */
const FRIEND_MAX = 30;
const MAIL_KEEP_DAYS = 15, MAIL_KEEP_MAX = 30, MAIL_BOX_MAX = 60;  // 보존하지 않은 메일은 15일 뒤 사라지고, 보존은 30통까지
const MAIL_ITEM_KINDS = 3, MAIL_ITEM_TOTAL = 20;                  // 첨부: 종류 3개 · 합계 20개까지 (운송장치 1개 소모)
const MAIL_SHIP_ITEM = '운송장치';


/* 상점: 상점가(공중)와 지상 구역 안전 캠프. base = 기본 보급품, special = 그 장소에서만 파는 특별 상품. 가격은 CR */
const SHOP_BASE = [['건조 식량', 10], ['수분 팩', 6], ['응급 키트', 20]];
const campBase = SHOP_BASE.map(([n, p]) => [n, Math.round(p * 1.3)]); // 캠프는 조금 비싸다
const SHOPS = {
  '상점가': { title: '상점가 · 종합 상점', base: SHOP_BASE, special: [['정찰용 바이저', 250], ['경량 방탄복', 300], ['전술 장갑', 150], ['자력 부츠', 200], ['확장형 전술 가방', 600], ['고급 응급 키트', 45], ['귀환 신호기', 40], ['펫 사료', 14], ['운송장치', 30], ['감자 씨앗', 6], ['허브 씨앗', 8], ['사탕무 씨앗', 10]] },
  '제1구역': { title: '제1구역 캠프 보급소', base: campBase, special: [['이끼 위장 망토', 260], ['귀환 신호기', 52], ['생체 섬유', 14], ['약초', 12], ['야생 열매 씨앗', 12]] },
  '제2구역': { title: '제2구역 캠프 보급소', base: campBase, special: [['해무 고글', 280], ['귀환 신호기', 52], ['소금', 12], ['해초', 12], ['해풍 콩 씨앗', 16]] },
  '제3구역': { title: '제3구역 캠프 보급소', base: campBase, special: [['방열 장갑', 300], ['귀환 신호기', 52], ['유황', 16], ['흑요석', 20], ['화산 고추 씨앗', 22]] },
  '제4구역': { title: '제4구역 캠프 보급소', base: campBase, special: [['귀환 신호기', 52], ['사암', 12], ['구리 광석', 18], ['협곡 허브', 16], ['협곡 보리 씨앗', 26]] },
  '제5구역': { title: '제5구역 캠프 보급소', base: campBase, special: [['귀환 신호기', 52], ['얼음 조각', 20], ['서리 이끼', 16], ['설산 약초', 22], ['설원 순무 씨앗', 30]] }
};

/* 길드: 길드장이 만들고 초대한다. 초대할 수 있는 대원은 서버 연결 후에 나타난다 */
const GUILD_MAX = 20, GUILD_NAME_MAX = 12, GUILD_NAME_MIN = 2;

/* 도감 분류 */
const ITEM_CATEGORIES = ['장비', '소모품', '재료'];
const MONSTER_KINDS = ['이능 몬스터', '짐승'];
const STICKERS = [['인사', 'waving_hand'], ['확인', 'thumb_up'], ['감사', 'favorite'], ['웃음', 'sentiment_very_satisfied'], ['응원', 'celebration'], ['주의', 'warning'], ['슬픔', 'sentiment_dissatisfied'], ['잠깐', 'hourglass_top']];

/* 칭호: [이름, 달성 조건 문장, 조건 함수]. 한 번 달성하면 계속 가진다 (state.titles). 프로필에서 조건과 획득 여부를 볼 수 있다 */
const TITLE_DEFS = [
  ['신입 능력자', '기본 칭호', () => true],
  ['재탄생자', '한 번 죽음을 맞이하고 클론으로 다시 깨어난다', () => state.deaths >= 1],
  ['선봉 탐색자', '지상의 미궁에 처음 입장한다', () => !!state.flags.entered],
  ['전술 분석관', '도감에 아이템 20종을 등록한다', () => Object.keys(state.codex.items).length >= 20],
  ['생존 전문가', '도감에 몬스터 5종을 등록한다', () => Object.keys(state.codex.monsters).length >= 5],
  ['도시의 개척자', '레벨 10에 도달한다', () => state.character.level >= 10],
  ['정식 대원', '승급 시험을 통과해 E등급이 된다', () => 'EDCBAS'.includes(state.character.rank)],
  ['숙련 대원', '승급 시험을 통과해 D등급이 된다', () => 'DCBAS'.includes(state.character.rank)],
  ['새싹 농부', '농장에서 작물을 수확해 도감에 등록한다', () => Object.keys(CROPS).some(n => state.codex.items[n])],
  ['길들이는 자', '지상에서 펫을 길들인다', () => state.pets.length > 0],
  ['동물 친구', '펫을 3종 이상 모은다', () => state.pets.length >= 3],
  ['견습 장인', '서브잡 레벨 3에 도달한다', () => !!state.subjob && state.subjob.level >= 3]
];
const TITLES = TITLE_DEFS.map(t => t[0]);
const TRADE_DAILY = 3; // 주위 대원과의 물건 교환은 하루 3회
const NEARBY_PLAYERS = []; // 같은 장소의 다른 대원 [이름, 상태, 내놓은 물건 [[아이템, 수량], ...]]. 서버 연결 후 채워진다 (지금은 비어 있음)

const POSTS = {
  '공지': [
    ['서버 공지', '현재 화면은 UI 프로토타입입니다. 서버 계정과 다른 대원 간 동기화는 아직 연결되지 않았습니다.'],
    ['점검 일정', '차기 업데이트에서 제작, 농사, 전투 시스템을 확장할 예정입니다.']
  ],
  '가이드': [
    ['제작 정보', '이 페이지의 코딩과 스크립트(HTML·CSS·JavaScript)는 Anthropic의 AI "Claude"로 제작되었습니다. 세계관과 게임 기획은 제작자가 직접 만든 것이며, 오류나 불편한 점은 상단의 버그 리포트로 알려 주세요.'],
    ['탐색과 이동', '지도의 노드를 누르면 바로 이동합니다. 지상(제1~3구역)은 지도의 「이동장치」에서 가고 싶은 구역을 골라요. 지상으로 내려가는 데는 1분과 기력이 조금 들어서 한 번 물어봐요. 안전구역끼리의 이동은 시간도 기력도 들지 않아 바로 이동하고, 지상에서 이동장치로 돌아오는 것도 바로 돼요. 지상에 입장하면 타일 지도가 열리고, 타일 한 칸을 옮길 때마다 1분과 기력 1이 들어요. 시간이 흐르는 행동만 먼저 확인창을 거칩니다.'],
    ['방치형 행동', '타일 이동은 칸당 3분(험난한 지형은 +2~3분), 채집은 1회 5분, 전투는 1회 5~8분이 걸리며 30분/1시간/4시간 다중행동도 고를 수 있습니다. 조사는 즉시 끝납니다. 창을 닫아도 시간은 흐르며, 완료되면 결과 확인을 눌러 보상을 받습니다. 실시간 전투는 없습니다.'],
    ['HP · 기력 · EXP', 'HP는 전투와 채집 중 사고로 줄어들며 응급 키트 같은 약품으로 회복합니다. 기력은 이동·채집·전투(이능력 사용)로 줄어들며 식량으로 회복합니다. EXP가 가득 차면 레벨이 오르고 최고 레벨은 30입니다.'],
    ['공중과 지상', '본부·개인실·상점가는 공중(안전지대)이라 위험이 없고 이동에 시간이 걸리지 않습니다. 제1~3구역은 지상으로, 타일 지도를 따라 탐색하며 몬스터와 사고의 위험이 있습니다. 지상 곳곳의 안전 캠프에서는 휴식, 임무 수주, 상점을 이용할 수 있습니다.'],
    ['채집·채굴·낚시', '지형마다 얻을 수 있는 재료와 방법이 다릅니다. 풀과 열매는 채집, 광석과 소금은 채굴, 물고기는 낚시로 얻습니다. 지능이 높으면 대성공(2개 획득), 의지가 높으면 희귀 재료를 얻을 확률이 올라갑니다.'],
    ['제작', '인벤토리 옆 제작 탭에서 재료를 모아 아이템을 만듭니다. 제작은 시간이 걸리며 다른 행동과 동시에 진행됩니다. 감각이 높으면 시간이 줄고, 행운이 높으면 대성공으로 2개가 만들어집니다.'],
    ['임무와 상점', '임무는 처음에 메인 임무만 있고, 나머지는 본부와 지상의 안전 캠프에서 수주합니다. 완수한 임무는 목록에서 사라집니다. 본부는 공통 임무, 캠프는 그 구역만의 특별 임무가 나옵니다. 상점은 상점가와 캠프에 있으며, 캠프는 기본 보급품과 구역 특산품을 조금 비싸게 팝니다. 임무는 동시에 5개까지 진행할 수 있습니다.'],
    ['채팅과 길드', '채팅은 월드·길드·알림 채널이 있습니다. 알림 채널은 공지를 받는 곳이라 글을 쓸 수 없습니다. 길드는 프로필의 길드 버튼에서 만들거나 가입할 수 있고, 길드장은 다른 대원를 초대할 수 있습니다. 길드 채널은 길드원끼리만 대화합니다.'],
    ['반복과 재설정', '같은 채집·전투를 4번째 이상 반복하면 아이템을 얻을 확률이 점점 떨어집니다(경험치는 그대로). 12시간이 지나면 횟수가 초기화됩니다. 조사처럼 즉시 끝나는 행동은 한 번 하면 12시간 뒤에 다시 할 수 있습니다.'],
    ['쓰러졌을 때', '전투에서 패배하면 부상 상태로 후퇴합니다. 행동 중 입는 피해는 HP 1에서 멈춰요. 하지만 HP가 1인 채로 또 다치면 죽습니다. 죽으면 클론이 본부에서 재탄생해요. HP 50으로 깨어나 부상 상태가 되고 구조비(보유 CR의 10%, 최대 80)를 내며, 그 행동의 보상은 받지 못하지만 레벨과 소지품은 그대로예요. 첫 재탄생에는 칭호도 주어집니다. 기력이 바닥나 움직일 수 없는데 회복 아이템도 없으면 정신을 잃고 본부로 구조돼요(이건 죽지 않아요). 귀환 신호기를 챙기면 미리 돌아올 수 있습니다.'],
    ['스탯과 장비', '레벨이 오를 때마다 스탯 포인트 1을 얻어 스테이터스에서 올릴 수 있습니다. 근력=전투 대성공, 민첩=피격 감소, 지능=채집 대성공, 의지=희귀 채집, 감각=제작 시간 단축, 행운=제작 대성공입니다. 장비 칸을 누르면 장착, 마우스를 올리면 설명이 표시됩니다.']
  ],
  '세계관': [
    ['공중도시 딥 레이어', '공중도시 딥 레이어는 인류 멸망 이후 공중에 구축된 과학도시입니다. 클론이 아닌 순수한 인간은 확인이 불가능합니다. 적어도 당신의 계급으로는요.\n위험이 도사리는 지상과 달리 딥 레이어는 표백된 듯 모든 것이 안전합니다.'],
    ['클론 인간', '당신은 클론 인간입니다. 원본이 되는 인간의 기억이 남아있지만, 당신은 복제품입니다. 이능력을 하나 가지고 있으며, 이것은 원본 인간이 가지고 있었던 능력일 수도 있고 클론으로 재구성 될 때 부여받은 능력일 수도 있습니다.\n몸이 죽어도 데이터는 보존되어 새로운 몸으로 태어납니다. 당신의 사명은 지상 탐색과 인류의 재부흥입니다.']
  ]
};

/* 알림 채널: 공지만 받는 읽기 전용 채널. 내용은 공지 게시판에서 만든다 */
const NOTICE_FEED = () => POSTS['공지'].map(([t, m]) => [t, m]);

/* ---------- 새 게임 기본 상태 ---------- */
function createDefaultState() {
  return {
    version: SAVE_VERSION,
    character: { name: '', title: '신입 능력자', age: 20, keywords: '', level: 1, rank: 'F', ability: '', abilityDesc: '', allowFriend: true, allowGuild: true },
    location: DEFAULT_LOCATION,
    zoom: 1,
    pan: { x: 0, y: 0 },
    leftTab: 'EQUIP',
    created: false,      // 튜토리얼에서 캐릭터를 만들었는가
    tutorialDone: false, // 튜토리얼(무기 선택까지)을 마쳤는가
    crafting: null,      // 제작 중인 작업 { index, out, qty, startAt, endAt, great, ready }
    craftTab: null,
    invTab: null,        // null = 전체, 아니면 장비/소모품/재료
    page: 1,
    side: '임무',
    chatTab: '월드',
    money: 100,
    statPoints: 0,
    stats: { str: STAT_BASE, agi: STAT_BASE, int: STAT_BASE, wil: STAT_BASE, sen: STAT_BASE, luk: STAT_BASE }, // 모든 캐릭터 총합 동일 (생성 시 12포인트 분배)
    vitals: { hp: 100, hpMax: 100, sp: 100, spMax: 100, exp: 0 },
    equipment: {
      '머리': null, '상의': null, '하의': null, '장갑': null, '신발': null,
      '얼굴': null, '귀': null, '목': null, '손 1': null, '손 2': null, '무기': null, '가방': null
    },
    inventory: {
      '장비': [],
      '소모품': [], // 튜토리얼에서 무기를 받으면 START_KIT을 받는다
      '재료': []
    },
    buffs: [],          // [{id, endAt}]
    active: null,       // 진행 중인 행동 {id, startAt, endAt}
    pending: null,      // 완료됐지만 결과 확인 전인 행동 {id, result}
    settings: { bgmOn: true, bgmVolume: BGM_DEFAULT_VOLUME, sfxVolume: 65, clickOn: true, alertOn: true, notify: true, guildAlert: true, cursor: true, fontSize: 'm', theme: 'light', customBase: 'light', customAccent: '#197da1' },
    layout: { left: 292, right: 315 },
    collapsed: {},      // 좁은 화면에서 접은 패널 { 키: true }
    questDone: {},      // { 임무 id: true }
    flags: { chatted: false, entered: false },
    dungeon: null,      // 미궁 안이면 { zone, x, y, seen: {'x,y': 1}, done: [이벤트 인덱스] }
    eventAt: {},  // 이벤트를 치른 시각 { '구역:번호': ms } — EVENT_RESET_MS가 지나면 다시 생긴다
    trades: { day: '', n: 0 }, // 주위 대원과 물건을 교환한 날짜와 횟수 (하루 TRADE_DAILY회)
    enchants: {}, // 장비 강화 { 장비 이름: { k: 스탯키|'hp'|'sp', v, n(강화 횟수) } }
    learned: [],  // 단련으로 배운 레시피 이름 (기본 레시피는 STARTER_RECIPES)
    explored: {}, // 구역별로 이미 가 본 칸 { 구역ID: { 'x,y': 1 } } — 다시 들어가도 계속 보인다
    codex: { zones: { '본부': 1 }, items: {}, monsters: {}, recipes: {} },
    logs: [],
    questTaken: {},     // 수주한 임무 { id: true } (수주/승급 시험)
    questAt: {},        // 수주 임무를 받은 시각 { id: ms } — 24시간 뒤 리셋
    farm: { plots: [] }, // 농장 밭 [{ crop, at } | null ...]
    pets: [],           // 길들인 펫 [{ id(종), bond, fedAt }]
    deaths: 0, // 죽은 횟수
    titles: ['신입 능력자'], // 획득한 칭호
    friends: [],        // 친구 [이름...] (최대 FRIEND_MAX)
    mail: [],           // 메일 [{ id, from, subject, body, items, at, kept, read, got }] — 15일 뒤 사라짐(보존 제외)
    mailSeq: 1,
    petActive: -1,      // 함께 다니는 펫의 인덱스 (-1 = 없음)
    subjob: null,       // 서브잡 { name, tags, level, prog, lastAt }
    qprog: {},          // 처치 임무 진행도 { id: 수 }
    guild: null,        // 길드 { name, master: 길드장인가, members: [이름...](나 제외) }
    invAt: {},          // 조사한 칸 { '구역,x,y': 시각(ms) } — 12시간 뒤 다시 조사 가능
    repeats: {},        // 반복 횟수 { "행동 id@구역,x,y": { n, at } } (같은 장소의 같은 행동만 누적) — 4번째부터 아이템 확률 저하, 12시간 뒤 초기화
    chats: {
      '월드': [['관제 시스템', '월드 채널 연결 완료.']],
      '길드': [['시스템', '길드 채널은 길드에 가입하거나 만든 뒤 사용할 수 있습니다.']],
      '알림': NOTICE_FEED()
    }
  };
}


/* ---------- 튜토리얼 ----------
   story: 처음에 한 번 보여주는 이야기 { who: null(해설) | 'npc', text } / steps: 화면의 각 부분을 하나씩 짚어 주는 안내 (sel = 강조할 요소)
   흐름: 이야기 → 캐릭터 생성(이름·나이·키워드 → 이능력·스탯) → 화면 안내 → 무기 선택 */
const TUTORIAL_NPC = { name: '리코', role: '안내 안드로이드', icon: 'smart_toy' };
const TUTORIAL_STORY = [
  { who: null, text: '고고도 군사 공중도시 「딥 레이어」.\n지상을 버린 인류는 구름 위 거대한 플랫폼에서 살아가고 있다.' },
  { who: null, text: '이곳에서 새로운 타입의 인간이 태어난다.\n이능 발현에 최적화된 몸 — 클론 인간.\n당신도 그중 하나다.' },
  { who: null, text: '죽음은 끝이 아니다.\n기억과 데이터는 보존되고, 새 몸은 얼마든지 다시 만들 수 있다.\n그래서 도시는 주저 없이 당신을 지상으로 보낸다.' },
  { who: null, text: '배양실의 불빛이 켜지고, 눈이 떠진다.\n누군가 유리 너머에서 당신을 내려다보고 있다.' },
  { who: 'npc', text: '탄생을 축하드려요! 저는 안내 안드로이드 「리코」예요.\n새 몸은 어떠세요? 아직 낯설 거예요. 천천히 적응하면 돼요.' },
  { who: 'npc', text: '이건 탐색자 단말기예요. 지도, 소지품, 임무, 채팅이 전부 이 안에 들어 있어요.\n자, 받으세요. 이제부터 당신의 것이에요.', gift: true },
  { who: 'npc', text: '그럼 먼저 새 몸의 이름부터 정해 볼까요?\n이름, 나이, 키워드, 이능력, 그리고 스테이터스를 정하고 나면 단말기 사용법을 알려 드릴게요.' }
];
const TUTORIAL_REPLAY_FROM = 4; // 다시 보기: 리코의 인사부터 (캐릭터 생성·무기 선택은 건너뜀)
const TUTORIAL_STEPS = [
  { sel: '.profile-panel', title: '내 몸 상태', text: '여기엔 이름과 칭호, 소지금(CR)이 보여요. HP는 전투와 사고로, 기력은 이동·채집·전투로 줄어요. HP는 약품, 기력은 식량으로 회복하세요. 죽어도 새 클론 몸으로 되살아나니 겁먹지 마세요! EXP가 가득 차면 레벨이 올라요(만렙 30).' },
  { sel: '.status-panel', title: '스테이터스', text: '레벨이 오를 때마다 스탯 포인트 1을 얻어요. + 버튼으로 올리면 근력은 전투 대성공, 민첩은 피격 감소, 지능은 채집 대성공, 의지는 희귀 채집, 감각은 제작 시간 단축, 행운은 제작 대성공 확률에 도움이 돼요.' },
  { sel: '.tabs-panel', title: '장비 · 소지품 · 제작', text: '장비 칸을 누르면 아래에 착용 가능한 아이템이 나타나요. 소지품은 장비/소모품/재료로 걸러 볼 수 있고, 제작 탭에서는 재료로 회복약이나 가방을 만들 수 있어요. 제작에는 시간이 걸리지만 다른 행동을 하는 중에도 진행돼요.' },
  { sel: '.map-panel', title: '지도', text: '노드를 누르면 이동할지 물어봐요. 안전구역끼리의 이동은 시간도 기력도 들지 않아요. 지상으로 내려갈 때만 1분과 기력이 들어요. 아래 LOG에는 최근 기록이 쌓여요.' },
  { sel: '#actionPanel', title: '구역 활동', text: '오른쪽 선택지를 고르면 예상 시간과 보상·손실을 먼저 보여 드려요. 채집은 1회 5분, 전투는 1회 5~8분이고 30분·1시간·4시간 다중행동도 가능해요. 창을 닫아도 시간은 흘러요. 끝나면 오른쪽 아래 「결과 확인」으로 보상을 받으세요.' },
  { sel: '.map-panel', title: '지상 미궁', text: '지상(제1~3구역)에서 「입장」하면 타일 지도가 열려요. 타일은 지형마다 채집 재료와 몬스터가 달라요. 가고 싶은 타일을 누르면 이동 확인창이 뜨고, 한 칸마다 1분과 기력 1이 들어요. 멀리 있는 타일도 누르면 시간을 들여 이동해요. 안전 캠프에서는 쉴 수 있고, 입구에서 「퇴장」해요.' },
  { sel: '.quest-panel', title: '임무', text: '임무를 누르면 바로 아래로 상세가 펼쳐져요. 조건을 채우면 「임무 완수」로 보상을 받아요. 「주위 대원」 탭에서는 같은 장소에 있는 탐색자를 볼 수 있어요.' },
  { sel: '.chat-panel', title: '단말기 채팅', text: '월드·길드 채널로 대화하고 알림 채널에서 공지를 받아요.  대화해요. 😊 버튼을 누르면 입력창 위에 이모티콘이 나타나고, 누르면 바로 전송돼요.' },
  { sel: '.top-actions', title: '메뉴', text: '공지·가이드·세계관과 설정(소리·테마·알림·커서·튜토리얼 다시 보기)이 있어요. 왼쪽 프로필의 작은 버튼으로 메일·친구·길드·도감을 열 수 있고요. 자, 마지막으로 무기를 하나 골라 볼까요?' }
];
const START_KIT = [['건조 식량', 3], ['응급 키트', 1]]; // 무기를 고른 뒤 받는 기본 보급품
const WEAPON_NAMES = ['훈련용 검', '훈련용 단검', '훈련용 창', '훈련용 활', '훈련용 너클', '훈련용 권총'];
