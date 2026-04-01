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
      first_kill:
        "Your first kill. Remember this feeling.\nLogic doesn't lie, but it does hide.",
      first_kill_sub: '-- Yi-Chen',
      tier1_mastered:
        "The basic techniques have become second nature.\nFrom here on, numbers start appearing in pairs, tangled like shadows.\nDon't be afraid. Shadows have edges too.",
      tier1_mastered_sub: '-- Yi-Chen, "Fragments: Shadow"',
      tier2_unlocked:
        'Can you see it now?\nBetween the rows and columns, beyond the boxes, something is moving.\nThe first time I noticed, I thought my eyes were playing tricks.',
      tier2_unlocked_sub: '-- Yi-Chen, "Fragments: Wind"',
      tier3_unlocked:
        "Not many people make it this far.\nFrom here, reasoning stops being a straight line. It becomes a web.\nI once followed a chain a long way, only to find myself back at the start.",
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
        unveiled:
          "The obvious eye sees plain loneliness. The hidden eye sees the one that's hiding in the crowd.",
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
        veiled: "That shadow crossing between rows and columns... I thought it was two locks. Turns out, it was a door to a higher dimension.",
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
          "W-Wing. Two cells linked by a conjugate chain, like two crescent moons reflected at opposite ends of a lake. The connection itself is the weapon.",
      },
      remote_pairs: {
        veiled: 'A long chain where every link has only two possibilities.',
        unveiled:
          'Remote pairs. Walk along a bivalue chain far enough, and the start and end constrain each other. Distance creates certainty.',
      },
      bug_plus_one: {
        veiled: 'The entire board is almost perfect. Only one cell has one candidate too many.',
        unveiled:
          "BUG+1. When the board is nearly perfect -- every cell has exactly two candidates -- the only three-candidate cell is the flaw. Kill that bug, and the world is clean.",
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
        unveiled:
          "Finned jellyfish. A jellyfish with a fin. The day I saw it, I knew I'd come a very long way.",
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
        veiled: "...Almost-locked sets. Thinking of a group of cells as one whole. By this point, I was starting to feel my brain wasn't enough.",
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
          "ALS-W-Wing. I thought I understood W-Wings, but the ALS version made me realize I only understood half.",
      },
      als_chain: {
        veiled: "...Every link in the chain is an almost-locked set. This isn't how humans think anymore.",
        unveiled:
          "ALS chain. By this point, I was seeing candidates in my dreams. That's not a good sign.",
      },
      forcing_chain_net: {
        veiled: '...If this digit is A, then... if it\'s B, then... both roads lead to the same conclusion.',
        unveiled:
          'Forcing chain. No matter what you assume, the conclusion is the same. The most brute-force logic there is: exhaust every possibility. My brain started overheating here.',
      },
      cell_forcing_chain: {
        veiled: "...One cell's three possibilities, all traced to their end.",
        unveiled:
          'Cell forcing chain. Three parallel universes, traced simultaneously. I only succeeded once.',
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
          "Template. Brute-force enumerate every legal placement for a digit, then find positions that are fixed across all of them. Not elegant, but it works.",
      },
      death_blossom: {
        veiled: '...The moment the flower blooms, every petal points the same way. And that way is death.',
        unveiled:
          "Death blossom. A flower made of almost-locked sets. Each candidate on the stem connects to a petal (ALS), and the petals' shared view is the kill zone. Beautiful and lethal.",
      },
      exocet_death_blossom: {
        veiled:
          "...\n\n(The final handwriting is nearly illegible)\n\nI saw its outline. In that instant, my strength...\n\n(No more writing after this)",
        unveiled:
          "Exocet.\n\nYi-Chen lost all his power pursuing this technique. You are the first to conquer it.\n\nHis journey ends in your hands.",
      },
    },
    finale: {
      text: "You did it.\nThe place I walked so long toward but never reached -- you made it.\n\nNothing in this world of numbers can hold you now.\nBut if you ever look back through these fragments,\nremember that someone named Yi-Chen once walked this road too.",
      sub: '-- Yi-Chen, "Fragments: Final Chapter"',
    },
  },
} as const;
