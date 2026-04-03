import { createPortal } from 'react-dom';
import { useEffect, type ReactElement } from 'react';
import { useWildLobbyStore } from './wildLobbyStore';
import { t } from '../../i18n/t';

export function WildMentorNoteModal(): ReactElement | null {
  const note = useWildLobbyStore((s) => s.mentorNote);
  const close = useWildLobbyStore((s) => s.closeMentorNote);

  useEffect(() => {
    if (!note) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [note, close]);

  if (!note) return null;
  return createPortal(
    <div id="beast-note-popup" className="beast-note-popup" onClick={() => close()} role="dialog" aria-modal="true">
      <div className="beast-note-title">{note.title}</div>
      <div className="beast-note-body">{note.body}</div>
      <div className="beast-note-attr">{t('wildLobby.mentorAttr')}</div>
    </div>,
    document.body,
  );
}
