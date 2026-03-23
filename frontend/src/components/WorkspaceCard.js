import { Check, FileText, GripVertical, Scissors, X } from "lucide-react";
import React, { useRef, useState } from "react";
import { BACKEND_BASE_URL } from "../api";

/**
 * PageThumbnail — a single page inside a WorkspaceCard panel.
 *
 * Lazy-loads the page image from the backend thumbnail endpoint.
 * Clicking toggles a blue "selected" highlight (useful for choosing a page
 * range before splitting). The reveal animation is staggered via animationDelay
 * so pages appear to slide down sequentially — giving the impression of a
 * document unfolding as the panel opens.
 */
function PageThumbnail({ fileId, pageIdx, totalPages }) {
  const [selected, setSelected] = useState(false);
  const [thumbError, setThumbError] = useState(false);

  const thumbnailUrl =
    `${BACKEND_BASE_URL}/api/files/${fileId}/thumbnail?page=${pageIdx}&width=280`;

  return (
    <div
      onClick={() => setSelected((s) => !s)}
      // Cap the stagger at 400 ms so long documents don't delay the last pages too much
      style={{ animationDelay: `${Math.min(pageIdx * 40, 400)}ms` }}
      className={`
        relative rounded-xl overflow-hidden cursor-pointer
        border-2 animate-pageReveal transition-all duration-200
        ${selected
          ? "border-apple-blue shadow-[0_0_0_3px_rgba(0,113,227,0.15)]"
          : "border-transparent hover:border-apple-border/80"
        }
      `}
    >
      {/* Page render or fallback placeholder */}
      <div className="bg-gray-100 flex items-center justify-center min-h-[140px]">
        {thumbError ? (
          <div className="flex flex-col items-center gap-2 py-8 text-apple-secondary">
            <FileText size={28} className="text-apple-border" />
            <span className="text-[11px]">Page {pageIdx + 1}</span>
          </div>
        ) : (
          <img
            src={thumbnailUrl}
            alt={`Page ${pageIdx + 1} of ${totalPages}`}
            className="w-full block"
            onError={() => setThumbError(true)}
            loading="lazy"   /* browser defers off-screen pages */
            draggable={false}
          />
        )}
      </div>

      {/* Page number badge (bottom-right overlay) */}
      <div className="absolute bottom-2 right-2 bg-black/50 text-white text-[10px] font-medium
        px-1.5 py-0.5 rounded-md backdrop-blur-sm pointer-events-none">
        {pageIdx + 1} / {totalPages}
      </div>

      {/* Selection checkmark (top-left, appears when selected) */}
      {selected && (
        <div className="absolute top-2 left-2 w-5 h-5 bg-apple-blue rounded-full
          flex items-center justify-center shadow-sm pointer-events-none">
          <Check size={11} className="text-white" />
        </div>
      )}
    </div>
  );
}

/**
 * WorkspaceCard — a resizable, draggable PDF panel in the workspace.
 *
 * Features:
 *  - Animated entry: panel slides down from above when first dropped (panelEntry)
 *  - Scrollable page list: each page is a lazy-loaded thumbnail that reveals
 *    sequentially (pageReveal with staggered delay), creating a "document
 *    opening" visual impression
 *  - Resizable: drag the right edge to set a custom panel width (240–560 px)
 *  - Drag-back: grab the panel header and drop it on the sidebar to close the
 *    panel and restore the file to the library view
 *  - Split shortcut: footer button opens the split modal for this file
 */
