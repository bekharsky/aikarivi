import { FilePlus2, Files, Pencil } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { Button, IconButton } from "../../components/ui/Button.jsx";
import { MenuSelect } from "../../components/ui/MenuSelect.jsx";
import { localDateKey } from "../../core/time.js";

export function DocumentToolbar({ note, documents, onTitleChange, onTitleBlur, onSelect, onCreate }) {
  const titleMeasure = useRef(null);
  const [titleWidth, setTitleWidth] = useState(null);

  useLayoutEffect(() => {
    const width = titleMeasure.current?.getBoundingClientRect().width;
    if (width != null) setTitleWidth(Math.ceil(width + 2));
  }, [note.title]);

  const dateLabel = (document) => {
    const date = new Date(`${document.dateKey || localDateKey()}T12:00:00`);
    const shortDate = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
    return document.titleAuto ? document.title : `${document.title || "Untitled"} · ${shortDate}`;
  };
  const options = documents.map((document) => ({ value: document.id, label: dateLabel(document) }));

  return (
    <section className="note-heading" aria-label="Document controls">
      <div className="document-title" style={titleWidth == null ? undefined : { "--document-title-input-width": `${titleWidth}px` }}>
        <label className="visually-hidden" htmlFor="task-title">Document title</label>
        <input
          id="task-title"
          className="note-title"
          type="text"
          maxLength={120}
          placeholder="Name this note"
          autoComplete="off"
          value={note.title}
          onChange={(event) => onTitleChange(event.target.value)}
          onBlur={onTitleBlur}
        />
        <span ref={titleMeasure} className="note-title-measure" aria-hidden="true">{note.title || "Name this note"}</span>
        <IconButton icon={Pencil} label="Edit document title" className="edit-title-button" onClick={() => {
          const input = document.getElementById("task-title");
          input.focus();
          input.select();
        }} />
      </div>
      <div className="ui-control-group document-actions" role="group" aria-label="Saved documents">
        <MenuSelect
          label="Choose a document"
          triggerLabel="Documents"
          value={note.id}
          options={options}
          onValueChange={onSelect}
          icon={Files}
          className="note-picker"
        />
        <Button className="new-note-button" aria-label="New document" title="Start a new document" onClick={onCreate}>
          <FilePlus2 aria-hidden="true" className="ui-icon ui-icon--small" />
          <span className="new-note-label">New document</span>
        </Button>
      </div>
    </section>
  );
}
