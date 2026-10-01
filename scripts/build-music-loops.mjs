import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const root = process.cwd(),
  studio = process.env.AURORA_ROOT || '/Users/wulala/Downloads/Helper/aurora-studio',
  compositions = process.env.AURORA_COMPOSITIONS_ROOT || '/Users/wulala/Downloads/Helper/outputs';
const { renderToFile, analyzeAudio } = await import(pathToFileURL(path.join(studio, 'tools/music/render.mjs')));
const { compileProject } = await import(pathToFileURL(path.join(studio, 'src/music/project.js')));
const { decodeWav, writeWav } = await import(pathToFileURL(path.join(studio, 'tools/wav.mjs')));
const definitions = [
  ['nine-lights', '九格微光', 'sudokuzen-bgm-20261001-v1', 'normal'],
  ['between-moves', '弈間回聲', 'sudokuzen-bgm-20261001-v2', 'duo'],
  ['star-mist', '星霧棋境', 'sudokuzen-bgm-20261001-v2', 'world'],
  ['first-moves', '先手之間', 'sudokuzen-duo-collection-20261001-v1', 'between-first-moves'],
  ['hidden-lines', '暗線交鋒', 'sudokuzen-duo-collection-20261001-v1', 'hidden-lines'],
  ['turning-board', '局勢翻轉', 'sudokuzen-duo-collection-20261001-v1', 'turning-the-board'],
  ['star-meeting', '星盤相逢', 'sudokuzen-duo-collection-20261001-v1', 'stars-across-the-board'],
  ['step-pressure', '步步逼近', 'sudokuzen-duo-fast-20261001-v1', '130'],
  ['sigil-duel', '符陣交鋒', 'sudokuzen-duo-fast-20261001-v1', '140'],
  ['nine-combo', '九格連擊', 'sudokuzen-duo-fast-20261001-v1', '150'],
  ['pipa-battle', '破陣輪指', 'sudokuzen-plucked-battle-20261001-v3', 'pipa'],
  ['shamisen-battle', '疾風對弈', 'sudokuzen-plucked-battle-20261001-v3', 'shamisen'],
];
const out = path.join(root, 'output/music-release-20261001/audio');
fs.mkdirSync(out, { recursive: true });
fs.mkdirSync(path.join(root, 'sources/music'), { recursive: true });
fs.mkdirSync(path.join(root, 'public/sounds/bgm'), { recursive: true });
fs.mkdirSync(path.join(root, 'src/music'), { recursive: true });
const ff = (args) => {
  const r = spawnSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
};
const selected = process.argv.slice(2),
  results = [];