export default function WorkspaceCard({ file, onRemove, onSplit, onDragStart, onDragEnd }) {
  // Panel width, adjusted by dragging the resize handle
  const [panelWidth, setPanelWidth] = useState(300);
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartX = useRef(0);
  const resizeStartW = useRef(0);

  // One entry per PDF page for rendering thumbnails
  const pages = Array.from({ length: file.page_count }, (_, i) => i);

  // ── Right-edge resize handle ──────────────────────────────────────────────
  const startResize = (e) => {
    e.preventDefault();
    setIsResizing(true);
    resizeStartX.current = e.clientX;
    resizeStartW.current = panelWidth;

    const onMouseMove = (moveEvt) => {
      const delta = moveEvt.clientX - resizeStartX.current;
      // Clamp between 240 px (comfortable thumbnail width) and 560 px
      setPanelWidth(Math.max(240, Math.min(560, resizeStartW.current + delta)));
    };

    const onMouseUp = () => {
      setIsResizing(false);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  // ── Drag panel header back to the sidebar ────────────────────────────────
  const handleDragStart = (e) => {
    // Invisible ghost so no browser thumbnail appears during drag
    const ghost = document.createElement("div");
    ghost.className = "drag-ghost";
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 0, 0);
    setTimeout(() => document.body.removeChild(ghost), 0);

    e.dataTransfer.effectAllowed = "move";
    // Mark as coming from the workspace so the workspace drop handler
    // ignores it (prevents accidentally re-adding the file)
    e.dataTransfer.setData("drag-source", "workspace");
    onDragStart(file);
  };

  const handleDragEnd = () => {
    // Notify parent to clear the workspace-dragged-file state if the drag
    // was cancelled without completing a drop on the sidebar
    onDragEnd && onDragEnd();
  };

  return (
    <div
      style={{ width: panelWidth }}
      className={`
        relative flex-shrink-0 flex flex-col bg-white rounded-2xl overflow-hidden
        border border-apple-border/50 animate-panelEntry
        transition-shadow duration-200
        ${isResizing ? "shadow-mac-lg select-none" : "shadow-mac hover:shadow-mac-lg"}
      `}
    >
      {/* ── Panel header — acts as the drag handle to move back to sidebar ── */}
      <div
        draggable
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        className="flex items-center gap-2 px-3 py-2.5 bg-white border-b border-apple-border/60
          cursor-grab active:cursor-grabbing flex-shrink-0 select-none"
        title="Drag back to sidebar to close this panel"
      >
        <GripVertical size={14} className="text-apple-border flex-shrink-0" />
        <FileText size={13} className="text-red-400 flex-shrink-0" />

        <p
          className="text-[13px] font-semibold text-apple-text truncate flex-1 leading-tight"
          title={file.filename}
        >
          {file.filename}
        </p>

        <span className="text-[11px] text-apple-secondary flex-shrink-0 mr-1">
          {file.page_count}p
        </span>

        {/* Close / remove button */}
        <button
          onClick={() => onRemove(file.file_id)}
          className="w-5 h-5 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center
            flex-shrink-0 transition-colors duration-150"
          title="Remove from workspace"
        >
          <X size={9} className="text-white" />
        </button>
      </div>

      {/* ── Scrollable page thumbnail list ───────────────────────────────── */}
      {/* Pages reveal with a staggered slide-down animation (pageReveal) */}
      <div className="flex-1 overflow-y-auto bg-apple-gray p-3 space-y-3 min-h-0">
        {pages.map((pageIdx) => (
          <PageThumbnail
            key={pageIdx}
            fileId={file.file_id}
            pageIdx={pageIdx}
            totalPages={file.page_count}
          />
        ))}
      </div>

      {/* ── Split shortcut footer ─────────────────────────────────────────── */}
      <div className="px-3 py-2 border-t border-apple-border/60 bg-white flex-shrink-0">
        <button
          onClick={() => onSplit(file)}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 text-[12px] font-medium
            text-orange-500 hover:bg-orange-50 rounded-xl transition-colors duration-150"
        >
          <Scissors size={12} />
          Split this file
        </button>
      </div>

      {/* ── Right-edge resize handle ──────────────────────────────────────── */}
      {/* A 6 px invisible strip the user can drag to adjust panel width */}
      <div
        onMouseDown={startResize}
        className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize
          hover:bg-apple-blue/20 active:bg-apple-blue/30 transition-colors duration-150"
        title="Drag to resize"
      />
    </div>
  );
}
