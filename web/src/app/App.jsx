import { useCallback, useRef, useState } from "react";
import { AppHeader } from "../components/AppHeader.jsx";
import { DocumentToolbar } from "../features/documents/DocumentToolbar.jsx";
import { useDocuments } from "../core/useDocuments.js";
import { markdownFileName, exportMarkdown } from "../core/markdown.js";
import { useTimer } from "../timer/useTimer.js";
import { TimerToolbar } from "../features/timer/TimerToolbar.jsx";
import { TimedNoteEditor } from "../editor/TimedNoteEditor.jsx";

export default function App() {
  const documents = useDocuments();
  const timer = useTimer(documents.note, documents.updateNote);
  const fileInput = useRef(null);
  const [fileError, setFileError] = useState("");

  const pauseTimer = useCallback(() => {
    if (timer.isRunning) timer.toggle();
  }, [timer.isRunning, timer.toggle]);

  const selectDocument = useCallback((id) => {
    if (id === documents.note.id) return;
    pauseTimer();
    documents.selectDocument(id);
  }, [documents.note.id, documents.selectDocument, pauseTimer]);

  const createDocument = useCallback(() => {
    pauseTimer();
    documents.createDocument();
  }, [documents.createDocument, pauseTimer]);

  const handleImport = useCallback(async (event) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    try {
      pauseTimer();
      documents.importDocument(await file.text(), file.name.replace(/\.(md|markdown|txt)$/i, ""));
      setFileError("");
    } catch {
      setFileError("Could not open that file");
    }
  }, [documents.importDocument, pauseTimer]);

  const handleExport = useCallback(() => {
    const content = exportMarkdown(documents.note, timer.remaining);
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${markdownFileName(documents.note)}.md`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [documents.note, timer.remaining]);

  return (
    <>
      <AppHeader onImport={() => fileInput.current?.click()} onExport={handleExport} />
      <main className="workspace">
        <h1 className="visually-hidden">Aikarivi — focused writing</h1>
        <DocumentToolbar
          note={documents.note}
          documents={documents.documents}
          onTitleChange={(title) => documents.updateActive({ title, titleAuto: false })}
          onTitleBlur={documents.titleOnBlur}
          onSelect={selectDocument}
          onCreate={createDocument}
        />
        <TimerToolbar timer={timer} />
        <TimedNoteEditor
          note={documents.note}
          stamp={timer.stamp}
          saveState={documents.storageAvailable ? documents.saveState : "Storage unavailable"}
          onLinesChange={(lines) => documents.updateActive({ lines })}
        />
        {fileError && <p className="file-error" role="alert">{fileError}</p>}
      </main>
      <input
        ref={fileInput}
        className="visually-hidden"
        type="file"
        accept=".md,.markdown,.txt,text/plain,text/markdown"
        aria-label="Open a Markdown file"
        onChange={handleImport}
      />
    </>
  );
}
