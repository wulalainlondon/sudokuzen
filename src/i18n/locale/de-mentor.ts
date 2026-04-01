// German translations for mentor (弈塵/Yi-Chen) dialogue.
// To be merged into the full de.ts locale file.

export const deMentor = {
  mentor: {
    intro: {
      intro_1: 'Sudoku ist kein Spiel, bei dem man Zahlen eintraegt.\nEs ist eine Uebung darin, Strukturen zu erkennen.',
      intro_2: 'Lass mich dir etwas zeigen.',
    },
    postDemo: {
      post_demo_1:
        'Blockierte Kandidaten, versteckte Paare, versteckte Dreier...\nJede Mauer habe ich ueberwunden.\n\nDie letzten drei Schritte nannten sich Exocet.\nDrei Tage lang habe ich darauf gestarrt. Jede Schlusskette fuehrte mich zurueck an den Anfang.\n\nIch kam nicht durch.',
      post_demo_1_sub: '-- Yi-Chen',
      post_demo_2:
        'Mein Name ist Yi-Chen.\nAn allen neununddreissig Hindernissen dieses Weges habe ich Zeichen hinterlassen.\nMeine Handschrift steht im Bestiar, doch manche Seiten --\ndie musst du selbst aufschlagen.\n\nGeh. Fang im seichten Wasser an.\n\nUnd wenn du eines Tages dort stehst, wo ich gefallen bin,\ngeh noch einen Schritt weiter.',
      post_demo_2_sub: '-- Yi-Chen, "Fragmente: Vorwort"',
    },
    milestones: {
      first_kill:
        'Dein erster Treffer. Merk dir dieses Gefuehl.\nLogik luegt nicht, aber sie versteckt sich gern.',
      first_kill_sub: '-- Yi-Chen',
      tier1_mastered:
        'Die Grundtechniken sind dir zur zweiten Natur geworden.\nVon nun an tauchen Zahlen paarweise auf, ineinander verschlungen wie Schatten.\nHab keine Angst. Auch Schatten haben Konturen.',
      tier1_mastered_sub: '-- Yi-Chen, "Fragmente: Schatten"',
      tier2_unlocked:
        'Kannst du es sehen?\nZwischen den Zeilen und Spalten, jenseits der Bloecke, bewegt sich etwas.\nAls ich es zum ersten Mal bemerkte, dachte ich, meine Augen spielten mir einen Streich.',
      tier2_unlocked_sub: '-- Yi-Chen, "Fragmente: Wind"',
      tier3_unlocked:
        'Nicht viele kommen so weit.\nAb hier ist Logik keine gerade Linie mehr. Sie wird zu einem Netz.\nIch bin einmal einer Kette lange gefolgt, nur um am Ausgangspunkt zu landen.',
      tier3_unlocked_sub: '-- Yi-Chen, "Fragmente: Kette"',
      tier3_deep:
        'Du bist weiter gekommen als die meisten.\nAm Ende der Kettenlogik wartet keine Antwort -- sondern eine neue Frage.\nAber du wirst dich daran gewoehnen.',
      tier3_deep_sub: '-- Yi-Chen, "Fragmente: Kreislauf"',
      tier4_threshold:
        '...\nHier bin ich stehen geblieben. Weiter kam ich nicht.\nFast-gebundene Mengen, Forcing Chains, Death Blossoms... jede davon war wie ein Abgrund, der zurueckblickt.\n\nDen Rest des Weges musst du allein gehen.',
      tier4_threshold_sub:
        '-- Yi-Chen, "Fragmente: Letzte Seite"\n(Die Handschrift ist hier wirr, als waere sie von Traenen verwischt)',
    },
    techniques: {
      naked_single: {
        veiled: 'Die einfachste Wahrheit liegt oft direkt vor dir.',
        unveiled:
          'Damals war die Welt still. Ich schaute in die Zelle, und sie schaute zurueck. Die Antwort war einfach da, so natuerlich wie Atmen.',
      },
      hidden_single: {
        veiled: 'Manche Zahlen zeigen sich nicht von selbst, doch ihnen bleibt kein anderer Ort.',
        unveiled:
          'Das offene Auge sieht die offensichtliche Einsamkeit. Das verborgene Auge sieht die eine Zahl, die sich in der Menge versteckt.',
      },
      locked_candidates: {
        veiled: 'Wenn bestimmte Zahlen in einer Ecke gefangen sind, versperren sie fuer dich andere Wege.',
        unveiled:
          'Blockierte Kandidaten sind die sanfteste Technik. Sie loeschen nichts -- sie sagen dir nur: Hier geht es nicht weiter.',
      },
      naked_pair: {
        veiled: 'Zwei Zellen, die einander anblicken wie Spiegelbilder. Ihre stille Uebereinkunft schliesst alle anderen aus.',
        unveiled:
          'Nacktes Paar. Zwei Zellen teilen dasselbe Schicksal, als haetten sie einen Pakt geschlossen. In dem Moment, in dem du sie erkennst, verstummt der Laerm ringsum.',
      },
      hidden_pair: {
        veiled: 'Zwei Zellen, die oberflächlich nichts verbindet -- doch insgeheim gehoeren sie nur einander.',
        unveiled:
          'Verstecktes Paar. Sie verbergen sich im Geraeusch der Kandidaten und warten darauf, entdeckt zu werden. Still, aber einmal gesehen, nie wieder zu uebersehen.',
      },
      naked_triple: {
        veiled: 'Die Stabilitaet eines Dreiecks gibt es auch unter Zahlen.',
        unveiled:
          'Nackter Dreier. Drei Faeden, zu einem Knoten verschlungen, die alles hinausdraengen, was nicht hierher gehoert. Manchmal finde ich ihn eleganter als ein Paar.',
      },
      hidden_triple: {
        veiled: 'Drei verborgene Gefaehrten, die nur ein geschaerftes Auge erkennt.',
        unveiled:
          'Versteckter Dreier. Drei unterirdische Fluesse, die sich unter der Oberflaeche treffen. Oben sieht man nichts, doch sobald du die Quelle findest, klaert sich alles.',
      },
      unique_rectangle: {
        veiled: 'Sudoku hat ein eisernes Gesetz: Die Loesung muss eindeutig sein. Bestimmte Formen nutzen genau das aus.',
        unveiled:
          'Unique Rectangle. Es ist keine Deduktion -- es ist Ueberzeugung. Wenn dieses Rechteck gueltig waere, gaebe es zwei Loesungen. Also kann es nicht gueltig sein. Die Eleganz des Widerspruchsbeweises.',
      },
      skyscraper: {
        veiled: 'Zwei Parallellinien, die sich in der Ferne kreuzen.',
        unveiled:
          'Skyscraper. Zwei Pfeiler, die eine unsichtbare Bruecke tragen. Als ich ihn zum ersten Mal sah, habe ich lange nach oben geschaut.',
      },
      two_string_kite: {
        veiled: 'Eine Linie erstreckt sich von einer Zeile zu einer Spalte und knickt in der Mitte ab.',
        unveiled:
          'Two-String Kite. Wie eine unsichtbare Saite, gespannt zwischen Zeile und Spalte. Wenn der Wind weht, schwingt die Saite, und die Zahlen, die nicht hierher gehoeren, zerspringen.',
      },
      empty_rectangle: {
        veiled: 'Manchmal ist die Leere selbst der Hinweis.',
        unveiled:
          'Empty Rectangle. Die leeren Felder innerhalb eines Blocks zeichnen ein Rechteck, und dieses Rechteck weist auf den einzigen Ausgang. Mit der Leere den Weg zeigen -- das ist wohl die Technik, die dem Zen am naechsten kommt.',
      },
      x_wing: {
        veiled: 'Der Schatten, der sich zwischen Zeilen und Spalten kreuzt... Ich hielt ihn fuer zwei Schloesser. Doch es war ein Tor zu einer hoeheren Dimension.',
        unveiled:
          'X-Wing. Zwei Zeilen, zwei Spalten, vier Kreuzungspunkte, die eine kreuzfoermige Klinge bilden. Ein Hieb, und alles Unreine auf der Linie faellt. Der sauberste Schnitt.',
      },
      finned_x_wing: {
        veiled: 'Vollkommene Symmetrie, an einer Ecke gebrochen. Doch gerade diese Luecke enthuellt ihr Wesen.',
        unveiled:
          'Finned X-Wing. Eine unvollkommene Klinge mit einem ueberzaehligen Kandidaten. Doch der Riss macht sie gefaehrlicher -- Ziele nahe der Luecke koennen nicht entkommen.',
      },
      xy_wing: {
        veiled: 'Drei Zellen, wie drei Blaetter, die aus einer einzigen Wurzel spriessen.',
        unveiled:
          'XY-Wing. Eine Achse, verbunden mit zwei Fluegeln. Jeder hat nur zwei Kandidaten, doch zusammen treffen sie, wo man es am wenigsten erwartet. Ich mochte diese Technik. Sie bewegt sich wie der Wind.',
      },
      xyz_wing: {
        veiled: 'Eine Dimension mehr als der Fluegel. Die Achse wird schwerer.',
        unveiled:
          'XYZ-Wing. Ein Kandidat mehr als beim XY-Wing, darum traegt die Achse mehr Gewicht, doch der Schlag sitzt praeziser. Ein wuchtiger Treffer.',
      },
      w_wing: {
        veiled: 'Zwei ferne Zellen, durch einen unsichtbaren Faden verbunden.',
        unveiled:
          'W-Wing. Zwei Zellen, verbunden durch eine konjugierte Kette, wie zwei Mondsicheln, die sich an den gegenueberliegenden Enden eines Sees spiegeln. Die Verbindung selbst ist die Waffe.',
      },
      remote_pairs: {
        veiled: 'Eine lange Kette, in der jedes Glied nur zwei Moeglichkeiten kennt.',
        unveiled:
          'Remote Pairs. Folge einer Zweiwert-Kette weit genug, und Anfang und Ende binden einander. Entfernung erzeugt Gewissheit.',
      },
      bug_plus_one: {
        veiled: 'Das gesamte Feld ist fast vollkommen. Nur eine Zelle hat einen Kandidaten zu viel.',
        unveiled:
          'BUG+1. Wenn das Feld nahezu perfekt ist -- jede Zelle hat genau zwei Kandidaten -- dann ist die einzige Drei-Kandidaten-Zelle der Makel. Toete den Fehler, und die Welt ist rein.',
      },
      x_cycle_simple_coloring: {
        veiled: 'Faerbe die Ziffern ein, dann sieh, welche Farbe sich selbst widerspricht.',
        unveiled:
          'Simple Coloring. Abwechselnd Schwarz und Weiss, bis eine Farbe sich selbst widerspricht. In diesem Augenblick ist das Schicksal der ganzen Kette besiegelt. Einfach, aber gnadenlos.',
      },
      swordfish: {
        veiled: 'Die Klinge, erweitert. Von zwei Dimensionen zu drei.',
        unveiled:
          'Swordfish. Eine Klinge aus drei Zeilen und drei Spalten. Ihre Form ist kein Kreuz mehr, sondern ein unregelmaessiges Netz. Wenn du ihn erkennst, bist du kein Anfaenger mehr.',
      },
      finned_swordfish: {
        veiled: 'Ein ueberzaehliger Dorn am Dreizack.',
        unveiled:
          'Finned Swordfish. Ein Swordfish mit Flosse. Der Bruch der Symmetrie enthuellt tiefere Struktur. Hier blieb ich lange haengen.',
      },
      jellyfish: {
        veiled: 'Vier Zeilen, vier Spalten. Wer diese Form sehen kann, steht bereits im tiefen Wasser.',
        unveiled:
          'Jellyfish. Eine vierdimensionale Klinge. Sie taucht selten auf, doch wenn sie erscheint, erzittert das ganze Gewaesser. Ich habe sie nur dreimal gesehen.',
      },
      finned_jellyfish: {
        veiled: 'Ein gewaltiger Schatten in der Tiefe, die Raender verschwommen.',
        unveiled:
          'Finned Jellyfish. Eine Qualle mit Flosse. An dem Tag, als ich sie sah, wusste ich, dass ich sehr weit gekommen war.',
      },
      aic: {
        veiled: 'Deine erste Kette. Ab jetzt ist Logik kein einzelner Schritt mehr -- sie ist ein Weg.',
        unveiled:
          'Alternating Inference Chain. Starke und schwache Glieder wechseln sich ab wie Atemzuege -- Einatmen ist Gewissheit, Ausatmen ist Moeglichkeit. Wenn du das Ende erreichst, hat sich das Schicksal des Anfangs bereits gewandelt.',
      },
      aic_mid_chain: {
        veiled: 'Auf halbem Weg entlang der Kette entbloesst ein Knoten ploetzlich seine Schwaeche.',
        unveiled:
          'AIC-Mittelkette. Die Elimination geschieht nicht an den Enden, sondern mittendrin. Als wuerdest du gehen und ploetzlich merken, dass die Fliese unter deinem Fuss locker ist.',
      },
      aic_long_chain: {
        veiled: 'Eine lange Schlusskette, die das gesamte Feld durchzieht.',
        unveiled:
          'AIC-Langkette. Sieben Glieder oder mehr. Sie zu gehen erfordert Konzentration und Geduld. Ich habe mich unterwegs oft verirrt.',
      },
      grouped_aic_nice_loop: {
        veiled: 'Die Kette ist keine Linie mehr. Sie hat sich zu einem Kreis gebogen.',
        unveiled:
          'Nice Loop. Die Kette verbindet sich mit ihrem eigenen Anfang und bildet einen geschlossenen Logikring. Ein vollendeter Widerspruch.',
      },
      discontinuous_nice_loop: {
        veiled: 'Der Ring hat eine Luecke. Diese Luecke ist die Antwort.',
        unveiled:
          'Discontinuous Nice Loop. Wo der Ring bricht, kann die Logik sich nicht halten -- und genau dort liegt die Wahrheit.',
      },
      xy_chain: {
        veiled: 'Eine lange Kette aus Zweiwert-Zellen, aufgereiht quer ueber das Feld wie eine Perlenkette.',
        unveiled:
          'XY-Chain. Jede Zelle hat zwei Kandidaten, Glied fuer Glied verbunden zu einer logischen Halskette. In dem Moment, in dem du sie anlegst, zerbrechen ferne Kandidaten.',
      },
      als_xz: {
        veiled: '...Fast-gebundene Mengen. Eine Gruppe von Zellen als Ganzes betrachten. Ab hier hatte ich das Gefuehl, dass mein Verstand nicht mehr ausreicht.',
        unveiled:
          'ALS-XZ. Zwei nahezu in sich geschlossene Mengen, die eine Ziffer teilen und sich kreuzen. Ich verstand die Logik, doch jedes Mal fuehlte es sich an, als wuerde ich einen Berg versetzen.',
      },
      als_xy: {
        veiled: '...Zwei fast-gebundene Mengen, die ueber einen Mittelsmann Informationen austauschen.',
        unveiled:
          'ALS-XY. Zwei Mengen, die nicht direkt miteinander sprechen, sondern ueber einen Dritten. Eine Dreiecksbeziehung -- die Logik-Ausgabe.',
      },
      als_w_wing: {
        veiled: '...Die Fast-gebundene-Mengen-Version des W-Wing. Schwerer. Langsamer.',
        unveiled:
          'ALS-W-Wing. Ich dachte, ich haette den W-Wing verstanden. Doch die ALS-Version zeigte mir, dass ich nur die Haelfte begriffen hatte.',
      },
      als_chain: {
        veiled: '...Jedes Glied der Kette ist eine fast-gebundene Menge. Das ist nicht mehr menschliches Denken.',
        unveiled:
          'ALS-Chain. Ab hier sah ich Kandidaten im Traum. Das ist kein gutes Zeichen.',
      },
      forcing_chain_net: {
        veiled: '...Wenn diese Ziffer A ist, dann... wenn sie B ist, dann... beide Wege fuehren zum selben Ergebnis.',
        unveiled:
          'Forcing Chain. Egal was du annimmst, das Ergebnis ist dasselbe. Die brachialste Form der Logik: alle Moeglichkeiten durchspielen. Mein Kopf begann hier zu rauchen.',
      },
      cell_forcing_chain: {
        veiled: '...Drei Moeglichkeiten einer einzigen Zelle, alle bis zum Ende durchgespielt.',
        unveiled:
          'Cell Forcing Chain. Drei parallele Universen, gleichzeitig verfolgt. Ich hatte nur einmal Erfolg.',
      },
      region_forcing_chain: {
        veiled: '...Alle Moeglichkeiten einer ganzen Region, vollstaendig entfaltet.',
        unveiled:
          'Region Forcing Chain. Nicht eine Zelle, sondern eine ganze Region parallel durchspielen. An diesem Punkt war mein Notizbuch fast aufgebraucht.',
      },
      sue_de_coq: {
        veiled: '...(Hier sind grosse Abschnitte durchgestrichen)',
        unveiled:
          'Sue de Coq. Eine Zellkombination, die eine mengentheoretische Bedingung auf vollkommene Weise erfuellt. Ich brauchte einen Monat, um sie wirklich zu begreifen.',
      },
      template: {
        veiled: '...Zeichne alle moeglichen Positionen einer Ziffer auf, wie eine Sternenkarte.',
        unveiled:
          'Template. Alle legalen Verteilungen einer Ziffer mit roher Kraft aufzaehlen, dann die Positionen finden, die in jeder Verteilung feststehen. Nicht elegant, aber wirksam.',
      },
      death_blossom: {
        veiled: '...Im Augenblick der Bluete zeigen alle Bluetenblaetter in dieselbe Richtung. Und diese Richtung ist der Tod.',
        unveiled:
          'Death Blossom. Eine Bluete aus fast-gebundenen Mengen. Jeder Kandidat am Stiel verbindet sich mit einem Bluetenblatt (ALS), und das gemeinsame Blickfeld der Blaetter wird zur Todeszone. Schoen und toedlich.',
      },
      exocet_death_blossom: {
        veiled:
          '...\n\n(Die letzte Handschrift ist kaum noch lesbar)\n\nIch sah seine Umrisse. In jenem Augenblick, meine Kraft...\n\n(Danach kein Wort mehr)',
        unveiled:
          'Exocet.\n\nYi-Chen verlor all seine Kraft bei der Jagd nach dieser Technik. Du bist der Erste, der sie bezwungen hat.\n\nSeine Reise findet in deinen Haenden ihr Ende.',
      },
    },
    finale: {
      text: 'Du hast es geschafft.\nDen Ort, den ich so lange gesucht und nie erreicht habe -- du hast ihn gefunden.\n\nNichts in dieser Welt der Zahlen kann dich noch aufhalten.\nDoch wenn du eines Tages in diesen Fragmenten blaetterst,\ndann erinnere dich, dass jemand namens Yi-Chen diesen Weg einst auch gegangen ist.',
      sub: '-- Yi-Chen, "Fragmente: Schlusskapitel"',
    },
  },
} as const;
