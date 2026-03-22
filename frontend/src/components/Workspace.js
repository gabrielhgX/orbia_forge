import { FileText, GitMerge, Info, Scissors } from "lucide-react";
import React, { useState } from "react";
import WorkspaceCard from "./WorkspaceCard";

export default function Workspace({ files, draggedFile, onDrop, onRemove, onSplit, onMerge }) {
  const [dragOver, setDragOver] = useState(false);

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
    if (draggedFile) onDrop(draggedFile);
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
              ? "Drag files from the sidebar"
              : `${files.length} file${files.length !== 1 ? "s" : ""} — select an action below`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => canSplit && files.length === 1 && onSplit(files[0])}
            disabled={!canSplit || files.length !== 1}
            title={files.length > 1 ? "Select exactly 1 file to split" : "Split PDF"}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-medium
              transition-all duration-200
              ${
                canSplit && files.length === 1
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
              ${
                canMerge
                  ? "bg-apple-blue text-white hover:bg-blue-600 shadow-sm hover:shadow active:scale-95"
                  : "bg-gray-100 text-apple-secondary cursor-not-allowed"
              }`}
          >
            <GitMerge size={14} />
            Merge
          </button>
        </div>
      </header>

      {/* ── Drop zone / canvas ── */}
      <div
        className={`flex-1 relative overflow-y-auto transition-colors duration-200
          ${dragOver ? "bg-blue-50" : "bg-apple-gray"}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Drag overlay */}
        {dragOver && (
          <div className="absolute inset-4 border-2 border-dashed border-apple-blue rounded-3xl
            flex flex-col items-center justify-center pointer-events-none z-10 bg-blue-50/80 backdrop-blur-sm">
            <div className="w-14 h-14 bg-apple-blue rounded-3xl flex items-center justify-center shadow-mac-lg mb-3">
              <GitMerge size={26} className="text-white" />
            </div>
            <p className="text-apple-blue font-semibold text-sm">Drop to add to workspace</p>
          </div>
        )}

        {/* Empty state */}
        {isEmpty && !dragOver && (
          <div className="h-full flex flex-col items-center justify-center pb-16 px-8 select-none">
            <div className="relative mb-6">
              {/* Stacked pages decoration */}
              <div className="absolute -bottom-2 -right-3 w-14 h-16 bg-red-100 rounded-2xl rotate-6" />
              <div className="absolute -bottom-1 -right-1.5 w-14 h-16 bg-red-200 rounded-2xl rotate-3" />
              <div className="relative w-14 h-16 bg-white rounded-2xl shadow-mac flex items-center justify-center">
                <FileText size={24} className="text-red-300" />
              </div>
            </div>
            <h3 className="text-base font-semibold text-apple-text mb-1">Workspace is empty</h3>
            <p className="text-sm text-apple-secondary text-center max-w-xs leading-relaxed">
              Drag files from the sidebar into this area, then use{" "}
              <span className="font-medium text-orange-500">Split</span> or{" "}
              <span className="font-medium text-apple-blue">Merge</span>
            </p>
          </div>
        )}

        {/* File grid */}
        {!isEmpty && (
          <div className="p-8">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
              {files.map((file) => (
                <WorkspaceCard
                  key={file.file_id}
                  file={file}
                  onRemove={onRemove}
                  onSplit={onSplit}
                />
              ))}
            </div>

            {/* Contextual hint */}
            <div className="mt-6 flex items-center gap-1.5 text-[11px] text-apple-secondary">
              <Info size={11} />
              {files.length === 1 && "Click Split (or use the button above) to extract pages."}
              {files.length > 1 &&
                `${files.length} files ready — click Merge to combine, or select one to split.`}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
