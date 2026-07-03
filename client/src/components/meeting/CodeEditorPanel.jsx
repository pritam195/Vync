import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';
import { useEffect, useRef, useState } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';

self.MonacoEnvironment = {
  getWorker(_, label) {
    if (label === 'json') {
      return new jsonWorker();
    }

    if (label === 'css' || label === 'scss' || label === 'less') {
      return new cssWorker();
    }

    if (label === 'html' || label === 'handlebars' || label === 'razor') {
      return new htmlWorker();
    }

    if (label === 'typescript' || label === 'javascript') {
      return new tsWorker();
    }

    return new editorWorker();
  },
};

const languages = [
  ['javascript', 'JavaScript'],
  ['typescript', 'TypeScript'],
  ['python', 'Python'],
  ['java', 'Java'],
  ['csharp', 'C#'],
  ['cpp', 'C++'],
  ['go', 'Go'],
  ['html', 'HTML'],
  ['css', 'CSS'],
  ['json', 'JSON'],
  ['markdown', 'Markdown'],
];

const themes = [
  ['vs-dark', 'Dark'],
  ['vs', 'Light'],
  ['hc-black', 'High contrast'],
];

const fileExtensions = {
  javascript: 'js',
  typescript: 'ts',
  python: 'py',
  java: 'java',
  csharp: 'cs',
  cpp: 'cpp',
  go: 'go',
  html: 'html',
  css: 'css',
  json: 'json',
  markdown: 'md',
};

