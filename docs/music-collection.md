# Music collection (2026-10-01)

Settings → 音樂收藏 offers 12 original tracks, favorites, a 15-second preview (including locked tracks), and separate choices for normal, World and Duo. Initial tracks: 九格微光 (64 BPM), 弈間回聲 (84 BPM), 先手之間 (88 BPM). World defaults to 弈間回聲.

| Track | BPM | Unlock |
| --- | ---: | --- |
| 星霧棋境 | 62 | World IQ 5 |
| 暗線交鋒 | 76 | 3 completed Duo matches |
| 局勢翻轉 | 92 | First Duo victory |
| 星盤相逢 | 82 | 5 completed Duo matches |
| 步步逼近 | 130 | 10 completed Duo matches |
| 符陣交鋒 | 140 | 20 completed Duo matches |
| 九格連擊 | 150 | 30 completed Duo matches |
| 破陣輪指 | 140 | 50 completed Duo matches |
| 疾風對弈 | 150 | 80 completed Duo matches |

PWA counts retained pre-isolation results plus new results, deduplicating imported match baselines, without rewriting history. iOS remains in its own realm and honors its imported match baseline. Preferences use an edition-scoped key and are included in the existing journey cloud backup; the newest timestamp wins, including favorite removals.

Sources are stored in sources/music. Run node scripts/build-music-loops.mjs with AURORA_ROOT pointing to the local Aurora Studio fork. Existing source scores are authoritative; AURORA_COMPOSITIONS_ROOT is needed only to initialize missing scores. Production renders the second steady-state period, keeps a 20ms boundary blend, and normalizes fixed gain to −21 LUFS. The latest plucked battle arrangement uses wider strings and supported bass/percussion; sparse sections retain narrower width. 双星逐光 is excluded from the playable catalog.

WebAudio trims MP3 padding and makes the loop wrap between adjacent decoded samples with a 20ms circular overlap. AudioBufferSourceNode owns repetition, independent of JS timers. Changing songs keeps the old song until the next one decodes, then crossfades for 450ms. Generation tokens and aborts prevent stopped or superseded requests from restarting. Preview ends on the audio clock at 15 seconds and restores the game selection. Backgrounding preserves the game position; volume ramps are separate from track fades.

PWA caches the three defaults during installation and other tracks on first fetch in a bounded persistent music cache. Cache filenames include content hashes. iOS bundles all twelve, so they are available offline immediately. Original old MP3 URLs remain for old clients.

Validation: retained-history and unlock-boundary tests; audio request cancellation/preview/fade tests; cloud restore/save; actual MP3 decoding and one-second OfflineAudioContext renders across every wrap in Chromium/WebKit; mobile settings screenshots; PWA offline default and previously fetched optional tracks before/after guarded update; existing gameplay regression suite. Audio continuity checks verify no added sample discontinuity or silent gap; subjective listening quality remains user-evaluated.
