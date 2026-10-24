import { useEffect, useRef, useState, type ChangeEvent, type MouseEvent } from 'react';
import { t } from '../../i18n/t';
import { formatSeconds } from '../../game/utils';
import { useFocusTrap } from '../hooks/useFocusTrap';
import {
  conflictCells,
  loadRecoverySession,
  saveRecoverySession,
  solveRecoveryBoard,
  type RecoveryCell,
  type RecoverySession,
} from '../../features/recovery/recoveryBoard';
import { detectGrid, readScreenshot, recognizeGrid, type GridCrop } from '../../features/recovery/screenshotReader';
import './recovery.css';

type Phase = 'upload' | 'crop' | 'check' | 'play';

export function RecoveryScreen({ onClose }: { onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>('upload');
  const [saved] = useState(loadRecoverySession);
  const [session, setSession] = useState<RecoverySession | null>(null);
  const [cells, setCells] = useState<RecoveryCell[]>([]);
  const [image, setImage] = useState<HTMLCanvasElement | null>(null);
  const [preview, setPreview] = useState('');
  const [crop, setCrop] = useState<GridCrop | null>(null);
  const [corner, setCorner] = useState<{ x: number; y: number } | null>(null);
  const [selected, setSelected] = useState(0);
  const [uncertain, setUncertain] = useState<number[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [wrong, setWrong] = useState<number[]>([]);
  const [notes, setNotes] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const alive = useRef(true);
  const trap = useFocusTrap(true);

  useEffect(() => {
    trap.current?.scrollTo({ top: 0 });
  }, [phase, trap]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    // Capturing prevents the underlying game and result dialogs from handling these keys.
    const stop = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', stop, true);
    return () => document.removeEventListener('keydown', stop, true);
  }, [onClose]);

  const board = phase === 'play' && session ? session.cells : cells;
  const complete = phase === 'play' && !!session && session.cells.every((c, i) => c.value === session.solution[i]);
  const conflicts = conflictCells(board.map((c) => c.value));

  useEffect(() => {
    if (phase !== 'play' || complete) return;
    const started = performance.now();
    const baseline = session?.seconds ?? 0;
    const timer = window.setInterval(() => {
      setSession((current) =>
        current ? { ...current, seconds: baseline + Math.floor((performance.now() - started) / 1000) } : null,
      );
    }, 1000);
    return () => window.clearInterval(timer);
    // The baseline belongs to this play phase, not each input or elapsed-time update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, complete]);

  useEffect(() => {
    if (phase === 'play' && session) setSaveFailed(!saveRecoverySession(session));
  }, [phase, session]);

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const screenshot = await readScreenshot(file);
      if (!alive.current) return;
      setImage(screenshot);
      setPreview(screenshot.toDataURL('image/png'));
      setCrop(detectGrid(screenshot));
      setCorner(null);
      setPhase('crop');
    } catch {
      if (alive.current) setError(t('recovery.fileError'));
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  const chooseCorner = (event: MouseEvent<HTMLButtonElement>) => {
    if (!image || busy) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * image.width;
    const y = ((event.clientY - bounds.top) / bounds.height) * image.height;
    if (!corner) {
      setCorner({ x, y });
      setCrop(null);
    } else {
      const size = Math.min(x - corner.x, y - corner.y);
      if (size > 90) {
        setCrop({ ...corner, size });
        setCorner(null);
        setError('');
      } else setError(t('recovery.cropMissing'));
    }
  };

  const recognize = async () => {
    if (!image || !crop || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await recognizeGrid(image, crop);
      if (!alive.current) return;
      setCells(result.cells);
      setUncertain(result.uncertain);
      setWrong([]);
      setConfirmed(false);
      setSelected(result.uncertain[0] ?? 0);
      setPhase('check');
    } catch {
      if (alive.current) setError(t('recovery.fileError'));
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  const input = (value: number) => {
    const cell = board[selected];
    if (!cell || (phase === 'play' && (cell.fixed || complete))) return;
    const next = board.map((c, i) => {
      if (i !== selected) return c;
      if (phase === 'play' && notes && value) {
        if (c.value) return c;
        return {
          ...c,
          notes: c.notes.includes(value) ? c.notes.filter((n) => n !== value) : [...c.notes, value].sort(),
        };
      }
      return { ...c, value, fixed: value ? c.fixed : false, notes: [] };
    });
    if (phase === 'play') setSession((current) => (current ? { ...current, cells: next } : null));
    else {
      setCells(next);
      setConfirmed(false);
      setWrong([]);
      setError('');
      setUncertain((current) => current.filter((i) => i !== selected));
    }
  };

  const start = () => {
    if (!confirmed || conflicts.size) return;
    const result = solveRecoveryBoard(cells.map((c) => (c.fixed ? c.value : 0)));
    if (result.status !== 'unique') {
      setError(t(`recovery.${result.status}`));
      return;
    }
    const mistakes = cells.flatMap((c, i) => (c.value && c.value !== result.solution[i] ? [i] : []));
    if (mistakes.length) {
      setWrong(mistakes);
      setError(t('recovery.progressWrong'));
      return;
    }
    setSession({
      version: 1,
      cells: cells.map((c) => ({ ...c, notes: [...c.notes] })),
      solution: result.solution,
      seconds: 0,
    });
    setError('');
    setSelected(
      Math.max(
        0,
        cells.findIndex((c) => !c.fixed && !c.value),
      ),
    );
    setPhase('play');
  };

  return (
    <div
      className="recovery-overlay"
      id="recovery-screen"
      role="dialog"
      aria-modal="true"
      aria-labelledby="recovery-title"
      ref={trap}
      onKeyDown={(event) => {
        if (event.key === 'Tab') return;
        event.stopPropagation();
        if (event.target instanceof HTMLInputElement) return;
        if (phase !== 'check' && phase !== 'play') return;
        if (/^[1-9]$/.test(event.key)) {
          event.preventDefault();
          input(Number(event.key));
        }
        if (['Backspace', 'Delete', '0'].includes(event.key)) {
          event.preventDefault();
          input(0);
        }
        const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -9, ArrowDown: 9 };
        if (event.key in offsets) {
          event.preventDefault();
          setSelected((i) => Math.max(0, Math.min(80, i + offsets[event.key])));
        }
      }}
    >
      <section className="recovery-panel">
        <header className="recovery-header">
          <h2 id="recovery-title">{t(phase === 'play' ? 'recovery.playing' : 'recovery.title')}</h2>
          <button onClick={onClose}>{t('recovery.close')}</button>
        </header>
        {phase === 'upload' ? (
          <>
            <p>{t('recovery.intro')}</p>
            <label className="recovery-upload">
              {busy ? t('recovery.busy') : t('recovery.upload')}
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={upload} disabled={busy} />
            </label>
            {saved ? (
              <button
                className="resume-btn"
                onClick={() => {
                  setSession(saved);
                  setPhase('play');
                }}
              >
                {t('recovery.resume')}
              </button>
            ) : null}
          </>
        ) : null}

        {phase === 'crop' && image ? (
          <>
            <h3>{t('recovery.crop')}</h3>
            <p>{t('recovery.cropHelp')}</p>
            <p role="status">{t(corner ? 'recovery.cropFirst' : crop ? 'recovery.crop' : 'recovery.cropMissing')}</p>
            <button className="recovery-image" onClick={chooseCorner} aria-label={t('recovery.cropHelp')}>
              <img src={preview} alt={t('recovery.screenshot')} />
              {crop ? (
                <span
                  className="recovery-crop"
                  style={{
                    left: `${(crop.x / image.width) * 100}%`,
                    top: `${(crop.y / image.height) * 100}%`,
                    width: `${(crop.size / image.width) * 100}%`,
                    height: `${(crop.size / image.height) * 100}%`,
                  }}
                />
              ) : null}
              {corner ? (
                <span
                  className="recovery-corner"
                  style={{ left: `${(corner.x / image.width) * 100}%`, top: `${(corner.y / image.height) * 100}%` }}
                />
              ) : null}
            </button>
            <button className="resume-btn" onClick={recognize} disabled={!crop || busy}>
              {t(busy ? 'recovery.busy' : 'recovery.recognize')}
            </button>
            <button
              onClick={() => {
                setPhase('upload');
                setError('');
              }}
            >
              {t('recovery.upload')}
            </button>
          </>
        ) : null}

        {phase === 'check' || phase === 'play' ? (
          <>
            {phase === 'check' ? (
              <>
                <h3>{t('recovery.check')}</h3>
                <p>{t('recovery.checkHelp')}</p>
                <details>
                  <summary>{t('recovery.screenshot')}</summary>
                  <img className="recovery-reference" src={preview} alt={t('recovery.screenshot')} />
                </details>
                {uncertain.length ? <p>{t('recovery.uncertain', { count: uncertain.length })}</p> : null}
              </>
            ) : (
              <p className="recovery-status" role="status">
                {complete
                  ? t('recovery.complete')
                  : `${formatSeconds(session?.seconds ?? 0)} · ${t('recovery.progress', { filled: board.filter((c) => !c.fixed && c.value !== 0).length, total: board.filter((c) => !c.fixed).length })}`}
              </p>
            )}
            <div className="sudoku-grid recovery-grid" role="group" aria-label={t('recovery.playing')}>
              {board.map((cell, i) => (
                <button
                  key={i}
                  type="button"
                  data-cell={i}
                  aria-label={`${t('recovery.cell', { row: Math.floor(i / 9) + 1, col: (i % 9) + 1 })}: ${cell.value || '—'}`}
                  aria-pressed={selected === i}
                  onClick={() => setSelected(i)}
                  className={`cell${cell.fixed ? ' is-fixed' : ' user-val'}${selected === i ? ' selected' : ''}${uncertain.includes(i) && phase === 'check' ? ' recovery-uncertain' : ''}${conflicts.has(i) || wrong.includes(i) || (phase === 'play' && cell.value && cell.value !== session?.solution[i]) ? ' recovery-wrong' : ''}`}
                >
                  {cell.value ||
                    (cell.notes.length ? (
                      <span className="recovery-notes">
                        {Array.from({ length: 9 }, (_, n) => (
                          <span key={n}>{cell.notes.includes(n + 1) ? n + 1 : ''}</span>
                        ))}
                      </span>
                    ) : (
                      ''
                    ))}
                </button>
              ))}
            </div>
            {phase === 'check' ? (
              <label className="recovery-checkbox">
                <input
                  type="checkbox"
                  checked={board[selected]?.fixed ?? false}
                  disabled={!board[selected]?.value}
                  onChange={(event) => {
                    setCells((current) =>
                      current.map((c, i) => (i === selected ? { ...c, fixed: event.target.checked } : c)),
                    );
                    setConfirmed(false);
                    setWrong([]);
                    setError('');
                  }}
                />
                {t('recovery.clue')}
              </label>
            ) : null}
            <div className="recovery-numpad">
              {Array.from({ length: 9 }, (_, n) => (
                <button
                  key={n}
                  onClick={() => input(n + 1)}
                  disabled={complete || (phase === 'play' && board[selected]?.fixed)}
                >
                  {n + 1}
                </button>
              ))}
            </div>
            <div className="recovery-tools">
              <button onClick={() => input(0)} disabled={complete || (phase === 'play' && board[selected]?.fixed)}>
                {t('recovery.erase')}
              </button>
              {phase === 'play' ? (
                <button aria-pressed={notes} onClick={() => setNotes((value) => !value)} disabled={complete}>
                  {t('recovery.notes')}
                </button>
              ) : null}
            </div>
            {phase === 'check' ? (
              <>
                {conflicts.size ? <p role="alert">{t('recovery.conflicts')}</p> : null}
                <label className="recovery-checkbox">
                  <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
                  {t('recovery.confirm')}
                </label>
                <button className="resume-btn" onClick={start} disabled={!confirmed || conflicts.size > 0}>
                  {t('recovery.start')}
                </button>
                <button
                  onClick={() => {
                    setPhase('crop');
                    setError('');
                  }}
                >
                  {t('recovery.crop')}
                </button>
              </>
            ) : (
              <p role="status">{t(saveFailed ? 'recovery.saveFailed' : 'recovery.saved')}</p>
            )}
          </>
        ) : null}
        {error ? <p role="alert">{error}</p> : null}
        <p className="recovery-local">{t('recovery.local')}</p>
      </section>
    </div>
  );
}
