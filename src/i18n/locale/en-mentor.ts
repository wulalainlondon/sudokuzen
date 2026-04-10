// English translations for mentor (Yi-Chen) dialogue.
// To be merged into the full en.ts locale file.

export const enMentor = {
  mentor: {
    intro: {
      intro_1: "Sudoku isn't about filling in numbers.\nIt's about seeing structure.",
      intro_2: 'Let me show you something.',
    },
    postDemo: {
      post_demo_1:
        "Locked candidates, hidden pairs, hidden triples...\nI climbed past every wall.\n\nThe last three steps were called the Exocet.\nI stared at it for three days. Every chain of reasoning led me back to where I started.\n\nI couldn't get through.",
      post_demo_1_sub: '-- Yi-Chen',
      post_demo_2:
        "My name is Yi-Chen.\nI left markers at all thirty-nine obstacles on this path.\nMy handwriting is in the bestiary, but some pages--\nyou'll have to turn them yourself.\n\nGo. Start from the shallow end.\n\nAnd if one day you reach the place where I fell,\ntake one more step.",
      post_demo_2_sub: '-- Yi-Chen, "Fragments: Preface"',
    },
    milestones: {
      first_kill: "Your first kill. Remember this feeling.\nLogic doesn't lie, but it does hide.",
      first_kill_sub: '-- Yi-Chen',
      tier1_mastered:
        "The basic techniques have become second nature.\nFrom here on, numbers start appearing in pairs, tangled like shadows.\nDon't be afraid. Shadows have edges too.",
      tier1_mastered_sub: '-- Yi-Chen, "Fragments: Shadow"',
      tier2_unlocked:
        'Can you see it now?\nBetween the rows and columns, beyond the boxes, something is moving.\nThe first time I noticed, I thought my eyes were playing tricks.',
      tier2_unlocked_sub: '-- Yi-Chen, "Fragments: Wind"',
      tier3_unlocked:
        'Not many people make it this far.\nFrom here, reasoning stops being a straight line. It becomes a web.\nI once followed a chain a long way, only to find myself back at the start.',
      tier3_unlocked_sub: '-- Yi-Chen, "Fragments: Chain"',
      tier3_deep:
        "You've gone further than most.\nAt the end of chain logic, there isn't an answer -- there's another question.\nBut you'll get used to it.",
      tier3_deep_sub: '-- Yi-Chen, "Fragments: Loop"',
      tier4_threshold:
        "...\nThis is where I stopped. I couldn't go any further.\nAlmost-locked sets, forcing chains, death blossoms... each one felt like the abyss staring back.\n\nThe rest of the road is yours alone.",
      tier4_threshold_sub:
        '-- Yi-Chen, "Fragments: Last Page"\n(The handwriting here is messy, as if stained by tears)',
    },
    techniques: {
      naked_single: {
        veiled: 'The simplest truth is often right in front of you.',
        unveiled:
          'Back then, the world was quiet. I looked at the cell, and it looked back at me. The answer was just there, as natural as breathing.',
      },
      hidden_single: {
        veiled: "Some numbers won't show themselves, but they have nowhere else to go.",
        unveiled: "The obvious eye sees plain loneliness. The hidden eye sees the one that's hiding in the crowd.",
      },
      locked_candidates: {
        veiled: 'When certain numbers are trapped in a corner, they block other paths for you.',
        unveiled:
          "Locked candidates are the gentlest technique. They don't eliminate anything -- they just tell you: this way is closed.",
      },
      naked_pair: {
        veiled: 'Two cells facing each other like reflections. Their silent agreement shuts out everyone else.',
        unveiled:
          'Naked pair. Two cells share the same fate, as if they made a pact. The moment you spot them, the noise around them vanishes.',
      },
      hidden_pair: {
        veiled: 'Two cells that seem unrelated on the surface, but secretly belong only to each other.',
        unveiled:
          "Hidden pair. They hide in the noise of candidates, waiting to be found. Quiet, but once you see them, you can't unsee them.",
      },
      naked_triple: {
        veiled: 'The stability of a triangle exists in numbers too.',
        unveiled:
          "Naked triple. Three threads knotted together, squeezing out everything that doesn't belong. Sometimes I think it's more elegant than a pair.",
      },
      hidden_triple: {
        veiled: 'Three hidden partners that take sharper eyes to recognize.',
        unveiled:
          'Hidden triple. Three underground rivers meeting beneath the surface. You see nothing on top, but once you find the source, the whole area clears up.',
      },
      unique_rectangle: {
        veiled: 'Sudoku has one iron rule: the solution must be unique. Certain shapes exploit exactly that.',
        unveiled:
          "Unique rectangle. It's not deduction -- it's faith. If this rectangle holds, the solution wouldn't be unique. So it can't hold. The elegance of proof by contradiction.",
      },
      skyscraper: {
        veiled: 'Two parallel lines that cross in the distance.',
        unveiled:
          'Skyscraper. Two pillars holding up an invisible bridge. The first time I saw it, I stared upward for a long time.',
      },
      two_string_kite: {
        veiled: 'A line stretches from a row to a column, bending in the middle.',
        unveiled:
          "Two-string kite. Like a string stretched between a row and a column that you can't see. When the wind blows, the string vibrates, and the numbers that don't belong shatter.",
      },
      empty_rectangle: {
        veiled: 'Sometimes the blank space itself is the clue.',
        unveiled:
          "Empty rectangle. The blanks inside a box trace out a rectangle, and that rectangle points to the only exit. Using emptiness to show the way -- that's probably the most Zen-like technique there is.",
      },
      x_wing: {
        veiled:
          'That shadow crossing between rows and columns... I thought it was two locks. Turns out, it was a door to a higher dimension.',
        unveiled:
          'X-Wing. Two rows, two columns, four intersections forming a cross-shaped blade. In one sweep, every impurity along the line falls away. The cleanest strike.',
      },
      finned_x_wing: {
        veiled: 'Perfect symmetry broken at one corner. But that very gap reveals its nature.',
        unveiled:
          "Finned X-Wing. An imperfect blade with one extra candidate. But the crack makes it more dangerous -- targets near the gap can't escape.",
      },
      xy_wing: {
        veiled: 'Three cells, like three leaves spreading from a single root.',
        unveiled:
          'XY-Wing. A pivot connected to two wings. Each has only two candidates, but together they can strike where you least expect. I like this one. It moves like the wind.',
      },
      xyz_wing: {
        veiled: 'One more dimension than a wing. The pivot becomes heavier.',
        unveiled:
          'XYZ-Wing. One more candidate than XY-Wing, so the pivot carries more weight, but the strike is more precise. A steady blow.',
      },
      w_wing: {
        veiled: 'Two distant cells connected by an invisible thread.',
        unveiled:
          'W-Wing. Two cells linked by a conjugate chain, like two crescent moons reflected at opposite ends of a lake. The connection itself is the weapon.',
      },
      remote_pairs: {
        veiled: 'A long chain where every link has only two possibilities.',
        unveiled:
          'Remote pairs. Walk along a bivalue chain far enough, and the start and end constrain each other. Distance creates certainty.',
      },
      bug_plus_one: {
        veiled: 'The entire board is almost perfect. Only one cell has one candidate too many.',
        unveiled:
          'BUG+1. When the board is nearly perfect -- every cell has exactly two candidates -- the only three-candidate cell is the flaw. Kill that bug, and the world is clean.',
      },
      x_cycle_simple_coloring: {
        veiled: 'Color the digits, then see which color contradicts itself.',
        unveiled:
          "Simple coloring. Alternate black and white until one color contradicts itself. In that moment, the entire chain's fate is sealed. Simple, but merciless.",
      },
      swordfish: {
        veiled: 'The blade, extended. From two dimensions to three.',
        unveiled:
          "Swordfish. A three-row, three-column blade. Its shape is no longer a cross but an irregular net. By the time you learn to see it, you're no longer a beginner.",
      },
      finned_swordfish: {
        veiled: 'An extra barb on the trident.',
        unveiled:
          'Finned swordfish. A swordfish with a fin. The break in perfect symmetry actually reveals deeper structure. I was stuck here for a long time.',
      },
      jellyfish: {
        veiled: "Four rows, four columns. If you can see this shape, you're already in deep water.",
        unveiled:
          "Jellyfish. A four-dimensional blade. It rarely appears, but when it does, the whole ocean trembles. I've only seen it three times.",
      },
      finned_jellyfish: {
        veiled: 'A massive shadow in the deep, edges blurred.',
        unveiled: "Finned jellyfish. A jellyfish with a fin. The day I saw it, I knew I'd come a very long way.",
      },
      aic: {
        veiled: 'Your first chain. From now on, reasoning is no longer a single step -- it is a path.',
        unveiled:
          "Alternating inference chain. Strong and weak links alternate like breathing -- inhale is certain, exhale is possible. When you reach the end, the beginning's fate has already changed.",
      },
      aic_mid_chain: {
        veiled: 'Halfway along the chain, a node suddenly reveals a weakness.',
        unveiled:
          "AIC mid-chain. The elimination isn't at the endpoints but in the middle. Like walking along and suddenly realizing the tile under your foot is loose.",
      },
      aic_long_chain: {
        veiled: 'A long chain of reasoning that spans the entire board.',
        unveiled:
          'AIC long chain. Seven or more links. Walking it takes focus and patience. I got lost many times along the way.',
      },
      grouped_aic_nice_loop: {
        veiled: "The chain is no longer a line. It's bent into a circle.",
        unveiled:
          'Nice loop. The chain connects back to its own beginning, forming a closed logical ring. A complete contradiction.',
      },
      discontinuous_nice_loop: {
        veiled: 'The loop has a gap. That gap is the answer.',
        unveiled:
          "Discontinuous nice loop. Where the loop breaks is where the logic can't sustain itself -- and that's where the truth lies.",
      },
      xy_chain: {
        veiled: 'A long chain of bivalue cells strung across the board like a necklace.',
        unveiled:
          'XY-Chain. Every cell has two candidates, linked end to end to form a logical necklace. The moment you put it on, distant candidates shatter.',
      },
      als_xz: {
        veiled:
          "...Almost-locked sets. Thinking of a group of cells as one whole. By this point, I was starting to feel my brain wasn't enough.",
        unveiled:
          'ALS-XZ. Two nearly self-contained sets that share a digit and intersect. I understood the logic, but every time I used it, it felt like moving a mountain.',
      },
      als_xy: {
        veiled: '...Two almost-locked sets, exchanging intel through a middleman.',
        unveiled:
          "ALS-XY. Two sets that don't communicate directly but pass information through a third party. A love triangle, logic edition.",
      },
      als_w_wing: {
        veiled: '...The almost-locked-set version of a W-Wing. Heavier. Slower.',
        unveiled:
          'ALS-W-Wing. I thought I understood W-Wings, but the ALS version made me realize I only understood half.',
      },
      als_chain: {
        veiled: "...Every link in the chain is an almost-locked set. This isn't how humans think anymore.",
        unveiled: "ALS chain. By this point, I was seeing candidates in my dreams. That's not a good sign.",
      },
      forcing_chain_net: {
        veiled: "...If this digit is A, then... if it's B, then... both roads lead to the same conclusion.",
        unveiled:
          'Forcing chain. No matter what you assume, the conclusion is the same. The most brute-force logic there is: exhaust every possibility. My brain started overheating here.',
      },
      cell_forcing_chain: {
        veiled: "...One cell's three possibilities, all traced to their end.",
        unveiled: 'Cell forcing chain. Three parallel universes, traced simultaneously. I only succeeded once.',
      },
      region_forcing_chain: {
        veiled: '...Every possibility in an entire region, fully expanded.',
        unveiled:
          "Region forcing chain. Not one cell but an entire region's parallel trace. By this point, my notebook was almost full.",
      },
      sue_de_coq: {
        veiled: '...(Large sections have been crossed out here)',
        unveiled:
          'Sue de Coq. A cell combination that perfectly satisfies a set-theory condition. It took me a month to truly understand it.',
      },
      template: {
        veiled: '...Map out every possible position for a single digit, like a constellation chart.',
        unveiled:
          'Template. Brute-force enumerate every legal placement for a digit, then find positions that are fixed across all of them. Not elegant, but it works.',
      },
      death_blossom: {
        veiled: '...The moment the flower blooms, every petal points the same way. And that way is death.',
        unveiled:
          "Death blossom. A flower made of almost-locked sets. Each candidate on the stem connects to a petal (ALS), and the petals' shared view is the kill zone. Beautiful and lethal.",
      },
      exocet_death_blossom: {
        veiled:
          '...\n\n(The final handwriting is nearly illegible)\n\nI saw its outline. In that instant, my strength...\n\n(No more writing after this)',
        unveiled:
          'Exocet.\n\nYi-Chen lost all his power pursuing this technique. You are the first to conquer it.\n\nHis journey ends in your hands.',
      },
    },
    techEssence: {
      naked_single: 'A cell with only one candidate — fill it immediately.',
      hidden_single: 'A digit appears in only one cell of a unit — place it there.',
      locked_candidates:
        'All candidates for a digit in a box share one row or column, eliminating that digit from the rest of that line.',
      naked_pair: 'Two cells share exactly the same two candidates — no other cell in their unit can hold either.',
      hidden_pair:
        'Two digits appear only in the same two cells of a unit — all other candidates in those cells are impossible.',
      naked_triple:
        'Three cells collectively hold only three candidates — those candidates cannot appear elsewhere in the unit.',
      hidden_triple:
        'Three digits appear only in three cells of a unit — all other candidates in those cells are eliminated.',
      x_wing:
        'A digit appears in only two columns across two rows, forming a rectangle — it is eliminated from the rest of those columns.',
      unique_rectangle:
        'Four cells in a rectangle spanning two boxes cannot all hold the same two candidates without creating two solutions.',
      bug_plus_one:
        'Every cell has exactly two candidates except one — that exceptional cell must resolve the entire puzzle.',
      skyscraper:
        'Two strong links in two columns share a common row, allowing cells that see both far ends to be cleared.',
      two_string_kite:
        'A row strong link and a column strong link intersect in one box — cells seeing both far ends can be eliminated.',
      empty_rectangle:
        'All candidates in a box concentrate on one row or column, acting like a virtual strong link to reach distant cells.',
      finned_x_wing:
        'Like X-Wing, but one row has extra candidates confined to the same box — eliminations shrink to cells seeing both the column and the fin box.',
      xy_wing: 'A pivot with candidates XY connects wings XZ and YZ — any cell seeing both wings cannot hold Z.',
      xyz_wing: 'A pivot with XYZ connects wings XZ and YZ — any cell seeing all three holds no Z.',
      w_wing:
        'Two cells with the same candidate pair are bridged by a strong link — any cell seeing both ends cannot hold the shared candidate.',
      remote_pairs:
        'A chain of cells each holding the same two candidates alternates in parity — cells seeing both chain ends are cleared.',
      swordfish:
        'A digit appears in only three columns across three rows — it is eliminated from the rest of those three columns.',
      x_cycle_simple_coloring:
        'Alternate strong links form a closed loop — two same-color nodes in conflict mean that color is eliminated; same-color nodes seeing each other clear all their peers.',
      finned_swordfish:
        'Like Swordfish, but one row has extra candidates in one box — eliminations are restricted to cells seeing both the column and the fin box.',
      jellyfish:
        'A digit spans only four columns across four rows — eliminated from all other cells in those four columns.',
      finned_jellyfish: 'Like Jellyfish but with a fin — eliminations are confined to cells that also see the fin box.',
      aic: 'An alternating chain of strong and weak links; if both ends share a candidate, that candidate is eliminated from all cells seeing both endpoints.',
      aic_mid_chain: 'An AIC whose interior eliminates a candidate from a cell that sees two consecutive chain nodes.',
      aic_long_chain:
        'A longer alternating chain where the endpoint logic spans multiple units — the same elimination principle applies regardless of chain length.',
      grouped_aic_nice_loop:
        'An AIC where some nodes represent groups of cells sharing a strong link within a box, extending the reach of the chain.',
      discontinuous_nice_loop:
        'An AIC whose two ends point at the same cell — one of its candidates must be true, eliminating all others in that cell or confirming it.',
      xy_chain:
        'A chain of bivalue cells where each adjacent pair shares one candidate — cells seeing both endpoints lose the shared candidate.',
      cell_forcing_chain:
        'Every candidate in one cell independently leads to the same conclusion — that conclusion must be true.',
      region_forcing_chain:
        'Every placement of a digit in one unit independently leads to the same conclusion — that conclusion must be true.',
      als_xz:
        'Two almost-locked sets share a restricted common candidate X — any cell seeing all instances of another shared candidate Z in both sets cannot hold Z.',
      als_xy:
        'Two ALS are linked through two restricted common candidates, allowing the third shared candidate to be eliminated from external cells.',
      als_w_wing:
        'Two ALS bridged by a strong link on one candidate — external cells seeing both sets lose the other shared candidate.',
      als_chain:
        'A sequence of almost-locked sets each sharing a restricted common candidate with the next — the chain creates a forced elimination at its ends.',
      forcing_chain_net:
        'Multiple chains from different starting assumptions all converge on the same forced conclusion.',
      sue_de_coq:
        'A box-line intersection where two ALS together account for all candidates in the intersection — both units are cleared of those candidates elsewhere.',
      template:
        'Enumerate all valid placements for a digit; any cell excluded from every valid template cannot hold that digit.',
      death_blossom:
        'A stem cell with multiple candidates, each linking to a unique ALS — together they force an elimination in cells seeing all ALS instances.',
      exocet_death_blossom:
        'A base pair of cells projects their candidates into target cells through a complex ALS network, forcing massive eliminations across the grid.',
    },
    ctmIntro: {
      text: 'There are two cells in that box. One of them must carry the number.\n\nLong-press the digit on the numpad to begin tracking. Then tap each cell.\nWatch what happens when two cells share a secret.',
      sub: '── Yi-Chen ──',
    },
    finale: {
      text: 'You did it.\nThe place I walked so long toward but never reached -- you made it.\n\nNothing in this world of numbers can hold you now.\nBut if you ever look back through these fragments,\nremember that someone named Yi-Chen once walked this road too.',
      sub: '-- Yi-Chen, "Fragments: Final Chapter"',
    },
    encounterHints: {
      locked_candidates: {
        l1: 'Try candidate tracking mode — long-press a digit on the numpad.',
        l2: 'Notice that in one box, a digit only appears in cells of the same row (or column).',
        l3: 'Track each digit: if all its candidates in a box fall on one row or column, it can eliminate that digit from the rest of that row or column.',
      },
      naked_pair: {
        l1: 'Try candidate tracking mode — long-press a digit on the numpad.',
        l2: 'Find two cells in the same unit that share exactly the same two candidates.',
        l3: 'In one row, column, or box: if two cells contain exactly the same pair of candidates, those two digits can be removed from all other cells in that unit.',
      },
      hidden_pair: {
        l1: 'Try candidate tracking mode — long-press a digit on the numpad.',
        l2: 'In one unit, two digits appear only in the same two cells.',
        l3: 'Find a row, column, or box where two specific digits only appear in two cells — all other candidates in those two cells can be removed.',
      },
      naked_triple: {
        l1: 'Try candidate tracking mode — long-press a digit on the numpad.',
        l2: 'Find three cells in the same unit whose combined candidates total only three digits.',
        l3: 'In one row, column, or box: if three cells together contain only three distinct candidates, those candidates can be eliminated from all other cells in that unit.',
      },
      hidden_triple: {
        l1: 'Try candidate tracking mode — long-press a digit on the numpad.',
        l2: 'In one unit, three digits only appear in the same three cells.',
        l3: 'Find a unit where three digits only appear in three cells — all other candidates in those three cells can be removed.',
      },
      x_wing: {
        l1: 'Try candidate tracking mode — long-press a digit on the numpad.',
        l2: 'Find two rows where a digit only appears in the same two columns.',
        l3: 'Track one digit: if it appears in only two columns across two rows, that digit can be eliminated from the rest of those two columns.',
      },
      unique_rectangle: {
        l1: 'Try candidate tracking mode — long-press a digit on the numpad.',
        l2: 'Four cells forming a rectangle across two boxes — the uniqueness constraint limits which candidates are valid.',
        l3: 'Four cells in a 2×2 rectangle spanning two boxes: if they all contain the same two candidates, that would allow two solutions — so some candidates must be removed.',
      },
      bug_plus_one: {
        l1: 'Try candidate tracking mode — long-press a digit on the numpad.',
        l2: 'If every empty cell has exactly two candidates except one, that one cell holds the key.',
        l3: 'When the board has exactly one cell with more than two candidates, the candidate in that cell that preserves a unique solution must be the answer.',
      },
      skyscraper: {
        l1: 'Try candidate tracking mode — long-press a digit on the numpad.',
        l2: 'In one column, there are two cells with a strong link; their extensions can cancel each other.',
        l3: 'Track a digit: find a strong link in two columns. If those links share a row, any cell that sees both far ends of those links can have that digit removed.',
      },
      two_string_kite: {
        l1: 'Try candidate tracking mode — long-press a digit on the numpad.',
        l2: 'Find a row and a column each with a strong link, meeting in the same box.',
        l3: "In one box, a row's strong link and a column's strong link intersect — any cell that sees both far ends of those links can have that digit eliminated.",
      },
      empty_rectangle: {
        l1: 'Try candidate tracking mode — long-press a digit on the numpad.',
        l2: 'In one box, a digit only appears in cells on one row or column — creating an "empty rectangle".',
        l3: 'All candidates for a digit in one box lie on the same row or column. Combined with another strong link, this can eliminate that digit from cells that see both endpoints.',
      },
      finned_x_wing: {
        l1: 'Try candidate tracking mode — long-press a digit on the numpad.',
        l2: 'Like X-Wing, but one row has extra candidates (fins) — the elimination zone shrinks.',
        l3: 'Like X-Wing, but one row has a few extra candidates all in the same box (the fin). Eliminations only apply to cells that see both the normal X-Wing column AND are in the same box as the fin.',
      },
      xy_wing: {
        l1: 'Try candidate tracking mode — long-press a digit on the numpad.',
        l2: 'Find a pivot cell with two candidates, connected to two wing cells that share one candidate each.',
        l3: 'Find a pivot with candidates XY, connected to a cell with XZ and a cell with YZ — any cell that sees both wing cells can have Z removed.',
      },
      xyz_wing: {
        l1: 'Try candidate tracking mode — long-press a digit on the numpad.',
        l2: 'Like XY-Wing, but the pivot has three candidates (XYZ) and the wings each share one pair with it.',
        l3: 'A pivot with XYZ, connected to wings XZ and YZ — any cell that sees all three cells can have Z removed.',
      },
      w_wing: {
        l1: 'Try candidate tracking mode — long-press a digit on the numpad.',
        l2: 'Find two cells with the same candidate pair, bridged by a strong link.',
        l3: 'Two cells both containing PQ, connected via a strong link on P — any cell that sees both PQ cells can have Q removed.',
      },
      remote_pairs: {
        l1: 'Try candidate tracking mode — long-press a digit on the numpad.',
        l2: 'Find a chain of cells all sharing the same candidate pair, alternating strong links.',
        l3: 'A chain of cells all containing the same two candidates, each connected by strong links — cells that see both ends of the chain can have those candidates removed.',
      },
      swordfish: {
        l1: 'Try candidate tracking mode — long-press a digit on the numpad.',
        l2: 'Like X-Wing but with three rows and three columns forming the pattern.',
        l3: 'Track a digit: if it only appears in (at most) the same three columns across three rows, that digit can be eliminated from the rest of those three columns.',
      },
      x_cycle_simple_coloring: {
        l1: 'Try candidate tracking mode — long-press a digit on the numpad.',
        l2: 'Color a digit with alternating strong/weak links and look for contradictions.',
        l3: "Follow a digit's strong links and color them alternately — if two same-color cells see each other, there's a contradiction; otherwise cells that see both colors can have the digit removed.",
      },
      finned_swordfish: {
        l1: 'Try candidate tracking mode — long-press a digit on the numpad.',
        l2: 'Like Swordfish, but one row has fin candidates — shrinking the elimination zone.',
        l3: "Like Swordfish, but one row's extra candidates all share a box (fin). Eliminations only apply to cells in the same box as the fin and in the same column.",
      },
      jellyfish: {
        l1: 'Try candidate tracking mode — long-press a digit on the numpad.',
        l2: 'Like X-Wing and Swordfish, but with four rows and four columns.',
        l3: 'Track a digit: if it only appears in (at most) the same four columns across four rows, that digit can be eliminated from the rest of those four columns.',
      },
      finned_jellyfish: {
        l1: 'Try candidate tracking mode — long-press a digit on the numpad.',
        l2: 'Like Jellyfish, but one row has fin candidates — shrinking the elimination zone.',
        l3: 'Like Jellyfish, but one row has fin candidates all in the same box. Eliminations only apply to cells in the same box as the fin and in the same column.',
      },
      aic: {
        l1: 'Try candidate tracking mode — long-press a digit on the numpad to build a chain.',
        l2: 'Build an alternating chain of strong and weak links whose endpoints imply each other.',
        l3: "Starting from a candidate, follow alternating strong and weak links — if both ends of the chain can see a cell with one of the chain's digits, that candidate can be removed.",
      },
      aic_mid_chain: {
        l1: 'Try candidate tracking mode — long-press a digit on the numpad to build a chain.',
        l2: 'The middle of the chain forms a strong link — eliminations can happen at mid-chain.',
        l3: 'In an AIC, if the middle forms a strong link, any cell outside the chain that sees both endpoints of that strong link can have the candidate removed.',
      },
      aic_long_chain: {
        l1: 'Try candidate tracking mode — long-press a digit on the numpad to build a chain.',
        l2: 'Build a longer alternating chain and look for eliminations at the endpoints.',
        l3: 'A long AIC: follow the chain from its ends — if the endpoints (or cells in a loop) can see a common cell, that candidate can be eliminated.',
      },
      grouped_aic_nice_loop: {
        l1: 'Try candidate tracking mode — long-press a digit on the numpad to build a chain.',
        l2: 'An alternating chain where some nodes are groups of cells rather than single cells.',
        l3: 'Build a chain where a node can be multiple cells in the same unit sharing a candidate — if the chain loops back on itself, cells that see both group-ends of a node can have that candidate removed.',
      },
      discontinuous_nice_loop: {
        l1: 'Try candidate tracking mode — long-press a digit on the numpad to build a chain.',
        l2: 'An alternating chain whose two ends both point at the same cell.',
        l3: "Follow an alternating chain — if both endpoints target the same cell's candidate, that chain is a contradiction: either that candidate is forced true, or it can be eliminated from the target cell.",
      },
      xy_chain: {
        l1: 'Try candidate tracking mode — long-press a digit on the numpad to build a chain.',
        l2: 'A chain of cells each having exactly two candidates, where each adjacent pair shares one candidate.',
        l3: 'Link cells that each hold only two candidates, sharing one candidate between neighbors — any cell that sees both ends of the chain can have the common endpoint candidate removed.',
      },
      cell_forcing_chain: {
        l1: 'Try candidate tracking mode — long-press a digit on the numpad to build a chain.',
        l2: 'Every candidate in one cell leads to the same conclusion through separate chains.',
        l3: 'Take each candidate in a cell and follow its chain independently — if every path forces the same digit somewhere, that digit is guaranteed regardless of which candidate is true.',
      },
      region_forcing_chain: {
        l1: 'Try candidate tracking mode — long-press a digit on the numpad to build a chain.',
        l2: 'Every possible position of a digit in one unit leads to the same conclusion.',
        l3: 'For each cell where a digit can go in a unit, follow a chain from that assumption — if every chain forces the same result, that result must be true.',
      },
      als_xz: {
        l1: 'Try candidate tracking mode — long-press a digit on the numpad to build a chain.',
        l2: 'Two almost-locked sets share a restricted common digit, locking a second shared digit out of outside cells.',
        l3: 'Find two groups of cells (ALS) where one candidate X is restricted between them — any other candidate Z that appears in both groups can be eliminated from cells that see all instances of Z in both groups.',
      },
      als_xy: {
        l1: 'Try candidate tracking mode — long-press a digit on the numpad to build a chain.',
        l2: 'Two almost-locked sets are bridged by two different restricted digits.',
        l3: 'Find two ALS connected by two bridge digits X and Y — the bridge forces a third candidate Z to be eliminated from cells that see all Z candidates in both sets.',
      },
      als_w_wing: {
        l1: 'Try candidate tracking mode — long-press a digit on the numpad to build a chain.',
        l2: 'Two almost-locked sets are bridged by a strong link, constraining a shared candidate.',
        l3: 'Two ALS each containing candidate Z, connected through a strong link on a bridge digit — any cell that sees all instances of Z in both ALS can have Z removed.',
      },
      als_chain: {
        l1: 'Try candidate tracking mode — long-press a digit on the numpad to build a chain.',
        l2: 'Multiple almost-locked sets form a chain, each adjacent pair sharing a bridge digit.',
        l3: 'Connect a sequence of ALS where each pair shares a restricted bridge candidate — the chain forces a candidate Z at one end to eliminate Z from cells that see all Z instances at the other end.',
      },
      forcing_chain_net: {
        l1: 'Try candidate tracking mode — long-press a digit on the numpad to build a chain.',
        l2: 'Multiple chains from different starting points all converge on the same conclusion.',
        l3: 'Start chains from several different assumptions — if every path forces the same candidate to be true (or false) in some cell, that conclusion holds unconditionally.',
      },
      sue_de_coq: {
        l1: 'Try candidate tracking mode — long-press a digit on the numpad to build a chain.',
        l2: 'In a box-line intersection, the candidates are fully accounted for by two almost-locked sets.',
        l3: 'Find a box-row or box-column intersection whose candidates split exactly into two ALS — one inside the box, one in the line outside the box — leaving no room for other candidates in either the line or the box.',
      },
      template: {
        l1: 'Try candidate tracking mode — long-press a digit on the numpad to build a chain.',
        l2: 'Enumerate all possible placements of one digit and look for cells forced in every solution.',
        l3: 'List every valid way a digit can fill the grid — any cell that must contain (or can never contain) that digit across all templates is resolved.',
      },
      death_blossom: {
        l1: 'Try candidate tracking mode — long-press a digit on the numpad to build a chain.',
        l2: 'A stem cell with multiple candidates, each one connecting to its own almost-locked set.',
        l3: 'For each candidate in the stem cell, find a matching ALS that contains that candidate — any cell that sees all instances of a shared digit across every ALS can have that digit removed.',
      },
      exocet_death_blossom: {
        l1: 'Try candidate tracking mode — long-press a digit on the numpad to build a chain.',
        l2: 'A base pair projects into target cells, and each target spawns its own almost-locked set network.',
        l3: 'Identify an Exocet base and its targets — if each target cell ties into a Death Blossom structure, the combined constraints eliminate candidates from cells that see all the resulting ALS digit instances.',
      },
    },
  },
} as const;
