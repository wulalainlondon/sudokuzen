// Ordered detector registry — simplest first, short-circuits on match.

import type { DetectorFn } from './types';

// Phase 1 — basic
import { detectNakedSingle } from './detectors/phase1/nakedSingle';
import { detectHiddenSingle } from './detectors/phase1/hiddenSingle';
import { detectLockedCandidates } from './detectors/phase1/lockedCandidates';
import { detectNakedPair } from './detectors/phase1/nakedPair';
import { detectHiddenPair } from './detectors/phase1/hiddenPair';
import { detectNakedTriple } from './detectors/phase1/nakedTriple';
import { detectHiddenTriple } from './detectors/phase1/hiddenTriple';

// Phase 2 — pattern
import { detectXWing } from './detectors/phase2/xWing';
import { detectFinnedXWing } from './detectors/phase2/finnedXWing';
import { detectSkyscraper } from './detectors/phase2/skyscraper';
import { detectXYWing } from './detectors/phase2/xyWing';
import { detectXYZWing } from './detectors/phase2/xyzWing';
import { detectWWing } from './detectors/phase2/wWing';
import { detectUniqueRectangle } from './detectors/phase2/uniqueRectangle';
import { detectXCycleSimpleColoring } from './detectors/phase2/xCycleSimpleColoring';
import { detectSwordfish } from './detectors/phase2/swordfish';
import { detectFinnedSwordfish } from './detectors/phase2/finnedSwordfish';
import { detectRemotePairs } from './detectors/phase2/remotePairs';
import { detectTwoStringKite } from './detectors/phase2/twoStringKite';
import { detectEmptyRectangle } from './detectors/phase2/emptyRectangle';
import { detectBugPlusOne } from './detectors/phase2/bugPlusOne';
import { detectJellyfish } from './detectors/phase2/jellyfish';
import { detectFinnedJellyfish } from './detectors/phase2/finnedJellyfish';

// Phase 3 — chains / ALS
import { detectAic } from './detectors/phase3/aic';
import { detectAicMidChain } from './detectors/phase3/aicMidChain';
import { detectGroupedAicNiceLoop } from './detectors/phase3/groupedAicNiceLoop';
import { detectAicLongChain } from './detectors/phase3/aicLongChain';
import { detectAlsXz } from './detectors/phase3/alsXz';
import { detectAlsChain } from './detectors/phase3/alsChain';
import { detectForcingChainNet } from './detectors/phase3/forcingChainNet';
import { detectExocetDeathBlossom } from './detectors/phase3/exocetDeathBlossom';
import { detectXyChain } from './detectors/phase3/xyChain';
import { detectDiscontinuousNiceLoop } from './detectors/phase3/discontinuousNiceLoop';
import { detectCellForcingChain } from './detectors/phase3/cellForcingChain';
import { detectRegionForcingChain } from './detectors/phase3/regionForcingChain';
import { detectTemplate } from './detectors/phase3/template';
import { detectAlsXy } from './detectors/phase3/alsXy';
import { detectAlsWWing } from './detectors/phase3/alsWWing';
import { detectSueDeCoq } from './detectors/phase3/sueDeCoq';
import { detectDeathBlossom } from './detectors/phase3/deathBlossom';

export const DETECTOR_REGISTRY: DetectorFn[] = [
  // Phase 1
  detectNakedSingle,
  detectHiddenSingle,
  detectLockedCandidates,
  detectNakedPair,
  detectHiddenPair,
  detectNakedTriple,
  detectHiddenTriple,
  // Phase 2
  detectXWing,
  detectFinnedXWing,
  detectSkyscraper,
  detectXYWing,
  detectXYZWing,
  detectWWing,
  detectUniqueRectangle,
  detectXCycleSimpleColoring,
  detectSwordfish,
  detectFinnedSwordfish,
  detectRemotePairs,
  detectTwoStringKite,
  detectEmptyRectangle,
  detectBugPlusOne,
  detectJellyfish,
  detectFinnedJellyfish,
  // Phase 3
  detectAic,
  detectAicMidChain,
  detectGroupedAicNiceLoop,
  detectAicLongChain,
  detectAlsXz,
  detectAlsChain,
  detectForcingChainNet,
  detectExocetDeathBlossom,
  detectXyChain,
  detectDiscontinuousNiceLoop,
  detectCellForcingChain,
  detectRegionForcingChain,
  detectTemplate,
  detectAlsXy,
  detectAlsWWing,
  detectSueDeCoq,
  detectDeathBlossom,
];
