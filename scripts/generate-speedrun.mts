#!/usr/bin/env /usr/local/bin/npx tsx
/**
 * Generate 1000 speedrun levels: 40 techniques × 25 levels each.
 * Each technique uses a priority detector registry to ensure detection.
 * All puzzles: source "self-generated-no-third-party", mode "speedrun".
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import { SolverBoard } from '../src/solver/board';
import { DETECTOR_REGISTRY } from '../src/solver/registry';
import type { DetectorFn, DetectionResult } from '../src/solver/types';

// Import all detectors
import { detectNakedSingle } from '../src/solver/detectors/phase1/nakedSingle';
import { detectHiddenSingle } from '../src/solver/detectors/phase1/hiddenSingle';
import { detectLockedCandidates } from '../src/solver/detectors/phase1/lockedCandidates';
import { detectNakedPair } from '../src/solver/detectors/phase1/nakedPair';
import { detectHiddenPair } from '../src/solver/detectors/phase1/hiddenPair';
import { detectNakedTriple } from '../src/solver/detectors/phase1/nakedTriple';
import { detectHiddenTriple } from '../src/solver/detectors/phase1/hiddenTriple';
import { detectXWing } from '../src/solver/detectors/phase2/xWing';
import { detectFinnedXWing } from '../src/solver/detectors/phase2/finnedXWing';
import { detectSkyscraper } from '../src/solver/detectors/phase2/skyscraper';
import { detectXYWing } from '../src/solver/detectors/phase2/xyWing';
import { detectXYZWing } from '../src/solver/detectors/phase2/xyzWing';
import { detectWWing } from '../src/solver/detectors/phase2/wWing';
import { detectUniqueRectangle } from '../src/solver/detectors/phase2/uniqueRectangle';
import { detectXCycleSimpleColoring } from '../src/solver/detectors/phase2/xCycleSimpleColoring';
import { detectSwordfish } from '../src/solver/detectors/phase2/swordfish';
import { detectFinnedSwordfish } from '../src/solver/detectors/phase2/finnedSwordfish';
import { detectRemotePairs } from '../src/solver/detectors/phase2/remotePairs';
import { detectTwoStringKite } from '../src/solver/detectors/phase2/twoStringKite';
import { detectEmptyRectangle } from '../src/solver/detectors/phase2/emptyRectangle';
import { detectBugPlusOne } from '../src/solver/detectors/phase2/bugPlusOne';
import { detectJellyfish } from '../src/solver/detectors/phase2/jellyfish';
import { detectFinnedJellyfish } from '../src/solver/detectors/phase2/finnedJellyfish';
import { detectAic } from '../src/solver/detectors/phase3/aic';
import { detectAicMidChain } from '../src/solver/detectors/phase3/aicMidChain';
import { detectGroupedAicNiceLoop } from '../src/solver/detectors/phase3/groupedAicNiceLoop';
import { detectAicLongChain } from '../src/solver/detectors/phase3/aicLongChain';
import { detectAlsXz } from '../src/solver/detectors/phase3/alsXz';
import { detectAlsChain } from '../src/solver/detectors/phase3/alsChain';
import { detectForcingChainNet } from '../src/solver/detectors/phase3/forcingChainNet';
import { detectExocetDeathBlossom } from '../src/solver/detectors/phase3/exocetDeathBlossom';
import { detectXyChain } from '../src/solver/detectors/phase3/xyChain';
import { detectDiscontinuousNiceLoop } from '../src/solver/detectors/phase3/discontinuousNiceLoop';
import { detectCellForcingChain } from '../src/solver/detectors/phase3/cellForcingChain';
import { detectRegionForcingChain } from '../src/solver/detectors/phase3/regionForcingChain';
import { detectTemplate } from '../src/solver/detectors/phase3/template';
import { detectAlsXy } from '../src/solver/detectors/phase3/alsXy';
import { detectAlsWWing } from '../src/solver/detectors/phase3/alsWWing';
import { detectSueDeCoq } from '../src/solver/detectors/phase3/sueDeCoq';
import { detectDeathBlossom } from '../src/solver/detectors/phase3/deathBlossom';

const PHASE1: DetectorFn[] = [
  detectNakedSingle, detectHiddenSingle, detectLockedCandidates,
  detectNakedPair, detectHiddenPair, detectNakedTriple, detectHiddenTriple,
];

const DETECTOR_MAP: Record<string, DetectorFn> = {
  naked_single: detectNakedSingle, hidden_single: detectHiddenSingle,
  locked_candidates: detectLockedCandidates, naked_pair: detectNakedPair,
  hidden_pair: detectHiddenPair, naked_triple: detectNakedTriple,
  hidden_triple: detectHiddenTriple, x_wing: detectXWing,
  finned_x_wing: detectFinnedXWing, skyscraper: detectSkyscraper,
  xy_wing: detectXYWing, xyz_wing: detectXYZWing, w_wing: detectWWing,
  unique_rectangle: detectUniqueRectangle, x_cycle_simple_coloring: detectXCycleSimpleColoring,
  swordfish: detectSwordfish, finned_swordfish: detectFinnedSwordfish,
  remote_pairs: detectRemotePairs, two_string_kite: detectTwoStringKite,
  empty_rectangle: detectEmptyRectangle, bug_plus_one: detectBugPlusOne,
  jellyfish: detectJellyfish, finned_jellyfish: detectFinnedJellyfish,
  aic: detectAic, aic_mid_chain: detectAicMidChain,
  grouped_aic_nice_loop: detectGroupedAicNiceLoop, aic_long_chain: detectAicLongChain,
  als_xz: detectAlsXz, als_chain: detectAlsChain,
  forcing_chain_net: detectForcingChainNet, exocet_death_blossom: detectExocetDeathBlossom,
  xy_chain: detectXyChain, discontinuous_nice_loop: detectDiscontinuousNiceLoop,
  cell_forcing_chain: detectCellForcingChain, region_forcing_chain: detectRegionForcingChain,
  template: detectTemplate, als_xy: detectAlsXy, als_w_wing: detectAlsWWing,
  sue_de_coq: detectSueDeCoq, death_blossom: detectDeathBlossom,
};

const TECH_TIER: Record<string, string> = {
  naked_single: 'T01', hidden_single: 'T01',
  locked_candidates: 'T02', naked_pair: 'T02', hidden_pair: 'T02',
  naked_triple: 'T03', hidden_triple: 'T03',
  x_wing: 'T04', unique_rectangle: 'T04', bug_plus_one: 'T04',
  skyscraper: 'T05', two_string_kite: 'T05', empty_rectangle: 'T05',
  finned_x_wing: 'T05', xy_wing: 'T05', xyz_wing: 'T05', w_wing: 'T05', remote_pairs: 'T05',
  swordfish: 'T06', x_cycle_simple_coloring: 'T06',
  finned_swordfish: 'T06', jellyfish: 'T06', finned_jellyfish: 'T06',
  aic: 'T07', aic_mid_chain: 'T07', xy_chain: 'T07',
  aic_long_chain: 'T08', grouped_aic_nice_loop: 'T08', discontinuous_nice_loop: 'T08',
  als_xz: 'T09', als_xy: 'T09', als_w_wing: 'T09', als_chain: 'T09',
  forcing_chain_net: 'T10', cell_forcing_chain: 'T10', region_forcing_chain: 'T10',
  template: 'T11', sue_de_coq: 'T11',
  death_blossom: 'T12', exocet_death_blossom: 'T12',
};

// ── 40 techniques in manifest order with stage names and 25 level names ──
const STAGES: Array<{
  technique: string; stageName: string; stars: number;
  levelNames: string[];
}> = [
  { technique: 'naked_single', stageName: '啟蒙', stars: 1, levelNames: [
    '初見微光','心眼初開','靜觀其變','一念清明','霧散雲開',
    '洞見纖毫','澄心凝視','直指本源','明鏡止水','破曉之聲',
    '靈犀一閃','水到渠成','順勢而為','掌中乾坤','一葉知秋',
    '虛室生白','返璞歸真','朗月當空','了然於胸','心無罣礙',
    '萬法歸一','大道至簡','舉重若輕','豁然開朗','圓融無礙',
  ]},
  { technique: 'hidden_single', stageName: '觀照', stars: 2, levelNames: [
    '暗處有光','隱跡現蹤','察言觀色','霧裡看花','撥雲見日',
    '草蛇灰線','順藤摸瓜','見微知著','抽絲剝繭','潛龍在淵',
    '暗渡陳倉','藏鋒守拙','以靜制動','伏脈千里','含光內斂',
    '虛懷若谷','幽深莫測','靜水流深','暗香浮動','積微成著',
    '如影隨形','默察秋毫','無聲之雷','隱而不發','燭照幽微',
  ]},
  { technique: 'locked_candidates', stageName: '封鎖', stars: 3, levelNames: [
    '畫地為牢','困獸之鬥','關門打狗','鐵壁銅牆','水洩不通',
    '甕中捉鱉','四面楚歌','天羅地網','插翅難飛','密不透風',
    '銅牆鐵壁','金鎖長關','重圍之困','斷其退路','封疆劃界',
    '固若金湯','滴水不漏','結界封印','禁域之守','閉關鎖隘',
    '困龍之局','斬斷歸途','牢不可破','絕路逢生','破局而出',
  ]},
  { technique: 'naked_pair', stageName: '雙契', stars: 4, levelNames: [
    '比翼齊飛','琴瑟和鳴','珠聯璧合','如影隨行','雙劍合璧',
    '心有靈犀','鸞鳳和鳴','相知相惜','並蒂蓮開','金玉良緣',
    '形影不離','唇齒相依','同氣連枝','左右逢源','雙星拱月',
    '陰陽調和','剛柔並濟','水乳交融','相輔相成','連理之枝',
    '一體兩面','對鏡生輝','雙璧無瑕','契合無間','天作之合',
  ]},
  { technique: 'hidden_pair', stageName: '藏雙', stars: 5, levelNames: [
    '霧鎖雙峰','暗藏玄機','深淵雙眼','雙隱之局','密室之約',
    '影中有影','雙面伏筆','潛伏之契','隱鋒雙刃','暗合之勢',
    '幽谷迴聲','雲深不知','深藏若虛','伏流暗湧','雙珠暗藏',
    '匿跡雙星','無聲雙弦','潛行之道','暗花雙蕊','隱約其間',
    '靜默雙影','暗夜之瞳','藏而後發','雙伏之勢','水底雙月',
  ]},
  { technique: 'naked_triple', stageName: '編織', stars: 6, levelNames: [
    '三線交錯','經緯縱橫','絲絲入扣','千絲萬縷','穿針引線',
    '環環相扣','結網天羅','交織成章','脈絡貫通','錯落有致',
    '紋理分明','巧手織錦','三弦共振','織夢成真','密織天幕',
    '綱舉目張','條分縷析','繁而不亂','層疊相生','盤根錯節',
    '細密如網','鉤玄提要','三索歸一','編纂成局','渾然天成',
  ]},
  { technique: 'hidden_triple', stageName: '隱流', stars: 7, levelNames: [
    '暗流湧動','潛流三疊','深水靜流','隱脈三分','伏流歸海',
    '三泉暗匯','水下暗渠','暗河蜿蜒','潛行三道','靜流無聲',
    '隱泉出谷','三流歸宗','伏波千里','暗潮洶湧','淵底激流',
    '涓滴匯流','隱瀑三層','地脈暗通','潛龍三現','深流如訴',
    '靜水三弦','暗湧回旋','伏流穿石','三隱歸源','歸海之途',
  ]},
  { technique: 'x_wing', stageName: '破陣', stars: 8, levelNames: [
    '橫掃千軍','長驅直入','破竹之勢','旗開得勝','勢如破竹',
    '一馬當先','摧枯拉朽','銳不可當','大軍壓境','兵臨城下',
    '背水一戰','四面合圍','十面埋伏','出其不意','攻其不備',
    '聲東擊西','圍魏救趙','以逸待勞','調虎離山','斬將搴旗',
    '一鼓作氣','乘勝追擊','窮寇莫追','凱旋而歸','功成名就',
  ]},
  { technique: 'finned_x_wing', stageName: '天望', stars: 9, levelNames: [
    '登高望遠','極目天涯','俯瞰蒼穹','鷹眼識途','雲端瞭望',
    '星河在目','遠眺四方','凌霄之眸','穿雲破霧','天際之光',
    '俯視塵寰','鳥瞰大地','高屋建瓴','居高臨下','目極千里',
    '天眼通明','望穿秋水','極視聽之','遠見卓識','洞察先機',
    '瞰盡河山','目送飛鴻','凌空俯視','天外之眼','盡收眼底',
  ]},
  { technique: 'skyscraper', stageName: '鋒刃', stars: 10, levelNames: [
    '削鐵如泥','吹毛斷髮','一刀兩斷','鋒芒畢露','劍氣縱橫',
    '快刀亂麻','刃上行走','鋒銳無匹','出鞘之刻','斬釘截鐵',
    '見血封喉','刀光劍影','白刃交鋒','短兵相接','兵刃相見',
    '劍走偏鋒','以刃會友','鋒迴路轉','千鈞一刃','鑄劍為犁',
    '刃無虛發','寒光四射','磨刃以須','一劍封喉','歸劍入鞘',
  ]},
  { technique: 'xy_wing', stageName: '雙翼', stars: 11, levelNames: [
    '振翅高飛','展翼翱翔','羽化登仙','鵬程萬里','雙翼齊展',
    '凌風而起','翼若垂天','扶搖直上','翻雲覆雨','乘風破浪',
    '如鳥斯革','翼展千尺','翱翔天際','御風而行','飛越滄海',
    '振羽之聲','雙翅掠空','逆風飛翔','展翅九霄','羽翼漸豐',
    '翼德之勢','翻飛自如','鳳翼天翔','雙翼護體','大鵬展翅',
  ]},
  { technique: 'xyz_wing', stageName: '三翼', stars: 12, levelNames: [
    '三鳳齊鳴','三星拱照','鼎足而立','三叉之路','三才歸元',
    '三光並耀','三足鼎立','三界通達','三生萬物','三弦同奏',
    '三氣朝元','三陽開泰','三清境界','三元及第','三花聚頂',
    '三位一體','三轉法輪','三昧真火','三教歸一','三山五嶽',
    '三界無礙','三極之道','三台星耀','三界通神','三翼齊振',
  ]},
  { technique: 'w_wing', stageName: '鏡花', stars: 13, levelNames: [
    '水月鏡天','虛實之間','鏡中觀象','花開兩岸','對鏡成雙',
    '空花水月','夢幻泡影','如露如電','鏡裡乾坤','花落知多',
    '映月無痕','虛空妙有','鏡外有鏡','花間迷蹤','倒影浮光',
    '霧裡觀花','水中撈月','鏡淵幽深','花影婆娑','虛鏡實像',
    '光影交錯','鏡破天驚','花謝花開','映照本心','鏡花落盡',
  ]},
  { technique: 'unique_rectangle', stageName: '空鏡', stars: 14, levelNames: [
    '四角玄機','矩陣之眼','方圓之道','界限分明','框架之外',
    '規矩之內','格局已定','方寸之間','四維空間','矩形秘密',
    '邊界之謎','結構之美','對稱之力','唯一之解','非此即彼',
    '排除萬難','矩陣風暴','四方歸正','框定乾坤','格物致知',
    '方正不阿','矩不可違','邊際效應','形而上學','定矩歸元',
  ]},
  { technique: 'x_cycle_simple_coloring', stageName: '流彩', stars: 15, levelNames: [
    '五色交輝','丹青妙筆','彩雲追月','流光溢彩','七彩虹橋',
    '渲染天際','色即是空','斑斕世界','暈染成畫','調色之道',
    '潑墨山水','彩筆生花','層染漸變','色分陰陽','流霞萬丈',
    '幻彩迷離','染指乾坤','著色有道','光譜之間','色空不二',
    '畫龍點睛','妙筆生花','彩鳳呈祥','繪聲繪影','落筆成章',
  ]},
  { technique: 'swordfish', stageName: '法印', stars: 16, levelNames: [
    '結印成法','符文閃耀','咒語成真','印記覺醒','法力無邊',
    '秘法開啟','封印之術','三印合一','真言顯化','法印護體',
    '禁咒解除','結界成形','法陣運轉','符籙天成','印法相傳',
    '密印心法','法輪常轉','印證大道','符文之力','咒印雙修',
    '開印之刻','真印現世','法力凝聚','結印圓滿','大法歸印',
  ]},
  { technique: 'finned_swordfish', stageName: '荊棘', stars: 17, levelNames: [
    '披荊斬棘','荊途漫漫','棘手之題','荊冠之路','棘叢穿行',
    '利刺環伺','荊條纏繞','破棘而入','寸步荊棘','險中求生',
    '以身試棘','荊路花開','棘刺之林','荊門九重','穿棘越障',
    '荊棘鑄冠','破繭成蝶','棘途知返','荊叢覓徑','刺破長空',
    '荊天棘地','棘中有路','負荊請罪','斬棘開路','荊盡甘來',
  ]},
  { technique: 'aic', stageName: '玄鏈', stars: 18, levelNames: [
    '鏈鎖玄關','環扣相連','首尾呼應','鎖鏈之道','一脈相承',
    '強弱相生','交替前行','鏈接天地','扣環不息','鎖定真相',
    '連環推進','鏈中有鏈','環環緊扣','鎖匙之謎','相生相剋',
    '鏈條之力','環繞不絕','鎖鏈之心','連鎖反應','鎖扣解開',
    '鏈入深淵','環迴往復','鎖定勝局','鏈路通達','解鏈歸元',
  ]},
  { technique: 'aic_mid_chain', stageName: '無相', stars: 19, levelNames: [
    '相由心滅','無形之力','虛空法相','不著痕跡','超越形象',
    '空中生有','相空不二','無相真如','離形得似','虛實莫辨',
    '破相而立','無相之境','法相無邊','空即是色','形散意存',
    '無相布施','超脫形骸','真空妙有','離相寂滅','不執於相',
    '無相三昧','相盡真現','法無定相','不立文字','直指人心',
  ]},
  { technique: 'grouped_aic_nice_loop', stageName: '觀海', stars: 20, levelNames: [
    '海納百川','潮起潮落','波瀾壯闊','滄海桑田','碧波萬頃',
    '驚濤拍岸','大浪淘沙','海闊天空','風平浪靜','深海幽藍',
    '海底撈月','浪花飛濺','激流勇進','逆流而上','順水推舟',
    '百川歸海','海市蜃樓','浪跡天涯','濤聲依舊','海枯石爛',
    '乘風踏浪','海天一色','滄海一粟','潮汐輪轉','歸海之心',
  ]},
  { technique: 'aic_long_chain', stageName: '破執', stars: 21, levelNames: [
    '放下執念','破除我執','不執一端','執迷頓悟','萬緣放下',
    '看破紅塵','執中守正','破執見性','不偏不倚','超然物外',
    '放手自在','執一而終','破迷開悟','不滯於物','通達無礙',
    '捨得之間','執念成空','破繭而出','不執不棄','自在無為',
    '放曠自然','破我之劍','執守本真','不動如山','大破大立',
  ]},
  { technique: 'als_xz', stageName: '明空', stars: 22, levelNames: [
    '空明一如','光明遍照','明心見性','空性圓融','澄澈通透',
    '明空雙運','虛空藏海','光明無量','空有不二','明鏡高懸',
    '空谷傳聲','明月清風','空靈之境','光照幽谷','明空交會',
    '空中花雨','明燈指路','空性自在','光華四射','明空合一',
    '空無罣礙','明悟真如','空明之道','光明頂上','圓明歸元',
  ]},
  { technique: 'als_chain', stageName: '照界', stars: 23, levelNames: [
    '照見五蘊','法界圓照','光照大千','遍照十方','普照群生',
    '回光返照','照破無明','光耀法界','照見實相','普光明殿',
    '照徹三界','光明世界','照見本來','遍照法身','明照如鏡',
    '照破迷津','光達邊際','照入深心','普照無遺','明照十方',
    '照見因果','光明藏寶','照世明燈','遍照一切','圓照歸元',
  ]},
  { technique: 'forcing_chain_net', stageName: '玄穹', stars: 24, levelNames: [
    '穹頂之上','蒼穹無極','天穹蒼茫','穹窿萬象','玄天無際',
    '穹蓋八荒','天幕低垂','穹廬四野','蒼天在上','穹頂之光',
    '天穹震顫','玄穹深處','穹頂破曉','蒼穹凝視','穹宇回響',
    '天穹裂變','玄穹之巔','穹頂星辰','蒼穹盡頭','穹宇歸寂',
    '天穹無言','玄穹之眼','穹頂永恆','蒼穹如洗','穹極歸元',
  ]},
  { technique: 'exocet_death_blossom', stageName: '神人', stars: 25, levelNames: [
    '超凡入聖','神而明之','聖凡一體','天人合一','神通廣大',
    '超然絕塵','神遊太虛','聖境初探','天賦異稟','神乎其技',
    '超脫輪迴','神采奕奕','聖心不動','天機莫測','神意難窺',
    '超越自我','神工鬼斧','聖德廣被','天道酬勤','神目如電',
    '超世之才','神乎其神','聖道歸一','天人之際','神聖歸元',
  ]},
  { technique: 'remote_pairs', stageName: '遙對雙珠', stars: 26, levelNames: [
    '遙相呼應','千里傳音','隔空對弈','遠山含黛','天涯比鄰',
    '遙遙相望','隔岸觀火','遠近皆宜','千山萬水','天各一方',
    '遙不可及','隔世之音','遠水解渴','千緒萬端','天遙地遠',
    '遙寄相思','隔雲聯袂','遠交近攻','千帆競發','天高水長',
    '遙望星河','隔空取物','遠見明燈','千里同風','天地同輝',
  ]},
  { technique: 'two_string_kite', stageName: '雙線風箏', stars: 27, levelNames: [
    '紙鳶高飛','隨風而舞','牽線遨遊','飄搖天際','風箏斷線',
    '扶搖而起','翻飛入雲','迎風展翅','風起鳶飛','線引天高',
    '紙鳥凌空','御風之舞','風箏漫天','牽繫不絕','翩然起舞',
    '高飛遠遁','風舞翩躚','鳶飛魚躍','線繫蒼穹','風箏之巔',
    '凌風翔舞','紙鳶追日','風箏歸來','牽引萬鈞','鳶落歸巢',
  ]},
  { technique: 'empty_rectangle', stageName: '空矩折返', stars: 28, levelNames: [
    '折返迴旋','空中樓閣','矩陣回折','虛實交替','返照入空',
    '折射之光','空間扭曲','矩形迷宮','虛境摺疊','返本歸真',
    '折戟沉沙','空谷足音','矩尺之外','虛中有實','返璞之途',
    '折光成虹','空明之矩','矩陣重構','虛實相生','返照千層',
    '折衝樽俎','空矩之心','矩中有道','虛空折射','返極歸零',
  ]},
  { technique: 'bug_plus_one', stageName: '唯一缺口', stars: 29, levelNames: [
    '缺一不可','獨佔鰲頭','以一當十','唯我獨尊','一夫當關',
    '缺口突破','孤注一擲','以一敵百','唯一例外','一柱擎天',
    '缺席之位','孤峰獨秀','以一貫之','唯一正解','一錘定音',
    '缺月重圓','孤軍奮戰','以一持萬','唯一出口','一語中的',
    '缺而後補','孤明先發','以一統萬','唯一歸途','一元復始',
  ]},
  { technique: 'jellyfish', stageName: '水母陣', stars: 30, levelNames: [
    '深海幽靈','波光粼粼','浮游之舞','海底迷宮','潮汐之力',
    '水母群舞','深藍之心','浮沉之間','海洋脈動','潮起月明',
    '水母發光','深淵低語','浮光掠影','海底花園','潮落星沉',
    '水母之夢','深海珊瑚','浮世繪卷','海底寶藏','潮聲陣陣',
    '水母透明','深海之眼','浮生若夢','海底星空','潮汐歸寂',
  ]},
  { technique: 'finned_jellyfish', stageName: '鰭水母', stars: 31, levelNames: [
    '破浪前行','逆潮之鰭','划水無聲','鰭影幢幢','深潛暗湧',
    '劈波斬浪','鰭展千里','游弋深海','暗鰭出沒','深水之下',
    '乘浪而行','鰭光閃爍','穿越激流','暗流之鰭','深海巨獸',
    '御潮飛馳','鰭動四方','逆流之力','暗鰭潛行','深淵之主',
    '破冰之鰭','鰭翼齊展','風暴之中','暗鰭歸海','深海歸途',
  ]},
  { technique: 'xy_chain', stageName: '雙值連環', stars: 32, levelNames: [
    '環環相連','首尾相接','鏈鏈不息','連綿不絕','扣環之道',
    '環形閉合','雙值交替','鏈路暢通','連環之計','扣合無間',
    '環迴之路','雙弦共振','鏈接成環','連鎖效應','扣心之弦',
    '環生不滅','雙軌並行','鏈環交織','連珠妙手','扣問真相',
    '環宇之鏈','雙值之道','鏈通萬里','連環歸一','扣合歸元',
  ]},
  { technique: 'discontinuous_nice_loop', stageName: '斷續環', stars: 33, levelNames: [
    '斷而復連','續命之鏈','環中有缺','斷崖絕壁','續絃之聲',
    '斷橋殘雪','續航千里','環生斷滅','斷章取義','續寫傳奇',
    '斷流成瀑','續接天地','環破而立','斷層之間','續夢前行',
    '斷腕求生','續火相傳','環裂重生','斷捨離合','續力無窮',
    '斷虹飛架','續接因果','環缺補天','斷後重來','續歸完環',
  ]},
  { technique: 'cell_forcing_chain', stageName: '格強制鏈', stars: 34, levelNames: [
    '格殺勿論','強弩之末','制敵機先','鏈鎖乾坤','格物窮理',
    '強勢突破','制衡之術','鏈式反應','格局大開','強中自有',
    '制高之點','鏈通六合','格外有格','強弓射月','制勝之道',
    '鏈環收束','格致誠正','強攻猛進','制約有方','鏈破天際',
    '格正方圓','強鏈鑄心','制變從容','鏈結歸真','格局歸元',
  ]},
  { technique: 'region_forcing_chain', stageName: '域強制鏈', stars: 35, levelNames: [
    '域外桃源','強域封鎖','制域有方','鏈接全域','域中天地',
    '強權在握','制約全局','鏈通諸域','域界分明','強勢主導',
    '制衡各方','鏈式擴散','域廣無垠','強弓勁弩','制局定勢',
    '鏈貫三界','域外之音','強鏈成網','制約之環','鏈動全域',
    '域中有道','強域合璧','制域歸心','鏈接萬域','域歸一統',
  ]},
  { technique: 'template', stageName: '模板映射', stars: 36, levelNames: [
    '模印天成','板上釘釘','映照萬象','射影成形','模刻入骨',
    '板定乾坤','映月入池','射線穿透','模範天下','板圖已定',
    '映射無遺','射覆之術','模擬推演','板眼分明','映象重疊',
    '射影幾何','模式辨識','板塊移動','映像翻轉','射影歸原',
    '模鑄定型','板載千秋','映照本源','射影收束','模歸原型',
  ]},
  { technique: 'als_xy', stageName: 'ALS 交映', stars: 37, levelNames: [
    '交光互映','映照雙方','交會之處','映射成雙','交叉驗證',
    '映入眼簾','交融無間','映日荷花','交錯重疊','映雪讀書',
    '交相輝映','映月清泉','交匯成河','映照千秋','交織夢境',
    '映徹心扉','交響共鳴','映照實相','交集之道','映射歸真',
    '交映生輝','映照無遺','交合陰陽','映照乾坤','交映歸元',
  ]},
  { technique: 'als_w_wing', stageName: 'ALS 翼合', stars: 38, levelNames: [
    '翼展雲霄','合力齊飛','翼護蒼生','合縱連橫','翼覆四海',
    '合璧生輝','翼振長空','合眾之力','翼掠星辰','合流匯聚',
    '翼動風雲','合契同心','翼擊長空','合鏡成像','翼翔無極',
    '合力破障','翼展萬里','合聲共振','翼覆乾坤','合道歸真',
    '翼衛天地','合元歸一','翼展宏圖','合翼之勢','翼合歸元',
  ]},
  { technique: 'sue_de_coq', stageName: '蘇德可', stars: 39, levelNames: [
    '交界之謎','容量有限','分拆重組','邊際之力','容納萬象',
    '分而治之','邊界突破','容錯之道','分合有序','邊緣地帶',
    '容光煥發','分毫不差','邊際效用','容身之處','分門別類',
    '邊疆拓展','容量極限','分庭抗禮','邊際收斂','容許之間',
    '分合之道','邊際均衡','容止若思','分類歸納','容歸極限',
  ]},
  { technique: 'death_blossom', stageName: '終花綻放', stars: 40, levelNames: [
    '花開見佛','綻放瞬間','終局之花','花落無聲','綻裂蒼穹',
    '終章序曲','花開不敗','綻放極光','終點即起','花雨繽紛',
    '綻出新芽','終歸寂滅','花香滿徑','綻放之力','終極之美',
    '花開富貴','綻裂重生','終成大器','花團錦簇','綻放無悔',
    '終始如一','花落歸根','綻放永恆','終極之道','花開歸元',
  ]},
];

// ── Solver ──
interface CellState { value: number; fixed: boolean; notes: number[]; isError: boolean; }

function buildCells(puzzle: number[]): CellState[] {
  return puzzle.map((v, i) => {
    if (v !== 0) return { value: v, fixed: true, notes: [], isError: false };
    const r = Math.floor(i / 9), c = i % 9, br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
    const used = new Set<number>();
    for (let j = 0; j < 9; j++) {
      if (puzzle[r * 9 + j]) used.add(puzzle[r * 9 + j]);
      if (puzzle[j * 9 + c]) used.add(puzzle[j * 9 + c]);
      if (puzzle[(br + Math.floor(j / 3)) * 9 + (bc + j % 3)])
        used.add(puzzle[(br + Math.floor(j / 3)) * 9 + (bc + j % 3)]);
    }
    return { value: 0, fixed: false, notes: [1, 2, 3, 4, 5, 6, 7, 8, 9].filter(d => !used.has(d)), isError: false };
  });
}

function classifyWithPriority(
  puzzle: number[], solution: number[], targetTech: string,
): { usesTarget: boolean; difficultyScore: number; singleRatio: number } | null {
  const targetDetector = DETECTOR_MAP[targetTech];
  if (!targetDetector) return null;

  // Priority registry: Phase 1 basics, then target technique, then everything else
  const registry: DetectorFn[] = [
    ...PHASE1,
    targetDetector,
    ...DETECTOR_REGISTRY.filter(d => d !== targetDetector),
  ];

  const cells = buildCells(puzzle);
  const counts: Record<string, number> = {};
  let usesTarget = false;

  for (let step = 0; step < 500; step++) {
    if (cells.every(c => c.value !== 0)) break;
    const board = SolverBoard.fromGameState(cells);
    let found = false;
    for (const detector of registry) {
      const result = detector(board);
      if (!result) continue;
      const tech = result.technique as string;
      counts[tech] = (counts[tech] || 0) + 1;
      if (tech === targetTech) usesTarget = true;
      for (const a of result.actions) {
        if (a.kind === 'fill') {
          cells[a.cell].value = a.digit; cells[a.cell].notes = [];
          const r = Math.floor(a.cell / 9), c = a.cell % 9, br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
          for (let j = 0; j < 9; j++) {
            cells[r * 9 + j].notes = cells[r * 9 + j].notes.filter(d => d !== a.digit);
            cells[j * 9 + c].notes = cells[j * 9 + c].notes.filter(d => d !== a.digit);
            cells[(br + Math.floor(j / 3)) * 9 + (bc + j % 3)].notes =
              cells[(br + Math.floor(j / 3)) * 9 + (bc + j % 3)].notes.filter(d => d !== a.digit);
          }
        } else {
          cells[a.cell].notes = cells[a.cell].notes.filter(d => d !== a.digit);
        }
      }
      found = true; break;
    }
    if (!found) return null;
  }
  if (!cells.every((c, i) => c.value === solution[i])) return null;

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const singles = (counts['naked_single'] || 0) + (counts['hidden_single'] || 0);
  return {
    usesTarget,
    difficultyScore: total * (STAGES.findIndex(s => s.technique === targetTech) + 1),
    singleRatio: total > 0 ? +(singles / total).toFixed(4) : 0,
  };
}

// ── Main ──
const existing = JSON.parse(fs.readFileSync('levels-data.json', 'utf8'));
const allKeys = new Set<string>(existing.map((l: unknown) => l.puzzle.join('')));
let maxId = Math.max(...existing.map((l: unknown) => l.id));

const newLevels: unknown[] = [];
const startTime = Date.now();

console.log('Generating 1000 speedrun levels (40 techniques × 25)...\n');

for (let si = 0; si < STAGES.length; si++) {
  const stage = STAGES[si];
  const collected: Array<{ puzzle: number[]; solution: number[]; difficultyScore: number; singleRatio: number }> = [];

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  process.stdout.write(`\r[${elapsed}s] ${si + 1}/40 ${stage.stageName} (${stage.technique}): 0/25    `);

  let batch = 0;
  while (collected.length < 25 && batch < 500) {
    batch++;
    let puzzles: Array<{ puzzle: number[]; solution: number[] }>;
    try {
      const out = execSync(`python3 scripts/gen_puzzles.py 500`, {
        encoding: 'utf8', timeout: 120000, cwd: process.cwd(),
      });
      puzzles = JSON.parse(out);
    } catch { continue; }

    for (const p of puzzles) {
      if (collected.length >= 25) break;
      const key = p.puzzle.join('');
      if (allKeys.has(key)) continue;

      const result = classifyWithPriority(p.puzzle, p.solution, stage.technique);
      if (!result || !result.usesTarget) continue;

      allKeys.add(key);
      collected.push({
        puzzle: p.puzzle, solution: p.solution,
        difficultyScore: result.difficultyScore,
        singleRatio: result.singleRatio,
      });

      const e2 = ((Date.now() - startTime) / 1000).toFixed(0);
      process.stdout.write(`\r[${e2}s] ${si + 1}/40 ${stage.stageName} (${stage.technique}): ${collected.length}/25    `);
    }
  }

  console.log(`\r✓ ${si + 1}/40 ${stage.stageName} (${stage.technique}): ${collected.length}/25` + (collected.length < 25 ? ' ⚠️ SHORT' : '') + '    ');

  // Create level entries
  for (let li = 0; li < collected.length; li++) {
    maxId++;
    const np = collected[li];
    newLevels.push({
      id: maxId,
      stars: stage.stars,
      difficultyName: stage.stageName,
      displayName: stage.levelNames[li],
      puzzle: np.puzzle,
      solution: np.solution,
      maxTechnique: stage.technique,
      techTier: TECH_TIER[stage.technique] || 'T01',
      difficultyScore: np.difficultyScore,
      logicSolvable: true,
      singleRatio: np.singleRatio,
      mode: 'speedrun' as const,
      source: 'self-generated-no-third-party',
    });
  }
}

// Append to levels-data.json
existing.push(...newLevels);
fs.writeFileSync('levels-data.json', JSON.stringify(existing, null, 2), 'utf8');

const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
console.log(`\n=== Done in ${totalTime}s ===`);
console.log(`Generated: ${newLevels.length} speedrun levels`);
console.log(`Total levels-data.json: ${existing.length}`);

// Summary
const byMode: Record<string, number> = {};
for (const l of existing) byMode[l.mode || 'none'] = (byMode[l.mode || 'none'] || 0) + 1;
console.log('By mode:', JSON.stringify(byMode));
