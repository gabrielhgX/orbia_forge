import { FileText, GripVertical, X } from "lucide-react";
import React, { useState } from "react";
import { BACKEND_BASE_URL } from "../api";

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * FileItem — visual thumbnail card shown in the sidebar library.
 *
 * Displays a live render of page 1 (fetched from the backend thumbnail
 * endpoint) so the user can immediately recognise the document by its content.
 * Falls back to a stacked-paper illustration when the image fails to load.
 *
 * Drag behaviour:
 *  - Drag the card to the workspace to open it as a panel.
 *  - "drag-source: sidebar" is set on the dataTransfer so drop targets can
 *    distinguish this from a workspace-panel drag.
 */
export default function FileItem({ file, onDelete, onDragStart }) {
  const [hovered, setHovered] = useState(false);
  const [dragging, setDragging] = useState(false);
  // Falls back to the paper illustration if the thumbnail endpoint errors
  const [thumbError, setThumbError] = useState(false);

  // First-page thumbnail URL served by the backend (page is 0-indexed)
  const thumbnailUrl = `${BACKEND_BASE_URL}/api/files/${file.file_id}/thumbnail?page=0&width=240`;

  const handleDragStart = (e) => {
    // Replace the browser's default drag ghost with an invisible element
    // so we can drive the visual feedback ourselves
    const ghost = document.createElement("div");
    ghost.className = "drag-ghost";
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 0, 0);
    setTimeout(() => document.body.removeChild(ghost), 0);

    e.dataTransfer.effectAllowed = "copy";
    // Tag the drag source so the workspace drop handler can ignore
    // workspace-panel drags (which share the same drag events)
    e.dataTransfer.setData("drag-source", "sidebar");
    setDragging(true);
    onDragStart(file);
  };

  const handleDragEnd = () => setDragging(false);

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`
        relative bg-white rounded-2xl border border-apple-border/50 overflow-hidden
        cursor-grab active:cursor-grabbing select-none
        transition-all duration-200
        ${dragging
          ? "opacity-40 scale-95 shadow-none"
          : "shadow-mac hover:shadow-mac-lg hover:-translate-y-0.5"
        }
      `}
    >
      {/* ── First-page thumbnail ─────────────────────────────────────────────── */}
      <div className="h-28 bg-gradient-to-br from-red-50 to-orange-50 flex items-center justify-center overflow-hidden border-b border-apple-border/30">
        {thumbError ? (
          /* Stacked-paper fallback when the thumbnail cannot be fetched */
          <div className="relative mt-2">
            <div className="absolute -bottom-1 -right-2 w-9 h-11 bg-red-100/70 rounded-lg" />
            <div className="absolute -bottom-0.5 -right-1 w-9 h-11 bg-red-200/70 rounded-lg" />
            <div className="relative w-9 h-11 bg-white rounded-lg shadow-sm flex items-center justify-center">
              <FileText size={17} className="text-red-400" />
            </div>
          </div>
        ) : (
          <img
            src={thumbnailUrl}
            alt={`Preview of ${file.filename}`}
            className="h-full w-full object-contain"
            onError={() => setThumbError(true)}
            /* Never let the browser make the image itself draggable */
            draggable={false}
          />
        )}
      </div>

      {/* ── File metadata ────────────────────────────────────────────────────── */}
      <div className="px-3 py-2.5">
        <p
          className="text-[12px] font-semibold text-apple-text truncate leading-tight"
          title={file.filename}
        >
          {file.filename}
        </p>
        <p className="text-[11px] text-apple-secondary mt-0.5">
          {file.page_count} {file.page_count === 1 ? "page" : "pages"} · {formatBytes(file.size)}
        </p>
      </div>

      {/* ── Drag handle indicator (visible on hover, overlaid on thumbnail) ── */}
      <div
        className={`absolute top-2 left-2 transition-opacity duration-150 pointer-events-none
          ${hovered ? "opacity-80" : "opacity-0"}`}
      >
        <GripVertical size={13} className="text-white drop-shadow" />
      </div>

      {/* ── Delete button (top-right corner, visible on hover) ─────────────── */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete(file.file_id);
        }}
        className={`
          absolute top-2 right-2 w-5 h-5 bg-red-500 rounded-full
          flex items-center justify-center
          transition-all duration-150
          ${hovered ? "opacity-100 scale-100" : "opacity-0 scale-75 pointer-events-none"}
        `}
        title="Delete file"
      >
        <X size={9} className="text-white" />
      </button>
    </div>
  );
}
