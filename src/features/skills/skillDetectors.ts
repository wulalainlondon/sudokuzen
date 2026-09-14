// Loaded on demand when entering World skill interactions.
import { registerSkill } from './skillRegistry';
import { nakedSingleSkill } from './nakedSingle';
import { hiddenSingleSkill } from './hiddenSingle';
import { lockedCandidatesSkill } from './lockedCandidates';
import { nakedPairSkill } from './nakedPair';
import { hiddenPairSkill } from './hiddenPair';
import { nakedTripleSkill } from './nakedTriple';
import { hiddenTripleSkill } from './hiddenTriple';
import { xWingSkill } from './xWing';
import { swordfishSkill } from './swordfish';
import { jellyfishSkill } from './jellyfish';
import { xyWingSkill } from './xyWing';
import { xyzWingSkill } from './xyzWing';
import { wWingSkill } from './wWing';
import { uniqueRectangleSkill } from './uniqueRectangle';
import { remotePairsSkill } from './remotePairs';
import { skyscraperSkill } from './skyscraper';
import { twoStringKiteSkill } from './twoStringKite';
import { emptyRectangleSkill } from './emptyRectangle';
import { finnedXWingSkill } from './finnedXWing';
import { finnedSwordfishSkill } from './finnedSwordfish';
import { finnedJellyfishSkill } from './finnedJellyfish';
import { xCycleSimpleColoringSkill } from './xCycleSimpleColoring';
import { xyChainSkill } from './xyChain';
import { aicSkill } from './aic';
import { aicLongChainSkill } from './aicLongChain';
import { aicMidChainSkill } from './aicMidChain';
import { groupedAicNiceLoopSkill } from './groupedAicNiceLoop';
import { discontinuousNiceLoopSkill } from './discontinuousNiceLoop';
import { cellForcingChainSkill } from './cellForcingChain';
import { regionForcingChainSkill } from './regionForcingChain';
import { forcingChainNetSkill } from './forcingChainNet';
import { alsXZSkill } from './alsXZ';
import { alsXYSkill } from './alsXY';
import { alsWWingSkill } from './alsWWing';
import { alsChainSkill } from './alsChain';
import { sueDeCoqSkill } from './sueDeCoq';
import { templateSkill } from './template';
import { deathBlossomSkill } from './deathBlossom';
import { exocetSkill } from './exocet';
import { bugPlusOneSkill } from './bugPlusOne';

// ── Register skills (order = evaluation priority) ────────────────────
// Quick-cast singles (evaluated first for speed)
registerSkill(nakedSingleSkill);
registerSkill(hiddenSingleSkill);

// Lv1 — Phase 1 techniques (3-7)
registerSkill(lockedCandidatesSkill);
registerSkill(nakedPairSkill);
registerSkill(nakedTripleSkill);
registerSkill(hiddenPairSkill);
registerSkill(hiddenTripleSkill);

// Lv2 — Phase 2 techniques
registerSkill(xWingSkill);
registerSkill(swordfishSkill);
registerSkill(jellyfishSkill);
registerSkill(xyWingSkill);
registerSkill(xyzWingSkill);
registerSkill(wWingSkill);
registerSkill(uniqueRectangleSkill);
registerSkill(remotePairsSkill);
registerSkill(skyscraperSkill);
registerSkill(twoStringKiteSkill);
registerSkill(emptyRectangleSkill);
registerSkill(finnedXWingSkill);
registerSkill(finnedSwordfishSkill);
registerSkill(finnedJellyfishSkill);
registerSkill(bugPlusOneSkill);

// Lv3 — Tier 2-3 chain techniques
registerSkill(xCycleSimpleColoringSkill);
registerSkill(xyChainSkill);
registerSkill(aicSkill);
registerSkill(aicMidChainSkill);
registerSkill(aicLongChainSkill);
registerSkill(groupedAicNiceLoopSkill);
registerSkill(discontinuousNiceLoopSkill);

// Lv4 — Tier 3-4 forcing chains
registerSkill(cellForcingChainSkill);
registerSkill(regionForcingChainSkill);
registerSkill(forcingChainNetSkill);

// Lv5 — Tier 4 ALS techniques
registerSkill(alsXZSkill);
registerSkill(alsXYSkill);
registerSkill(alsWWingSkill);
registerSkill(alsChainSkill);

// Lv6 — Tier 4 ultimate techniques
registerSkill(sueDeCoqSkill);
registerSkill(templateSkill);
registerSkill(deathBlossomSkill);
registerSkill(exocetSkill);
