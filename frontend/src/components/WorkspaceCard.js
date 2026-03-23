import { FileText, GripVertical, X } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { BACKEND_BASE_URL } from "../api";

/**
 * PageThumbnail — one page cell inside a WorkspaceCard panel.
 *
 * In normal mode: clicking opens ExpandedPageView.
 * In crop mode:   clicking toggles the page's deletion mark (red overlay).
 */
function PageThumbnail({
  fileId,
  pageIdx,
  totalPages,
  onPageClick,
  isCropMode,
  isMarked,
  onToggleMark,
}) {
  const [thumbErr, setThumbErr] = useState(false);

  const thumbnailUrl =
    `${BACKEND_BASE_URL}/api/files/${fileId}/thumbnail?page=${pageIdx}&width=280`;

  const handleClick = () => {
    if (isCropMode) onToggleMark(pageIdx);
    else onPageClick(pageIdx);
  };

  return (
    <div
      onClick={handleClick}
      style={{ animationDelay: `${Math.min(pageIdx * 40, 380)}ms` }}
      className={`relative overflow-hidden rounded-lg border-2
        animate-pageReveal transition-all duration-150
        ${isCropMode
          ? isMarked
            ? "border-red-500 cursor-pointer"
            : "border-transparent hover:border-red-300 cursor-pointer"
          : "border-transparent hover:border-apple-blue/50 cursor-pointer hover:shadow-[0_3px_14px_rgba(0,113,227,0.18)]"
        }`}
      title={
        isCropMode
          ? isMarked ? "Click to unmark" : "Click to mark for deletion"
          : `Page ${pageIdx + 1} — click to view`
      }
    >
      {/* Page image or fallback */}
      <div className="bg-gray-100 flex items-center justify-center min-h-[130px]">
        {thumbErr ? (
          <div className="flex flex-col items-center gap-2 py-8 text-apple-secondary">
            <FileText size={24} className="text-apple-border" />
            <span className="text-[11px]">Page {pageIdx + 1}</span>
          </div>
        ) : (
          <img
            src={thumbnailUrl}
            alt={`Page ${pageIdx + 1} of ${totalPages}`}
            className="w-full block"
            onError={() => setThumbErr(true)}
            loading="lazy"
            draggable={false}
          />
        )}
      </div>

      {/* Red deletion overlay when marked */}
      {isCropMode && isMarked && (
        <div className="absolute inset-0 bg-red-500/40 flex items-center justify-center pointer-events-none">
          <div className="w-8 h-8 bg-red-600 rounded-full flex items-center justify-center shadow-md">
            <X size={16} className="text-white" />
          </div>
        </div>
      )}

      {/* Page number badge — bottom-right overlay */}
      <div className="absolute bottom-2 right-2 bg-black/50 text-white text-[10px]
        font-medium px-1.5 py-0.5 rounded backdrop-blur-sm pointer-events-none">
        {pageIdx + 1} / {totalPages}
      </div>
    </div>
  );
}

/**
 * WorkspaceCard — resizable, draggable PDF mini-window in the workspace.
 *
 * Props
 *  file             full file object
 *  onRemove         close this panel
 *  onDragStart      header drag start (workspace → sidebar)
 *  onDragEnd        drag end / cancel
 *  onPageClick      (pageIdx) → open ExpandedPageView
 *  isSelected       show blue selection ring
 *  onSelect         called when the card is clicked (to select it)
 *  cropMode         null | { markedPages: Set<number> }
 *  onTogglePageMark (pageIdx) toggle deletion mark in crop mode
 *  onConfirmCrop    confirm deletion and trigger download
 *  onCancelCrop     exit crop mode without changes
 */