function downloadTextFile(content, fileName) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function CodeEditorPanel({
  codeEditorState,
  localSocketId,
  meetingId,
  onCodeChange,
  onCursorPosition,
  onLanguageChange,
}) {
  const containerRef = useRef(null);
  const editorRef = useRef(null);
  const ignoreNextChangeRef = useRef(false);
  const cursorTimerRef = useRef(null);
  const initialCodeRef = useRef(codeEditorState.code);
  const languageRef = useRef(codeEditorState.language);
  const themeRef = useRef('vs-dark');
  const [theme, setTheme] = useState('vs-dark');
  const [isToolbarOpen, setIsToolbarOpen] = useState(true);
  const activeUser = codeEditorState.activeUser;
  const isReady = codeEditorState.isReady;
  const remoteCursorCount = Object.values(codeEditorState.cursors || {}).filter(
    (cursor) => cursor.participant?.socketId !== localSocketId,
  ).length;

  useEffect(() => {
    if (!isReady || !containerRef.current || editorRef.current) {
      return undefined;
    }

    initialCodeRef.current = codeEditorState.code;
    languageRef.current = codeEditorState.language;

    const editor = monaco.editor.create(containerRef.current, {
      automaticLayout: true,
      fontFamily: 'JetBrains Mono, Consolas, "Courier New", monospace',
      fontSize: 14,
      lineHeight: 22,
      language: languageRef.current,
      minimap: { enabled: false },
      padding: { top: 16, bottom: 16 },
      scrollBeyondLastLine: false,
      tabSize: 2,
      theme: themeRef.current,
      value: initialCodeRef.current,
    });

    editorRef.current = editor;

    const contentSubscription = editor.onDidChangeModelContent(() => {
      if (ignoreNextChangeRef.current) {
        ignoreNextChangeRef.current = false;
        return;
      }

      if (!isReady) {
        return;
      }

      onCodeChange({
        code: editor.getValue(),
        language: languageRef.current,
      });
    });

    const cursorSubscription = editor.onDidChangeCursorPosition((event) => {
      window.clearTimeout(cursorTimerRef.current);
      cursorTimerRef.current = window.setTimeout(() => {
        onCursorPosition(event.position);
      }, 80);
    });

    return () => {
      window.clearTimeout(cursorTimerRef.current);
      contentSubscription.dispose();
      cursorSubscription.dispose();
      editor.dispose();
      editorRef.current = null;
    };
  }, [codeEditorState.code, codeEditorState.language, isReady, onCodeChange, onCursorPosition]);

  useEffect(() => {
    const editor = editorRef.current;

    if (!editor || editor.getValue() === codeEditorState.code) {
      return;
    }

    ignoreNextChangeRef.current = true;
    editor.setValue(codeEditorState.code);
  }, [codeEditorState.code]);

  useEffect(() => {
    languageRef.current = codeEditorState.language;
    const model = editorRef.current?.getModel();

    if (model) {
      monaco.editor.setModelLanguage(model, codeEditorState.language);
    }
  }, [codeEditorState.language]);

  useEffect(() => {
    themeRef.current = theme;
    monaco.editor.setTheme(theme);
  }, [theme]);

  const handleLanguageChange = (event) => {
    if (!isReady) {
      return;
    }

    onLanguageChange(event.target.value);
  };

  const handleSaveCode = () => {
    const language = languageRef.current || codeEditorState.language || 'javascript';
    const extension = fileExtensions[language] || 'txt';
    const safeMeetingId = String(meetingId || 'vync-code')
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-');
    const code = editorRef.current?.getValue() ?? codeEditorState.code ?? '';

    downloadTextFile(code, `${safeMeetingId}.${extension}`);
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col gap-3">
      <button
        className="collab-toolbar absolute right-3 top-3 z-30 flex h-10 w-10 items-center justify-center rounded-full text-white/80 transition hover:bg-white/10 hover:text-white"
        onClick={() => setIsToolbarOpen((value) => !value)}
        title="Editor controls"
        type="button"
      >
        <SlidersHorizontal className="h-4 w-4" />
      </button>

      {isToolbarOpen ? (
      <div className="collab-toolbar absolute left-0 right-0 top-0 z-20 m-2 grid gap-2 rounded-2xl p-4 pr-16">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-bold uppercase tracking-wider text-white/70">
            Language
            <select
              className="collab-field mt-1.5 w-full cursor-pointer"
              onChange={handleLanguageChange}
              value={codeEditorState.language}
            >
              {languages.map(([value, label]) => (
                <option className="bg-surface text-foreground dark:bg-slate-900 dark:text-white" key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs font-bold uppercase tracking-wider text-white/70">
            Theme
            <select
              className="collab-field mt-1.5 w-full cursor-pointer"
              onChange={(event) => setTheme(event.target.value)}
              value={theme}
            >
              {themes.map(([value, label]) => (
                <option className="bg-surface text-foreground dark:bg-slate-900 dark:text-white" key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3 text-sm">
          <p className="font-medium text-white/60">
            Editing: <span className="font-bold text-white">{activeUser?.name || 'No one yet'}</span>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <p className="rounded-lg bg-primary/20 px-2.5 py-1 text-xs font-bold text-primary">
              {remoteCursorCount} remote cursor{remoteCursorCount === 1 ? '' : 's'}
            </p>
            <button
              className="min-h-8 rounded-lg border border-white/10 px-3 text-xs font-bold text-white/70 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30"
              disabled={!isReady}
              onClick={handleSaveCode}
              type="button"
            >
              Save file
            </button>
            <button
              className="collab-icon-button h-8 w-8 border border-white/10"
              onClick={() => setIsToolbarOpen(false)}
              title="Close controls"
              type="button"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
      ) : null}

      <div className="min-h-[24rem] flex-1 overflow-hidden rounded-2xl border border-white/10 bg-[#151821] shadow-2xl ring-1 ring-black/20">
        {isReady ? (
          <div className="h-full min-h-[24rem]" ref={containerRef} />
        ) : (
          <div className="grid h-full min-h-[24rem] place-items-center p-6 text-center text-white">
            <div className="animate-pulse">
              <p className="text-sm font-bold uppercase tracking-wider text-primary">
                Loading editor
              </p>
              <p className="mt-2 text-xs font-medium text-white/60">Syncing the current room code.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default CodeEditorPanel;
