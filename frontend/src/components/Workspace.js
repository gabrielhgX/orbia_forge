import { ArrowDownToLine, FileText, GitMerge } from "lucide-react";
import React, { useState } from "react";
import WorkspaceCard from "./WorkspaceCard";

/**
 * Workspace — the main PDF canvas area.
 *
 * Props
 *  files                  workspace files array
 *  draggedFile            file being dragged in from sidebar
 *  onDrop                 sidebar card dropped onto canvas
 *  onRemove               close a panel
 *  onDragStartFromWorkspace  header drag start
 *  onDragEndFromWorkspace    drag end / cancel
 *  onPageClick            (file, pageIdx) open ExpandedPageView
 *  selectedFileId         file_id of selected panel (or null)
 *  onSelectPanel          (fileId) select a panel
 *  onDownload             download the selected file
 *  pageCropMode           null | { fileId, markedPages: Set }
 *  onTogglePageMark       (pageIdx) toggle deletion mark
 *  onConfirmCrop          confirm deletion
 *  onCancelCrop           exit crop mode
 */
export default function Workspace({
  files,
  draggedFile,
  onDrop,
  onRemove,
  onDragStartFromWorkspace,
  onDragEndFromWorkspace,
  onPageClick,
  selectedFileId,
  onSelectPanel,
  onDownload,
  pageCropMode,
  onTogglePageMark,
  onConfirmCrop,
  onCancelCrop,
}) {
  const [dragOver, setDragOver] = useState(false);

  const isEmpty = files.length === 0;
  const selectedFile = files.find((f) => f.file_id === selectedFileId) ?? null;

  // ── Drop zone ─────────────────────────────────────────────────────────────
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
    const source = e.dataTransfer.getData("drag-source");
    if (draggedFile && source !== "workspace") onDrop(draggedFile);
  };

  // Clicking the canvas background deselects panels
  const handleCanvasClick = () => {
    if (selectedFileId) onSelectPanel(null);
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">

      {/* ── Toolbar ── */}
      <header className="bg-white border-b border-apple-border px-8 py-3.5
        flex items-center justify-between flex-shrink-0">
        <div>
          <h2 className="text-sm font-semibold text-apple-text">Workspace</h2>
          <p className="text-[11px] text-apple-secondary mt-0.5">
            {isEmpty
              ? "Drag files from the library to open them as panels"
              : `${files.length} panel${files.length !== 1 ? "s" : ""} open`}
          </p>
        </div>

        {/* Download action — visible only when a panel is selected */}
        {selectedFile && (
          <button
            onClick={onDownload}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg
              bg-apple-blue hover:bg-blue-600 text-white text-[12px] font-semibold
              transition-colors duration-150 shadow-sm active:scale-95"
            title={`Download "${selectedFile.filename}"`}
          >
            <ArrowDownToLine size={13} />
            Download
            <span className="text-blue-200 font-normal truncate max-w-[140px]">
              {selectedFile.filename}
            </span>
          </button>
        )}

        {!selectedFile && !isEmpty && (
          <p className="text-[11px] text-apple-secondary">
            Click any page to enlarge · Tools panel →
          </p>
        )}
      </header>

      {/* ── Canvas ── */}
      <div
        className={`flex-1 relative overflow-hidden transition-colors duration-200
          ${dragOver ? "bg-blue-50" : "bg-apple-gray"}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleCanvasClick}
      >
        {/* Drag-over overlay */}
        {dragOver && (
          <div className="absolute inset-4 border-2 border-dashed border-apple-blue rounded-3xl
            flex flex-col items-center justify-center pointer-events-none z-10
            bg-blue-50/80 backdrop-blur-sm">
            <div className="w-14 h-14 bg-apple-blue rounded-3xl flex items-center justify-center
              shadow-mac-lg mb-3">
              <GitMerge size={26} className="text-white" />
            </div>
            <p className="text-apple-blue font-semibold text-sm">Drop to open in workspace</p>
          </div>
        )}

        {/* Empty state */}
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
              Drag files from the sidebar to open them as panels.
              Use the <span className="font-medium text-violet-500">Tools panel</span> on the
              right to split or merge.
            </p>
          </div>
        )}

        {/* ── Horizontal panel row ─────────────────────────────────────────────
            Panels are full-height, side-by-side, horizontally scrollable. */}
        {!isEmpty && (
          <div
            className="absolute inset-0 overflow-x-auto overflow-y-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex gap-4 p-5 h-full items-stretch min-w-max">
              {files.map((file) => {
                const fileCropMode =
                  pageCropMode?.fileId === file.file_id ? pageCropMode : null;
                return (
                  <WorkspaceCard
                    key={file.file_id}
                    file={file}
                    onRemove={onRemove}
                    onDragStart={onDragStartFromWorkspace}
                    onDragEnd={onDragEndFromWorkspace}
                    onPageClick={(pageIdx) => {
                      onSelectPanel(file.file_id);
                      onPageClick(file, pageIdx);
                    }}
                    isSelected={selectedFileId === file.file_id}
                    onSelect={() => onSelectPanel(file.file_id)}
                    cropMode={fileCropMode}
                    onTogglePageMark={onTogglePageMark}
                    onConfirmCrop={onConfirmCrop}
                    onCancelCrop={onCancelCrop}
                  />
                );
              })}
              {/* Trailing spacer */}
              <div className="w-4 flex-shrink-0" />
            </div>
          </div>
        )}

        {/* Floating hint bar */}
        {!isEmpty && !selectedFileId && (
          <div className="absolute bottom-3 left-0 right-0 flex justify-center pointer-events-none z-10">
            <div className="flex items-center gap-1.5 text-[11px] text-apple-secondary
              bg-white/80 backdrop-blur-sm px-3 py-1.5 rounded-full shadow-sm border border-apple-border/40">
              Click a panel to select it · Click a page to enlarge · Tools panel →
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
