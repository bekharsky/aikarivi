import { ChartNoAxesColumnIncreasing, Download, FolderOpen } from "lucide-react";
import { Button } from "./ui/Button.jsx";

export function AppHeader({ onImport, onExport }) {
  return (
    <header className="app-header">
      <a className="brand" href="../" aria-label="Aikarivi home">
        <ChartNoAxesColumnIncreasing className="brand-icon" aria-hidden="true" />
        <span>Aikarivi</span>
      </a>
      <div className="header-actions">
        <Button size="compact" onClick={onImport}><FolderOpen className="ui-icon ui-icon--small" aria-hidden="true" />Open</Button>
        <Button size="compact" variant="strong" onClick={onExport}><Download className="ui-icon ui-icon--small" aria-hidden="true" />Export .md</Button>
      </div>
    </header>
  );
}