export default function WorkspaceCard({
  file,
  onRemove,
  onDragStart,
  onDragEnd,
  onPageClick,
  isSelected,
  onSelect,
  cropMode,
  onTogglePageMark,
  onConfirmCrop,
  onCancelCrop,
}) {
  const [localName,   setLocalName]   = useState(file.filename);
  const [editingName, setEditingName] = useState(false);

  const [panelWidth,  setPanelWidth]  = useState(300);
  const [isResizing,  setIsResizing]  = useState(false);

  const resizeStartX  = useRef(0);
  const resizeStartW  = useRef(0);
  const nameInputRef  = useRef(null);

  useEffect(() => {
    if (editingName && nameInputRef.current) nameInputRef.current.select();
  }, [editingName]);

  const commitName = () => {
    setEditingName(false);
    if (!localName.trim()) setLocalName(file.filename);
  };

  const pages = Array.from({ length: file.page_count }, (_, i) => i);

  // ── Right-edge resize ──────────────────────────────────────────────────────
  const startResize = (e) => {
    e.preventDefault();
    setIsResizing(true);
    resizeStartX.current = e.clientX;
    resizeStartW.current = panelWidth;

    const onMouseMove = (mv) => {
      const delta = mv.clientX - resizeStartX.current;
      setPanelWidth(Math.max(240, Math.min(640, resizeStartW.current + delta)));
    };
    const onMouseUp = () => {
      setIsResizing(false);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup",   onMouseUp);
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup",   onMouseUp);
  };

  // ── Header drag — move panel back to sidebar ───────────────────────────────
  const handleDragStart = (e) => {
    const ghost = document.createElement("div");
    ghost.className = "drag-ghost";
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 0, 0);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (document.body.contains(ghost)) document.body.removeChild(ghost);
      });
    });

    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("drag-source", "workspace");
    onDragStart(file);
  };

  const handleDragEnd = () => onDragEnd && onDragEnd();

  const markedCount = cropMode?.markedPages?.size ?? 0;

  return (
    <div
      style={{ width: panelWidth }}
      onClick={onSelect}
      className={`
        relative flex-shrink-0 flex flex-col bg-white overflow-hidden
        animate-panelEntry rounded-lg cursor-default
        transition-all duration-200
        ${isSelected
          ? "border-2 border-apple-blue shadow-[0_0_0_3px_rgba(0,113,227,0.18)] shadow-mac-lg"
          : "border border-apple-border/50 shadow-mac hover:shadow-mac-lg"
        }
        ${isResizing ? "select-none" : ""}
        ${cropMode ? "ring-2 ring-red-400 ring-offset-0" : ""}
      `}
    >
      {/* ── Panel header ────────────────────────────────────────────────────── */}
      <div
        draggable
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onClick={(e) => e.stopPropagation()}
        className="flex items-center gap-2 px-3 py-2.5 bg-white border-b border-apple-border/60
          cursor-grab active:cursor-grabbing flex-shrink-0 select-none"
        title="Drag back to sidebar to close"
      >
        <GripVertical size={14} className="text-apple-border flex-shrink-0" />
        <FileText     size={13} className="text-red-500 flex-shrink-0" />

        {editingName ? (
          <input
            ref={nameInputRef}
            value={localName}
            onChange={(e) => setLocalName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === "Enter")  commitName();
              if (e.key === "Escape") { setLocalName(file.filename); setEditingName(false); }
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 text-[13px] font-semibold text-apple-text
              bg-blue-50 border border-apple-blue rounded px-1.5 py-0 outline-none min-w-0"
            placeholder="File name…"
          />
        ) : (
          <p
            className="text-[13px] font-semibold text-apple-text truncate flex-1 leading-tight cursor-text"
            title={`${localName} — double-click to rename`}
            onDoubleClick={(e) => { e.stopPropagation(); setEditingName(true); }}
          >
            {localName}
          </p>
        )}

        <span className="text-[11px] text-apple-secondary flex-shrink-0 mr-1">
          {file.page_count}p
        </span>

        <button
          onClick={(e) => { e.stopPropagation(); onRemove(file.file_id); }}
          className="w-5 h-5 rounded-full bg-red-500 hover:bg-red-600
            flex items-center justify-center flex-shrink-0 transition-colors duration-150"
          title="Close panel"
        >
          <X size={9} className="text-white" />
        </button>
      </div>

      {/* ── Crop mode banner ─────────────────────────────────────────────────
          Shown at the top of the page list when crop mode is active. */}
      {cropMode && (
        <div className="flex-shrink-0 px-3 py-1.5 bg-red-50 border-b border-red-200 flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          <p className="text-[11px] text-red-700 font-medium flex-1">
            {markedCount === 0
              ? "Click pages to mark for deletion"
              : `${markedCount} page${markedCount !== 1 ? "s" : ""} marked`}
          </p>
        </div>
      )}

      {/* ── Scrollable page list ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto bg-apple-gray p-3 space-y-3 min-h-0">
        {pages.map((pageIdx) => (
          <PageThumbnail
            key={pageIdx}
            fileId={file.file_id}
            pageIdx={pageIdx}
            totalPages={file.page_count}
            onPageClick={onPageClick}
            isCropMode={!!cropMode}
            isMarked={cropMode?.markedPages.has(pageIdx) ?? false}
            onToggleMark={onTogglePageMark}
          />
        ))}
      </div>

      {/* ── Crop mode confirm/cancel bar ─────────────────────────────────────── */}
      {cropMode && (
        <div className="flex-shrink-0 flex gap-2 p-2 bg-red-50 border-t border-red-200">
          <button
            onClick={(e) => { e.stopPropagation(); onCancelCrop(); }}
            className="flex-1 text-[12px] font-medium py-1.5 rounded
              bg-gray-200 hover:bg-gray-300 text-gray-700 transition-colors duration-150"
          >
            Cancel
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); if (markedCount > 0) onConfirmCrop(); }}
            disabled={markedCount === 0}
            className={`flex-1 text-[12px] font-medium py-1.5 rounded text-white
              transition-colors duration-150
              ${markedCount > 0
                ? "bg-red-500 hover:bg-red-600 cursor-pointer"
                : "bg-gray-300 cursor-not-allowed"
              }`}
          >
            Delete {markedCount > 0 ? markedCount : ""} page{markedCount !== 1 ? "s" : ""}
          </button>
        </div>
      )}

      {/* ── Right-edge resize handle ─────────────────────────────────────────── */}
      <div
        onMouseDown={(e) => { e.stopPropagation(); startResize(e); }}
        className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize
          hover:bg-apple-blue/20 active:bg-apple-blue/30 transition-colors duration-150"
        title="Drag to resize"
      />
    </div>
  );
}
