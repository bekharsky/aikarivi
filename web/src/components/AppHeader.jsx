import { Download, FolderOpen } from "lucide-react";
import { Button } from "./ui/Button.jsx";

export function AppHeader({ onImport, onExport }) {
  return (
    <header className="app-header">
      <a className="brand" href="../" aria-label="Aikarivi home">
        <svg className="brand-icon" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M7 7v18" strokeWidth="1.5" opacity=".4" />
          <path d="M14 7h14M14 16h10M14 25h12" />
          <g fill="currentColor" stroke="none">
            <circle cx="7" cy="7" r="2.5" />
            <circle cx="7" cy="16" r="2.5" />
            <circle cx="7" cy="25" r="2.5" />
          </g>
        </svg>
        <span>Aikarivi</span>
      </a>
      <div className="header-actions">
        <Button size="compact" onClick={onImport}><FolderOpen className="ui-icon ui-icon--small" aria-hidden="true" />Open</Button>
        <Button size="compact" variant="strong" onClick={onExport}><Download className="ui-icon ui-icon--small" aria-hidden="true" />Export .md</Button>
      </div>
    </header>
  );
}
