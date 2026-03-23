import { FileText, GitMerge, Info, Scissors } from "lucide-react";
import React, { useState } from "react";
import WorkspaceCard from "./WorkspaceCard";

/**
 * Workspace — main canvas area displaying open PDF panels.
 *
 * Layout: a horizontally-scrolling row of WorkspaceCard panels. Each panel
 * fills the available height and has its own vertical scroll for pages. When
 * many panels are open the row overflows and a horizontal scrollbar appears.
 *
 * Drop interactions:
 *  - Sidebar → Workspace: dropping a sidebar card opens a new panel
 *    (identified by dataTransfer "drag-source: sidebar")
 *  - Workspace → Sidebar: dragging a panel header back to the sidebar closes
 *    the panel; the card remains in the library list
 */
export default function Workspace({
  files,
  draggedFile,
  onDrop,
  onRemove,
  onSplit,
  onMerge,
  onDragStartFromWorkspace,
  onDragEndFromWorkspace,
}) {
  const [dragOver, setDragOver] = useState(false);

  // ── Drop zone handlers (sidebar file → workspace) ────────────────────────
  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    if (!dragOver) setDragOver(true);
  };

  const handleDragLeave = (e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    // Only handle drops that originated from the sidebar, not workspace-panel drags
    const source = e.dataTransfer.getData("drag-source");
    if (draggedFile && source !== "workspace") onDrop(draggedFile);
  };

  const canSplit = files.length >= 1;
  const canMerge = files.length >= 2;
  const isEmpty = files.length === 0;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">

      {/* ── Toolbar ── */}
      <header className="bg-white border-b border-apple-border px-8 py-3.5 flex items-center justify-between flex-shrink-0">
        <div>
          <h2 className="text-sm font-semibold text-apple-text">Workspace</h2>
          <p className="text-[11px] text-apple-secondary mt-0.5">
            {isEmpty
              ? "Drag files from the sidebar to open them as panels"
              : `${files.length} panel${files.length !== 1 ? "s" : ""} open — select an action below`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => canSplit && files.length === 1 && onSplit(files[0])}
            disabled={!canSplit || files.length !== 1}
            title={files.length > 1 ? "Select exactly 1 file to split" : "Split PDF"}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-medium
              transition-all duration-200
              ${canSplit && files.length === 1
                ? "bg-orange-500 text-white hover:bg-orange-600 shadow-sm hover:shadow active:scale-95"
                : "bg-gray-100 text-apple-secondary cursor-not-allowed"
              }`}
          >
            <Scissors size={14} />
            Split
          </button>

          <button
            onClick={() => canMerge && onMerge()}
            disabled={!canMerge}
            title={!canMerge ? "Add at least 2 files to merge" : "Merge PDFs"}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-medium
              transition-all duration-200
              ${canMerge
                ? "bg-apple-blue text-white hover:bg-blue-600 shadow-sm hover:shadow active:scale-95"
                : "bg-gray-100 text-apple-secondary cursor-not-allowed"
              }`}
          >
            <GitMerge size={14} />
            Merge
          </button>
        </div>
      </header>

      {/* ── Drop zone / panel canvas ── */}
      <div
        className={`flex-1 relative overflow-hidden transition-colors duration-200
          ${dragOver ? "bg-blue-50" : "bg-apple-gray"}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Drag-over overlay — shown while dragging a sidebar card over the workspace */}
        {dragOver && (
          <div className="absolute inset-4 border-2 border-dashed border-apple-blue rounded-3xl
            flex flex-col items-center justify-center pointer-events-none z-10 bg-blue-50/80 backdrop-blur-sm">
            <div className="w-14 h-14 bg-apple-blue rounded-3xl flex items-center justify-center shadow-mac-lg mb-3">
              <GitMerge size={26} className="text-white" />
            </div>
            <p className="text-apple-blue font-semibold text-sm">Drop to open in workspace</p>
          </div>
        )}

        {/* Empty state illustration */}
        {isEmpty && !dragOver && (
          <div className="h-full flex flex-col items-center justify-center pb-16 px-8 select-none">
            <div className="relative mb-6">
              <div className="absolute -bottom-2 -right-3 w-14 h-16 bg-red-100 rounded-2xl rotate-6" />
              <div className="absolute -bottom-1 -right-1.5 w-14 h-16 bg-red-200 rounded-2xl rotate-3" />
              <div className="relative w-14 h-16 bg-white rounded-2xl shadow-mac flex items-center justify-center">
                <FileText size={24} className="text-red-300" />
              </div>
            </div>
            <h3 className="text-base font-semibold text-apple-text mb-1">Workspace is empty</h3>
            <p className="text-sm text-apple-secondary text-center max-w-xs leading-relaxed">
              Drag files from the sidebar to open them as panels, then use{" "}
              <span className="font-medium text-orange-500">Split</span> or{" "}
              <span className="font-medium text-apple-blue">Merge</span> to process them.
            </p>
          </div>
        )}

        {/* ── Horizontal panel row ──────────────────────────────────────────── */}
        {/* Each panel fills the full height; overflow-x allows side-by-side viewing */}
        {!isEmpty && (
          <div className="absolute inset-0 overflow-x-auto overflow-y-hidden">
            <div className="flex gap-4 p-5 h-full items-stretch min-w-max">
              {files.map((file) => (
                <WorkspaceCard
                  key={file.file_id}
                  file={file}
                  onRemove={onRemove}
                  onSplit={onSplit}
                  onDragStart={onDragStartFromWorkspace}
                  onDragEnd={onDragEndFromWorkspace}
                />
              ))}
              {/* Trailing spacer so the last panel has breathing room */}
              <div className="w-4 flex-shrink-0" />
            </div>
          </div>
        )}

        {/* Contextual hint bar — floats at the bottom when panels are open */}
        {!isEmpty && (
          <div className="absolute bottom-3 left-0 right-0 flex justify-center pointer-events-none z-10">
            <div className="flex items-center gap-1.5 text-[11px] text-apple-secondary
              bg-white/80 backdrop-blur-sm px-3 py-1.5 rounded-full shadow-sm border border-apple-border/40">
              <Info size={11} />
              {files.length === 1 &&
                "Click a page to select it. Drag the panel header to the sidebar to close."}
              {files.length > 1 &&
                `${files.length} panels open — use Merge to combine, or drag a header to the sidebar to close.`}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
