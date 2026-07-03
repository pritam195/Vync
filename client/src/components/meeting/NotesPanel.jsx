import { useEffect, useMemo, useState } from 'react';
import { Download, NotebookPen, Plus, Trash2 } from 'lucide-react';

function noteStorageKey(meetingId) {
  return `vync-notes:${meetingId || 'room'}`;
}

function formatNoteTime(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function downloadNotes(notes, meetingId) {
  const content = notes
    .map((note) => `[${new Date(note.createdAt).toLocaleString()}] ${note.author}\n${note.text}`)
    .join('\n\n');
  const blob = new Blob([content || 'No notes captured yet.'], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const safeMeetingId = String(meetingId || 'vync-notes')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-');

  link.href = url;
  link.download = `${safeMeetingId}-notes.txt`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function NotesPanel({ currentUser, meetingId }) {
  const storageKey = useMemo(() => noteStorageKey(meetingId), [meetingId]);
  const [draft, setDraft] = useState('');
  const [notes, setNotes] = useState(() => {
    try {
      return JSON.parse(window.localStorage.getItem(storageKey) || '[]');
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      setNotes(JSON.parse(window.localStorage.getItem(storageKey) || '[]'));
    } catch {
      setNotes([]);
    }
  }, [storageKey]);

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(notes));
  }, [notes, storageKey]);

  const addNote = (event) => {
    event.preventDefault();
    const text = draft.trim();

    if (!text) {
      return;
    }

    setNotes((currentNotes) => [
      {
        id: crypto.randomUUID(),
        author: currentUser?.name || 'Guest',
        createdAt: new Date().toISOString(),
        text,
      },
      ...currentNotes,
    ]);
    setDraft('');
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <form className="collab-panel rounded-2xl p-3" onSubmit={addNote}>
        <textarea
          className="min-h-28 w-full resize-none rounded-xl border border-white/10 bg-black/30 p-3 text-sm leading-6 text-white outline-none transition-colors placeholder:text-white/35 focus:border-primary"
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Capture decisions, blockers, or follow-ups..."
          value={draft}
        />
        <div className="mt-3 flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-white/45">{notes.length} note{notes.length === 1 ? '' : 's'}</p>
          <div className="flex items-center gap-2">
            <button
              className="collab-icon-button"
              disabled={!notes.length}
              onClick={() => downloadNotes(notes, meetingId)}
              title="Download notes"
              type="button"
            >
              <Download className="h-4 w-4" />
            </button>
            <button
              className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg bg-primary px-3 text-sm font-bold text-primary-foreground shadow-glow transition hover:bg-primary/90 disabled:opacity-40"
              disabled={!draft.trim()}
              type="submit"
            >
              <Plus className="h-4 w-4" />
              Add
            </button>
          </div>
        </div>
      </form>

      <section className="meeting-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {notes.length ? (
          notes.map((note) => (
            <article className="collab-panel group rounded-2xl p-3" key={note.id}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold uppercase tracking-wider text-white/55">
                    {note.author}
                  </p>
                  <p className="text-[10px] font-semibold text-white/35">{formatNoteTime(note.createdAt)}</p>
                </div>
                <button
                  className="collab-icon-button opacity-0 group-hover:opacity-100"
                  onClick={() => setNotes((currentNotes) => currentNotes.filter((item) => item.id !== note.id))}
                  title="Delete note"
                  type="button"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <p className="whitespace-pre-wrap text-sm leading-6 text-white/84">{note.text}</p>
            </article>
          ))
        ) : (
          <div className="collab-panel grid h-52 place-items-center rounded-2xl p-6 text-center">
            <div>
              <NotebookPen className="mx-auto h-9 w-9 text-white/35" />
              <p className="mt-3 text-sm font-bold text-white">No notes yet</p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

export default NotesPanel;
