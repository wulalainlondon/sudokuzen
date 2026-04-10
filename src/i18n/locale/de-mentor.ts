// German translations for mentor (弈塵/Yi-Chen) dialogue.
// To be merged into the full de.ts locale file.

export const deMentor = {
  mentor: {
    intro: {
      intro_1:
        'Sudoku ist kein Spiel, bei dem man Zahlen eintraegt.\nEs ist eine Uebung darin, Strukturen zu erkennen.',
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
      first_kill: 'Dein erster Treffer. Merk dir dieses Gefuehl.\nLogik luegt nicht, aber sie versteckt sich gern.',
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
        veiled:
          'Zwei Zellen, die einander anblicken wie Spiegelbilder. Ihre stille Uebereinkunft schliesst alle anderen aus.',
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
        veiled:
          'Sudoku hat ein eisernes Gesetz: Die Loesung muss eindeutig sein. Bestimmte Formen nutzen genau das aus.',
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
        veiled:
          'Der Schatten, der sich zwischen Zeilen und Spalten kreuzt... Ich hielt ihn fuer zwei Schloesser. Doch es war ein Tor zu einer hoeheren Dimension.',
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
        veiled:
          '...Fast-gebundene Mengen. Eine Gruppe von Zellen als Ganzes betrachten. Ab hier hatte ich das Gefuehl, dass mein Verstand nicht mehr ausreicht.',
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
        unveiled: 'ALS-Chain. Ab hier sah ich Kandidaten im Traum. Das ist kein gutes Zeichen.',
      },
      forcing_chain_net: {
        veiled: '...Wenn diese Ziffer A ist, dann... wenn sie B ist, dann... beide Wege fuehren zum selben Ergebnis.',
        unveiled:
          'Forcing Chain. Egal was du annimmst, das Ergebnis ist dasselbe. Die brachialste Form der Logik: alle Moeglichkeiten durchspielen. Mein Kopf begann hier zu rauchen.',
      },
      cell_forcing_chain: {
        veiled: '...Drei Moeglichkeiten einer einzigen Zelle, alle bis zum Ende durchgespielt.',
        unveiled: 'Cell Forcing Chain. Drei parallele Universen, gleichzeitig verfolgt. Ich hatte nur einmal Erfolg.',
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
        veiled:
          '...Im Augenblick der Bluete zeigen alle Bluetenblaetter in dieselbe Richtung. Und diese Richtung ist der Tod.',
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
    techEssence: {
      naked_single: 'Eine Zelle mit nur einem Kandidaten — sofort ausfuellen.',
      hidden_single: 'Eine Ziffer erscheint in einer Einheit nur in einer Zelle — dort muss sie stehen.',
      locked_candidates:
        'Alle Kandidaten einer Ziffer in einem Block liegen in derselben Zeile oder Spalte — die Ziffer kann aus den uebrigen Zellen dieser Zeile oder Spalte geloescht werden.',
      naked_pair:
        'Zwei Zellen teilen genau dieselben zwei Kandidaten — keine andere Zelle in ihrer Einheit kann eine der beiden Ziffern enthalten.',
      hidden_pair:
        'Zwei Ziffern erscheinen in einer Einheit nur in denselben zwei Zellen — alle anderen Kandidaten in diesen Zellen sind unmoglich.',
      naked_triple:
        'Drei Zellen enthalten zusammen nur drei Kandidaten — diese Kandidaten koennen in keiner anderen Zelle der Einheit vorkommen.',
      hidden_triple:
        'Drei Ziffern erscheinen in einer Einheit nur in denselben drei Zellen — alle anderen Kandidaten in diesen Zellen werden geloescht.',
      x_wing:
        'Eine Ziffer erscheint in nur zwei Spalten ueber zwei Zeilen und bildet ein Rechteck — sie wird aus den uebrigen Zellen dieser Spalten geloescht.',
      unique_rectangle:
        'Vier Zellen in einem Rechteck ueber zwei Bloecke koennen nicht alle dieselben zwei Kandidaten enthalten, ohne zwei Loesungen zu erzeugen.',
      bug_plus_one:
        'Jede Zelle hat genau zwei Kandidaten bis auf eine — diese Ausnahmezelle muss das gesamte Raetsel aufloesen.',
      skyscraper:
        'Zwei starke Verbindungen in zwei Spalten teilen eine gemeinsame Zeile — Zellen, die beide Enden sehen, koennen geloescht werden.',
      two_string_kite:
        'Eine starke Zeilen- und eine starke Spaltenverbindung schneiden sich in einem Block — Zellen, die beide Enden sehen, koennen geloescht werden.',
      empty_rectangle:
        'Alle Kandidaten in einem Block konzentrieren sich auf eine Zeile oder Spalte und wirken wie eine virtuelle starke Verbindung zu entfernten Zellen.',
      finned_x_wing:
        'Wie X-Wing, aber eine Zeile hat zusaetzliche Kandidaten in demselben Block — Eliminierungen sind auf Zellen beschraenkt, die sowohl die Spalte als auch den Fin-Block sehen.',
      xy_wing:
        'Ein Pivotelement mit den Kandidaten XY verbindet Fluegel XZ und YZ — jede Zelle, die beide Fluegel sieht, kann kein Z enthalten.',
      xyz_wing:
        'Ein Pivotelement mit XYZ verbindet Fluegel XZ und YZ — jede Zelle, die alle drei sieht, kann kein Z enthalten.',
      w_wing:
        'Zwei Zellen mit demselben Kandidatenpaar sind durch eine starke Verbindung gebrueckt — jede Zelle, die beide Enden sieht, kann den gemeinsamen Kandidaten nicht enthalten.',
      remote_pairs:
        'Eine Kette von Zellen, die jeweils dieselben zwei Kandidaten enthalten, wechselt in der Paritaet — Zellen, die beide Kettenenden sehen, werden geloescht.',
      swordfish:
        'Eine Ziffer erscheint in nur drei Spalten ueber drei Zeilen — sie wird aus den uebrigen Zellen dieser drei Spalten geloescht.',
      x_cycle_simple_coloring:
        'Abwechselnde starke Verbindungen bilden eine geschlossene Schleife — gleichfarbige Knoten in Konflikt bedeuten, dass diese Farbe geloescht wird.',
      finned_swordfish:
        'Wie Swordfish, aber eine Zeile hat zusaetzliche Kandidaten in einem Block — Eliminierungen sind auf Zellen beschraenkt, die Spalte und Fin-Block sehen.',
      jellyfish:
        'Eine Ziffer erstreckt sich ueber nur vier Spalten in vier Zeilen — aus allen anderen Zellen dieser vier Spalten geloescht.',
      finned_jellyfish:
        'Wie Jellyfish, aber mit einem Fin — Eliminierungen sind auf Zellen beschraenkt, die auch den Fin-Block sehen.',
      aic: 'Eine abwechselnde Kette aus starken und schwachen Verbindungen — teilen beide Enden einen Kandidaten, wird dieser aus allen Zellen geloescht, die beide Endpunkte sehen.',
      aic_mid_chain:
        'Ein AIC, dessen Inneres einen Kandidaten aus einer Zelle loescht, die zwei aufeinanderfolgende Kettenknoten sieht.',
      aic_long_chain:
        'Eine laengere abwechselnde Kette ueber mehrere Einheiten — dasselbe Eliminierungsprinzip gilt unabhaengig von der Kettenlaenge.',
      grouped_aic_nice_loop:
        'Ein AIC, bei dem einige Knoten Gruppen von Zellen mit einer starken Verbindung in einem Block darstellen und die Reichweite der Kette erweitern.',
      discontinuous_nice_loop:
        'Ein AIC, dessen beide Enden auf dieselbe Zelle zeigen — einer ihrer Kandidaten muss wahr sein und loescht alle anderen in dieser Zelle.',
      xy_chain:
        'Eine Kette aus Zweiwert-Zellen, bei der jedes benachbarte Paar einen Kandidaten teilt — Zellen, die beide Endpunkte sehen, verlieren den gemeinsamen Kandidaten.',
      cell_forcing_chain:
        'Jeder Kandidat in einer Zelle fuehrt unabhaengig zur selben Schlussfolgerung — diese muss wahr sein.',
      region_forcing_chain:
        'Jede Platzierung einer Ziffer in einer Einheit fuehrt unabhaengig zur selben Schlussfolgerung — diese muss wahr sein.',
      als_xz:
        'Zwei fast gebundene Mengen teilen einen eingeschraenkten gemeinsamen Kandidaten X — jede Zelle, die alle Instanzen eines weiteren gemeinsamen Kandidaten Z in beiden Mengen sieht, kann kein Z enthalten.',
      als_xy:
        'Zwei ALS sind durch zwei eingeschraenkte gemeinsame Kandidaten verbunden — der dritte gemeinsame Kandidat kann aus externen Zellen geloescht werden.',
      als_w_wing:
        'Zwei ALS durch eine starke Verbindung auf einem Kandidaten gebrueckt — externe Zellen, die beide Mengen sehen, verlieren den anderen gemeinsamen Kandidaten.',
      als_chain:
        'Eine Sequenz fast gebundener Mengen, die jeweils einen eingeschraenkten gemeinsamen Kandidaten mit der naechsten teilen — die Kette erzeugt eine erzwungene Eliminierung an ihren Enden.',
      forcing_chain_net:
        'Mehrere Ketten aus verschiedenen Ausgangsannahmen konvergieren alle zur selben erzwungenen Schlussfolgerung.',
      sue_de_coq:
        'Eine Block-Zeilen-Kreuzung, wo zwei ALS zusammen alle Kandidaten der Kreuzung erklaeren — beide Einheiten werden anderswo von diesen Kandidaten befreit.',
      template:
        'Alle gueltigen Platzierungen einer Ziffer aufzaehlen — jede Zelle, die aus jeder gueltigen Vorlage ausgeschlossen ist, kann diese Ziffer nicht enthalten.',
      death_blossom:
        'Eine Stammzelle mit mehreren Kandidaten, die jeweils mit einem einzigartigen ALS verknuepft sind — zusammen erzwingen sie eine Eliminierung in Zellen, die alle ALS-Instanzen sehen.',
      exocet_death_blossom:
        'Ein Basispaar von Zellen projiziert ihre Kandidaten durch ein komplexes ALS-Netzwerk in Zielzellen und erzwingt massive Eliminierungen ueber das gesamte Gitter.',
    },
    ctmIntro: {
      text: 'In diesem Block gibt es zwei Zellen. Eine davon muss diese Zahl tragen.\n\nHalte eine Ziffer auf dem Nummernfeld gedrückt, um die Verfolgung zu starten. Tippe dann auf jede Zelle.\nBeobachte, was passiert, wenn zwei Zellen dasselbe Geheimnis teilen.',
      sub: '── Yi-Chen ──',
    },
    finale: {
      text: 'Du hast es geschafft.\nDen Ort, den ich so lange gesucht und nie erreicht habe -- du hast ihn gefunden.\n\nNichts in dieser Welt der Zahlen kann dich noch aufhalten.\nDoch wenn du eines Tages in diesen Fragmenten blaetterst,\ndann erinnere dich, dass jemand namens Yi-Chen diesen Weg einst auch gegangen ist.',
      sub: '-- Yi-Chen, "Fragmente: Schlusskapitel"',
    },
    encounterHints: {
      locked_candidates: {
        l1: 'Probiere den Kandidaten-Verfolgungsmodus — halte eine Ziffer auf dem Numpad gedrückt.',
        l2: 'Beachte, dass in einem Block eine Ziffer nur in Zellen derselben Zeile (oder Spalte) vorkommt.',
        l3: 'Verfolge jede Ziffer: Wenn alle ihre Kandidaten in einem Block auf einer Zeile oder Spalte liegen, kann sie aus dem Rest dieser Zeile oder Spalte gestrichen werden.',
      },
      naked_pair: {
        l1: 'Probiere den Kandidaten-Verfolgungsmodus — halte eine Ziffer auf dem Numpad gedrückt.',
        l2: 'Finde zwei Zellen in derselben Einheit, die genau dieselben zwei Kandidaten teilen.',
        l3: 'In einer Zeile, Spalte oder einem Block: Wenn zwei Zellen genau dasselbe Kandidatenpaar enthalten, können diese zwei Ziffern aus allen anderen Zellen dieser Einheit entfernt werden.',
      },
      hidden_pair: {
        l1: 'Probiere den Kandidaten-Verfolgungsmodus — halte eine Ziffer auf dem Numpad gedrückt.',
        l2: 'In einer Einheit erscheinen zwei Ziffern nur in denselben zwei Zellen.',
        l3: 'Finde eine Zeile, Spalte oder einen Block, in dem zwei bestimmte Ziffern nur in zwei Zellen vorkommen — alle anderen Kandidaten in diesen zwei Zellen können entfernt werden.',
      },
      naked_triple: {
        l1: 'Probiere den Kandidaten-Verfolgungsmodus — halte eine Ziffer auf dem Numpad gedrückt.',
        l2: 'Finde drei Zellen in derselben Einheit, deren kombinierte Kandidaten insgesamt nur drei Ziffern ergeben.',
        l3: 'In einer Zeile, Spalte oder einem Block: Wenn drei Zellen zusammen nur drei verschiedene Kandidaten enthalten, können diese Kandidaten aus allen anderen Zellen dieser Einheit gestrichen werden.',
      },
      hidden_triple: {
        l1: 'Probiere den Kandidaten-Verfolgungsmodus — halte eine Ziffer auf dem Numpad gedrückt.',
        l2: 'In einer Einheit erscheinen drei Ziffern nur in denselben drei Zellen.',
        l3: 'Finde eine Einheit, in der drei Ziffern nur in drei Zellen vorkommen — alle anderen Kandidaten in diesen drei Zellen können entfernt werden.',
      },
      x_wing: {
        l1: 'Probiere den Kandidaten-Verfolgungsmodus — halte eine Ziffer auf dem Numpad gedrückt.',
        l2: 'Finde zwei Zeilen, in denen eine Ziffer nur in denselben zwei Spalten vorkommt.',
        l3: 'Verfolge eine Ziffer: Wenn sie in genau zwei Spalten über zwei Zeilen vorkommt, kann diese Ziffer aus dem Rest dieser zwei Spalten gestrichen werden.',
      },
      unique_rectangle: {
        l1: 'Probiere den Kandidaten-Verfolgungsmodus — halte eine Ziffer auf dem Numpad gedrückt.',
        l2: 'Vier Zellen bilden ein Rechteck über zwei Blöcke — die Eindeutigkeitsbedingung schränkt gültige Kandidaten ein.',
        l3: 'Vier Zellen in einem 2×2-Rechteck, das zwei Blöcke umspannt: Wenn sie alle dieselben zwei Kandidaten enthalten, würde das zwei Lösungen erlauben — daher müssen einige Kandidaten entfernt werden.',
      },
      bug_plus_one: {
        l1: 'Probiere den Kandidaten-Verfolgungsmodus — halte eine Ziffer auf dem Numpad gedrückt.',
        l2: 'Wenn jede leere Zelle genau zwei Kandidaten hat bis auf eine, hält diese eine Zelle den Schlüssel.',
        l3: 'Wenn das Feld genau eine Zelle mit mehr als zwei Kandidaten hat, muss der Kandidat in dieser Zelle, der eine eindeutige Lösung erhält, die Antwort sein.',
      },
      skyscraper: {
        l1: 'Probiere den Kandidaten-Verfolgungsmodus — halte eine Ziffer auf dem Numpad gedrückt.',
        l2: 'In einer Spalte gibt es zwei Zellen mit einer starken Verbindung; ihre Verlängerungen können sich gegenseitig aufheben.',
        l3: 'Verfolge eine Ziffer: Finde eine starke Verbindung in zwei Spalten. Wenn diese Verbindungen eine Zeile teilen, kann jede Zelle, die beide fernen Enden dieser Verbindungen sieht, diese Ziffer verlieren.',
      },
      two_string_kite: {
        l1: 'Probiere den Kandidaten-Verfolgungsmodus — halte eine Ziffer auf dem Numpad gedrückt.',
        l2: 'Finde eine Zeile und eine Spalte, die jeweils eine starke Verbindung haben und sich im selben Block treffen.',
        l3: 'In einem Block kreuzen sich die starke Verbindung einer Zeile und die starke Verbindung einer Spalte — jede Zelle, die beide fernen Enden dieser Verbindungen sieht, kann diese Ziffer verlieren.',
      },
      empty_rectangle: {
        l1: 'Probiere den Kandidaten-Verfolgungsmodus — halte eine Ziffer auf dem Numpad gedrückt.',
        l2: 'In einem Block erscheint eine Ziffer nur in Zellen einer Zeile oder Spalte — ein „leeres Rechteck" entsteht.',
        l3: 'Alle Kandidaten einer Ziffer in einem Block liegen auf derselben Zeile oder Spalte. Kombiniert mit einer weiteren starken Verbindung kann diese Ziffer aus Zellen gestrichen werden, die beide Endpunkte sehen.',
      },
      finned_x_wing: {
        l1: 'Probiere den Kandidaten-Verfolgungsmodus — halte eine Ziffer auf dem Numpad gedrückt.',
        l2: 'Wie X-Wing, aber eine Zeile hat zusätzliche Kandidaten (Flossen) — die Eliminierungszone schrumpft.',
        l3: 'Wie X-Wing, aber eine Zeile hat einige zusätzliche Kandidaten alle im selben Block (die Flosse). Streichungen gelten nur für Zellen, die sowohl die normale X-Wing-Spalte sehen als auch im selben Block wie die Flosse liegen.',
      },
      xy_wing: {
        l1: 'Probiere den Kandidaten-Verfolgungsmodus — halte eine Ziffer auf dem Numpad gedrückt.',
        l2: 'Finde eine Achszelle mit zwei Kandidaten, verbunden mit zwei Flügelzellen, die je einen Kandidaten teilen.',
        l3: 'Finde eine Achse mit den Kandidaten XY, verbunden mit einer Zelle mit XZ und einer Zelle mit YZ — jede Zelle, die beide Flügelzellen sieht, kann Z verlieren.',
      },
      xyz_wing: {
        l1: 'Probiere den Kandidaten-Verfolgungsmodus — halte eine Ziffer auf dem Numpad gedrückt.',
        l2: 'Wie XY-Wing, aber die Achse hat drei Kandidaten (XYZ) und die Flügel teilen je ein Paar mit ihr.',
        l3: 'Eine Achse mit XYZ, verbunden mit Flügeln XZ und YZ — jede Zelle, die alle drei Zellen sieht, kann Z verlieren.',
      },
      w_wing: {
        l1: 'Probiere den Kandidaten-Verfolgungsmodus — halte eine Ziffer auf dem Numpad gedrückt.',
        l2: 'Finde zwei Zellen mit demselben Kandidatenpaar, verbunden durch eine starke Verbindung.',
        l3: 'Zwei Zellen, die beide PQ enthalten, verbunden über eine starke Verbindung auf P — jede Zelle, die beide PQ-Zellen sieht, kann Q verlieren.',
      },
      remote_pairs: {
        l1: 'Probiere den Kandidaten-Verfolgungsmodus — halte eine Ziffer auf dem Numpad gedrückt.',
        l2: 'Finde eine Kette von Zellen, die alle dasselbe Kandidatenpaar teilen, mit abwechselnden starken Verbindungen.',
        l3: 'Eine Kette von Zellen, die alle dieselben zwei Kandidaten enthalten, jeweils durch starke Verbindungen verknüpft — Zellen, die beide Enden der Kette sehen, können diese Kandidaten verlieren.',
      },
      swordfish: {
        l1: 'Probiere den Kandidaten-Verfolgungsmodus — halte eine Ziffer auf dem Numpad gedrückt.',
        l2: 'Wie X-Wing, aber mit drei Zeilen und drei Spalten, die das Muster bilden.',
        l3: 'Verfolge eine Ziffer: Wenn sie über drei Zeilen nur in (höchstens) denselben drei Spalten vorkommt, kann diese Ziffer aus dem Rest dieser drei Spalten gestrichen werden.',
      },
      x_cycle_simple_coloring: {
        l1: 'Probiere den Kandidaten-Verfolgungsmodus — halte eine Ziffer auf dem Numpad gedrückt.',
        l2: 'Färbe eine Ziffer mit abwechselnden starken/schwachen Verbindungen ein und suche nach Widersprüchen.',
        l3: 'Folge den starken Verbindungen einer Ziffer und färbe sie abwechselnd — wenn zwei gleichfarbige Zellen einander sehen, gibt es einen Widerspruch; sonst können Zellen, die beide Farben sehen, die Ziffer verlieren.',
      },
      finned_swordfish: {
        l1: 'Probiere den Kandidaten-Verfolgungsmodus — halte eine Ziffer auf dem Numpad gedrückt.',
        l2: 'Wie Swordfish, aber eine Zeile hat Flossen-Kandidaten — die Eliminierungszone schrumpft.',
        l3: 'Wie Swordfish, aber die zusätzlichen Kandidaten einer Zeile teilen alle einen Block (Flosse). Streichungen gelten nur für Zellen im selben Block wie die Flosse und in derselben Spalte.',
      },
      jellyfish: {
        l1: 'Probiere den Kandidaten-Verfolgungsmodus — halte eine Ziffer auf dem Numpad gedrückt.',
        l2: 'Wie X-Wing und Swordfish, aber mit vier Zeilen und vier Spalten.',
        l3: 'Verfolge eine Ziffer: Wenn sie über vier Zeilen nur in (höchstens) denselben vier Spalten vorkommt, kann diese Ziffer aus dem Rest dieser vier Spalten gestrichen werden.',
      },
      finned_jellyfish: {
        l1: 'Probiere den Kandidaten-Verfolgungsmodus — halte eine Ziffer auf dem Numpad gedrückt.',
        l2: 'Wie Jellyfish, aber eine Zeile hat Flossen-Kandidaten — die Eliminierungszone schrumpft.',
        l3: 'Wie Jellyfish, aber eine Zeile hat Flossen-Kandidaten alle im selben Block. Streichungen gelten nur für Zellen im selben Block wie die Flosse und in derselben Spalte.',
      },
      aic: {
        l1: 'Probiere den Kandidaten-Verfolgungsmodus — halte eine Ziffer auf dem Numpad gedrückt, um eine Kette aufzubauen.',
        l2: 'Baue eine abwechselnde Kette aus starken und schwachen Verbindungen, deren Endpunkte aufeinander schließen lassen.',
        l3: 'Beginne bei einem Kandidaten und folge abwechselnden starken und schwachen Verbindungen — wenn beide Enden der Kette eine Zelle mit einer der Ziffern der Kette sehen, kann dieser Kandidat entfernt werden.',
      },
      aic_mid_chain: {
        l1: 'Probiere den Kandidaten-Verfolgungsmodus — halte eine Ziffer auf dem Numpad gedrückt, um eine Kette aufzubauen.',
        l2: 'Die Mitte der Kette bildet eine starke Verbindung — Streichungen können in der Kettenmitte erfolgen.',
        l3: 'In einem AIC: Wenn die Mitte eine starke Verbindung bildet, kann jede Zelle außerhalb der Kette, die beide Endpunkte dieser starken Verbindung sieht, den Kandidaten verlieren.',
      },
      aic_long_chain: {
        l1: 'Probiere den Kandidaten-Verfolgungsmodus — halte eine Ziffer auf dem Numpad gedrückt, um eine Kette aufzubauen.',
        l2: 'Baue eine längere abwechselnde Kette und suche nach Streichungen an den Endpunkten.',
        l3: 'Ein langer AIC: Folge der Kette von ihren Enden — wenn die Endpunkte (oder Zellen in einer Schleife) eine gemeinsame Zelle sehen, kann dieser Kandidat gestrichen werden.',
      },
      grouped_aic_nice_loop: {
        l1: 'Probiere den Kandidaten-Verfolgungsmodus — halte eine Ziffer auf dem Numpad gedrückt, um eine Kette aufzubauen.',
        l2: 'Eine abwechselnde Kette, bei der Knoten Gruppen von Zellen statt Einzelzellen sein können.',
        l3: 'Baue eine Kette mit Gruppenknoten — wenn die Kette sich zu einer Schleife schließt, können Zellen, die beide Gruppenenden eines Knotens sehen, diesen Kandidaten verlieren.',
      },
      discontinuous_nice_loop: {
        l1: 'Probiere den Kandidaten-Verfolgungsmodus — halte eine Ziffer auf dem Numpad gedrückt, um eine Kette aufzubauen.',
        l2: 'Eine abwechselnde Kette, deren beide Enden auf dieselbe Zelle zeigen.',
        l3: 'Folge einer abwechselnden Kette — wenn beide Endpunkte auf den Kandidaten derselben Zelle zeigen, ergibt sich ein Widerspruch: Entweder ist dieser Kandidat erzwungen, oder er kann aus der Zielzelle gestrichen werden.',
      },
      xy_chain: {
        l1: 'Probiere den Kandidaten-Verfolgungsmodus — halte eine Ziffer auf dem Numpad gedrückt, um eine Kette aufzubauen.',
        l2: 'Eine Kette aus Zellen mit genau zwei Kandidaten, bei der benachbarte Zellen je einen Kandidaten teilen.',
        l3: 'Verknüpfe Zellen mit je zwei Kandidaten über gemeinsame Kandidaten — jede Zelle, die beide Enden der Kette sieht, kann den an beiden Enden gemeinsamen Kandidaten verlieren.',
      },
      cell_forcing_chain: {
        l1: 'Probiere den Kandidaten-Verfolgungsmodus — halte eine Ziffer auf dem Numpad gedrückt, um eine Kette aufzubauen.',
        l2: 'Jeder Kandidat einer Zelle führt über eine eigene Kette zur selben Schlussfolgerung.',
        l3: 'Verfolge von jedem Kandidaten einer Zelle eine unabhängige Kette — wenn alle Wege dieselbe Ziffer an derselben Stelle erzwingen, gilt diese Schlussfolgerung unabhängig vom wahren Kandidaten.',
      },
      region_forcing_chain: {
        l1: 'Probiere den Kandidaten-Verfolgungsmodus — halte eine Ziffer auf dem Numpad gedrückt, um eine Kette aufzubauen.',
        l2: 'Jede mögliche Position einer Ziffer in einer Einheit führt zur selben Schlussfolgerung.',
        l3: 'Starte von jeder Zelle, in der eine Ziffer in einer Einheit stehen kann, eine eigene Kette — wenn alle Wege dasselbe Ergebnis erzwingen, ist dieses Ergebnis gesichert.',
      },
      als_xz: {
        l1: 'Probiere den Kandidaten-Verfolgungsmodus — halte eine Ziffer auf dem Numpad gedrückt, um eine Kette aufzubauen.',
        l2: 'Zwei fast gesperrte Mengen teilen eine eingeschränkte gemeinsame Ziffer und sperren dadurch eine zweite gemeinsame Ziffer aus umliegenden Zellen aus.',
        l3: 'Finde zwei ALS, bei denen ein Kandidat X zwischen ihnen eingeschränkt ist — jeder andere Kandidat Z, der in beiden Gruppen vorkommt, kann aus Zellen gestrichen werden, die alle Z-Vorkommen beider Gruppen sehen.',
      },
      als_xy: {
        l1: 'Probiere den Kandidaten-Verfolgungsmodus — halte eine Ziffer auf dem Numpad gedrückt, um eine Kette aufzubauen.',
        l2: 'Zwei fast gesperrte Mengen sind durch zwei verschiedene eingeschränkte Ziffern verbunden.',
        l3: 'Finde zwei ALS, verbunden durch zwei Brückenziffern X und Y — die Brücke zwingt einen dritten Kandidaten Z, aus Zellen gestrichen zu werden, die alle Z-Instanzen in beiden Mengen sehen.',
      },
      als_w_wing: {
        l1: 'Probiere den Kandidaten-Verfolgungsmodus — halte eine Ziffer auf dem Numpad gedrückt, um eine Kette aufzubauen.',
        l2: 'Zwei fast gesperrte Mengen sind durch eine starke Verbindung überbrückt und schränken einen gemeinsamen Kandidaten ein.',
        l3: 'Zwei ALS, die beide Kandidat Z enthalten, verbunden durch eine starke Verbindung auf einer Brückenziffer — jede Zelle, die alle Z-Vorkommen beider ALS sieht, kann Z verlieren.',
      },
      als_chain: {
        l1: 'Probiere den Kandidaten-Verfolgungsmodus — halte eine Ziffer auf dem Numpad gedrückt, um eine Kette aufzubauen.',
        l2: 'Mehrere fast gesperrte Mengen bilden eine Kette, wobei benachbarte Paare je eine Brückenziffer teilen.',
        l3: 'Verbinde eine Folge von ALS, bei der jedes Paar einen eingeschränkten Brückenkandidaten teilt — die Kette zwingt einen Kandidaten Z an einem Ende dazu, Z aus Zellen zu streichen, die alle Z-Instanzen am anderen Ende sehen.',
      },
      forcing_chain_net: {
        l1: 'Probiere den Kandidaten-Verfolgungsmodus — halte eine Ziffer auf dem Numpad gedrückt, um eine Kette aufzubauen.',
        l2: 'Mehrere Ketten von verschiedenen Ausgangspunkten laufen alle auf dieselbe Schlussfolgerung hinaus.',
        l3: 'Starte Ketten von verschiedenen Annahmen — wenn jeder Pfad denselben Kandidaten irgendwo als wahr (oder falsch) erzwingt, gilt diese Schlussfolgerung bedingungslos.',
      },
      sue_de_coq: {
        l1: 'Probiere den Kandidaten-Verfolgungsmodus — halte eine Ziffer auf dem Numpad gedrückt, um eine Kette aufzubauen.',
        l2: 'Im Schnittbereich eines Blocks mit einer Zeile oder Spalte sind die Kandidaten vollständig durch zwei fast gesperrte Mengen abgedeckt.',
        l3: 'Finde den Schnittbereich eines Blocks mit einer Zeile oder Spalte, dessen Kandidaten sich genau in zwei ALS aufteilen — eines im Block, eines in der Linie außerhalb — sodass für weitere Kandidaten weder in der Linie noch im Block Platz bleibt.',
      },
      template: {
        l1: 'Probiere den Kandidaten-Verfolgungsmodus — halte eine Ziffer auf dem Numpad gedrückt, um eine Kette aufzubauen.',
        l2: 'Zähle alle möglichen Platzierungen einer Ziffer auf und suche nach Zellen, die in jeder Lösung vorkommen.',
        l3: 'Liste alle gültigen Wege auf, wie eine Ziffer das Gitter füllen kann — jede Zelle, die in allen Vorlagen diese Ziffer enthalten muss (oder nie enthalten kann), ist damit bestimmt.',
      },
      death_blossom: {
        l1: 'Probiere den Kandidaten-Verfolgungsmodus — halte eine Ziffer auf dem Numpad gedrückt, um eine Kette aufzubauen.',
        l2: 'Eine Stielzelle mit mehreren Kandidaten, von denen jeder eine eigene fast gesperrte Menge verbindet.',
        l3: 'Weise jedem Kandidaten der Stielzelle eine passende ALS zu, die diesen Kandidaten enthält — jede Zelle, die alle Instanzen einer gemeinsamen Ziffer über alle ALS hinweg sieht, kann diese Ziffer verlieren.',
      },
      exocet_death_blossom: {
        l1: 'Probiere den Kandidaten-Verfolgungsmodus — halte eine Ziffer auf dem Numpad gedrückt, um eine Kette aufzubauen.',
        l2: 'Ein Exocet-Basispaar projiziert sich in Zielzellen, und jedes Ziel erzeugt ein eigenes ALS-Netzwerk.',
        l3: 'Identifiziere eine Exocet-Basis und ihre Ziele — wenn jede Zielzelle mit einer Death-Blossom-Struktur verknüpft ist, eliminieren die kombinierten Einschränkungen Kandidaten aus Zellen, die alle resultierenden ALS-Ziffernvorkommen sehen.',
      },
    },
  },
} as const;
