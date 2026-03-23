import { FileText, GripVertical, X } from "lucide-react";
import React, { useState } from "react";
import { BACKEND_BASE_URL } from "../api";

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * FileItem — near-square thumbnail card in the 2-column sidebar library grid.
 *
 * Design decisions (per spec):
 *  - Solid red background for the thumbnail area (future: vary by file type).
 *  - Thumbnail uses object-cover so a portion of the page fills the area
 *    cleanly with no blank borders — the red bg shows only on load/error.
 *  - Custom drag ghost: a mini card (thumbnail + filename) that follows the
 *    cursor instead of the browser's default semi-transparent snapshot.
 *  - Mouse-tracking tooltip: rendered as a fixed-position div that appears
 *    instantly and follows the cursor (no browser delay unlike `title`).
 *  - Reduced border-radius (rounded-xl ≈ 12 px) for a more document-like feel.
 */
export default function FileItem({ file, onDelete, onDragStart }) {
  const [hovered,  setHovered]  = useState(false);
  const [dragging, setDragging] = useState(false);
  const [thumbErr, setThumbErr] = useState(false);

  // Tooltip state: tracks cursor position for the instant follow-cursor tooltip
  const [tip, setTip] = useState({ visible: false, x: 0, y: 0 });

  const thumbnailUrl =
    `${BACKEND_BASE_URL}/api/files/${file.file_id}/thumbnail?page=0&width=220`;

  // ── Mouse tracking for follow-cursor tooltip ─────────────────────────────
  const handleMouseMove = (e) => {
    // Offset 14 px from cursor so the tooltip doesn't hide the card edge
    setTip({ visible: true, x: e.clientX + 14, y: e.clientY + 14 });
  };

  const handleMouseLeave = () => {
    setHovered(false);
    setTip({ visible: false, x: 0, y: 0 });
  };

  // ── Custom drag ghost ────────────────────────────────────────────────────
  // Creates a mini card element (thumbnail + filename label) and passes it to
  // setDragImage so the cursor carries a recognisable preview of the file.
  const handleDragStart = (e) => {
    // Build the ghost card in DOM so the browser can snapshot it
    const ghost = document.createElement("div");
    ghost.style.cssText = [
      "position:absolute",
      "top:-9999px",
      "left:-9999px",
      "width:110px",
      "height:120px",
      "border-radius:8px",
      "overflow:hidden",
      "background:#dc2626",                           // solid red — matches card
      "box-shadow:0 10px 32px rgba(0,0,0,0.45)",
      "pointer-events:none",
    ].join(";");

    // Thumbnail fills the top ~65 % of the ghost card
    const img = document.createElement("img");
    img.src = thumbnailUrl;
    img.style.cssText = "width:100%;height:68%;object-fit:cover;display:block;";

    // Filename label in the lower strip
    const label = document.createElement("div");
    label.style.cssText = [
      "background:white",
      "padding:5px 7px",
      "font-size:10px",
      "font-weight:600",
      "color:#1d1d1f",
      "white-space:nowrap",
      "overflow:hidden",
      "text-overflow:ellipsis",
      "height:32%",
      "display:flex",
      "align-items:center",
    ].join(";");
    label.textContent = file.filename;

    ghost.appendChild(img);
    ghost.appendChild(label);
    document.body.appendChild(ghost);

    // Centre ghost on cursor (55 px = half of 110 px width, 40 px ≈ upper third)
    e.dataTransfer.setDragImage(ghost, 55, 40);

    // Two rAF frames to ensure the browser has painted the ghost before removal
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (document.body.contains(ghost)) document.body.removeChild(ghost);
      });
    });

    e.dataTransfer.effectAllowed = "copy";
    e.dataTransfer.setData("drag-source", "sidebar");

    // Hide tooltip immediately when drag begins
    setTip({ visible: false, x: 0, y: 0 });
    setDragging(true);
    onDragStart(file);
  };

  const handleDragEnd = () => setDragging(false);

  return (
    <>
      {/* ── Follow-cursor tooltip ───────────────────────────────────────────
          Rendered as a fixed element so it escapes any overflow:hidden parent.
          Appears instantly (no browser title delay). */}
      {tip.visible && (
        <div
          className="fixed z-[9999] bg-gray-900/95 text-white text-[11px] font-medium
            px-2 py-1 rounded-md pointer-events-none shadow-lg leading-tight
            max-w-[200px] break-all"
          style={{ left: tip.x, top: tip.y }}
        >
          {file.filename}
        </div>
      )}

      <div
        draggable
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onMouseEnter={() => setHovered(true)}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className={`
          relative bg-white rounded-xl border border-apple-border/40 overflow-hidden
          cursor-grab active:cursor-grabbing select-none
          transition-all duration-200
          ${dragging
            ? "opacity-40 scale-95 shadow-none"
            : "shadow-mac hover:shadow-mac-lg hover:-translate-y-0.5"
          }
        `}
      >
        {/* ── Solid-red thumbnail area ────────────────────────────────────────
            Background is solid red (no gradient). The PDF thumbnail overlays it
            with object-cover, showing a portion of the page without blank borders.
            On error, the red bg remains visible with a fallback icon. */}
        <div className="relative h-[88px] bg-red-600 overflow-hidden">
          {!thumbErr ? (
            <img
              src={thumbnailUrl}
              alt={`Preview of ${file.filename}`}
              // object-cover: fills the container, may crop edges — shows page content
              className="w-full h-full object-cover"
              onError={() => setThumbErr(true)}
              draggable={false}
            />
          ) : (
            // Fallback: centred icon on the solid red background
            <div className="flex items-center justify-center h-full">
              <FileText size={26} className="text-white/70" />
            </div>
          )}

          {/* PDF type badge — bottom-left corner */}
          <span className="absolute bottom-2 left-2 z-10 px-1.5 py-0.5
            rounded text-[9px] font-bold tracking-wide
            bg-black/30 backdrop-blur-sm text-white">
            PDF
          </span>

          {/* Drag-handle indicator — top-left, visible on hover */}
          <div className={`absolute top-2 left-2 z-10 pointer-events-none
            transition-opacity duration-150 ${hovered ? "opacity-80" : "opacity-0"}`}>
            <GripVertical size={12} className="text-white drop-shadow" />
          </div>

          {/* Delete button — top-right, visible on hover */}
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(file.file_id); }}
            className={`absolute top-2 right-2 z-10 w-5 h-5 rounded-full
              bg-black/40 hover:bg-red-700 backdrop-blur-sm
              flex items-center justify-center transition-all duration-150
              ${hovered
                ? "opacity-100 scale-100"
                : "opacity-0 scale-75 pointer-events-none"}`}
            title="Delete file"
          >
            <X size={9} className="text-white" />
          </button>
        </div>

        {/* ── File metadata ─────────────────────────────────────────────────── */}
        <div className="px-2.5 py-2">
          <p className="text-[11px] font-semibold text-apple-text truncate leading-tight">
            {file.filename}
          </p>
          <p className="text-[10px] text-apple-secondary mt-0.5">
            {file.page_count}p · {formatBytes(file.size)}
          </p>
        </div>
      </div>
    </>
  );
}