for (const [id, title, folder, sourceId] of definitions) {
  if (selected.length && !selected.includes(id)) continue;
  const saved = path.join(root, 'sources/music', id + '.json');
  let project;
  if (fs.existsSync(saved)) project = JSON.parse(fs.readFileSync(saved));
  else {
    project = JSON.parse(fs.readFileSync(path.join(compositions, folder, sourceId + '.music.json')));
    project.id = id + '-production-loop';
    project.title = title + '（循環版）';
    project.loop = true;
    project.sections = project.sections.slice(1, -1);
    fs.writeFileSync(saved, JSON.stringify(project, null, 2));
  }
  const summary = compileProject(project).summary,
    period = summary.seconds,
    dir = path.join(out, id);
  fs.mkdirSync(dir, { recursive: true });
  const report = await renderToFile(project, {
    outputDir: dir,
    format: 'wav',
    seconds: period * 2 + 0.05,
    tailSeconds: 0,
    fadeOutSeconds: 0,
    gainDb: 0,
  });
  if (report.nonfinite || report.parts.some((p) => p.peakDb < -60))
    throw new Error(id + ': inaudible or invalid render');
  const raw = decodeWav(fs.readFileSync(path.join(dir, 'mix.wav'))),
    frames = Math.round(period * raw.sampleRate),
    start = frames,
    blend = Math.round(0.02 * raw.sampleRate);
  const channels = raw.channels.map((c) => {
    const result = c.slice(start, start + frames);
    if (result.length !== frames) throw new Error('Insufficient steady-state capture');
    // Blend the end toward the actual samples preceding the chosen start. This
    // retains the musical bar length and makes the PCM wrap an adjacent sample pair.
    for (let i = 0; i < blend; i++) {
      const w = (1 - Math.cos((Math.PI * i) / (blend - 1))) * 0.5;
      const n = frames - blend + i;
      result[n] = result[n] * (1 - w) + c[start - blend + i] * w;
    }
    return result;
  });
  const pcm = path.join(dir, 'loop.wav');
  writeWav(pcm, channels, raw.sampleRate, { bitDepth: 24, dither: false });
  let input = pcm;
  if (folder.endsWith('plucked-battle-20261001-v3')) {
    const ambush = summary.sections.find((s) => s.zh === '埋伏留白')?.seconds,
      build = summary.sections.find((s) => s.zh === '層層蓄力')?.seconds;
    const factor = ambush === undefined ? '1.45' : `(1.45-.25*clip(t-${ambush},0,1)+.25*clip(t-${build},0,1))`;
    const mid = '((val(0)+val(1))*.5)',
      side = '((val(0)-val(1))*.5)';
    input = path.join(dir, 'loop-wide.wav');
    ff([
      '-i',
      pcm,
      '-af',
      `aeval=exprs='${mid}+${factor}*${side}|${mid}-${factor}*${side}':c=stereo`,
      '-c:a',
      'pcm_s24le',
      input,
    ]);
  }
  const sourceAnalysis = await analyzeAudio(input),
    target = -21;
  let gain = Math.min(target - sourceAnalysis.integratedLUFS, -2 - sourceAnalysis.truePeakDb),
    analysis;
  const mp3 = path.join(dir, 'loop.mp3');
  for (let attempt = 0; attempt < 3; attempt++) {
    ff([
      '-i',
      input,
      '-af',
      `volume=${gain}dB`,
      '-ar',
      '48000',
      '-c:a',
      'libmp3lame',
      '-b:a',
      '192k',
      '-metadata',
      `title=${title}`,
      mp3,
    ]);
    analysis = await analyzeAudio(mp3);
    if (Math.abs(analysis.integratedLUFS - target) <= 0.3) break;
    gain = Math.min(gain + target - analysis.integratedLUFS, -1.8 - sourceAnalysis.truePeakDb);
  }
  if (analysis.truePeakDb > -1 || analysis.decodedFrames !== frames)
    throw new Error(id + ': final loop verification failed');
  const bytes = fs.readFileSync(mp3),
    hash = createHash('sha256').update(bytes).digest('hex'),
    file = `sounds/bgm/${id}-${hash.slice(0, 12)}.mp3`;
  fs.writeFileSync(path.join(root, 'public', file), bytes);
  const item = {
    id,
    title,
    bpm: project.bpm,
    file,
    duration: frames / 48000,
    frames,
    bytes: bytes.length,
    hash,
    loopOverlap: 0.02,
  };
  fs.writeFileSync(
    path.join(dir, 'loop-report.json'),
    JSON.stringify(
      {
        track: item,
        sourceAnalysis,
        analysis,
        gainDb: gain,
        capture: 'second continuous cycle; 20ms boundary blend',
        score: summary,
      },
      null,
      2,
    ),
  );
  results.push(item);
  console.log(JSON.stringify(item));
}
const previousFile = path.join(root, 'src/music/tracks.generated.json'),
  previous = fs.existsSync(previousFile) ? JSON.parse(fs.readFileSync(previousFile)) : [];
const merged = definitions
  .map(([id]) => results.find((t) => t.id === id) || previous.find((t) => t.id === id))
  .filter(Boolean);
fs.writeFileSync(previousFile, JSON.stringify(merged, null, 2));
fs.writeFileSync(
  path.join(root, 'public/music-manifest.json'),
  JSON.stringify({ version: 1, defaults: ['nine-lights', 'between-moves', 'first-moves'], tracks: merged }, null, 2),
);
