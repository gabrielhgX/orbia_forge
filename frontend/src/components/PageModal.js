import { ChevronLeft, ChevronRight, FileText, X } from "lucide-react";
import React, { useEffect, useState } from "react";
import { BACKEND_BASE_URL } from "../api";

/**
 * PageModal — full-resolution single-page viewer overlay.
 *
 * Opens when the user clicks a page thumbnail inside a workspace panel.
 * Inspired by video-editing software viewers: the page is shown at high
 * resolution in a centred lightbox with prev/next navigation.
 *
 * Keyboard shortcuts
 *  Escape      → close
 *  ArrowLeft   → previous page
 *  ArrowRight  → next page
 *
 * Props
 *  file          full file object (file_id, filename, page_count, …)
 *  initialPage   0-based page index to open on
 *  onClose       called when the modal should be dismissed
 */
export default function PageModal({ file, initialPage, onClose }) {
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [imgLoaded, setImgLoaded] = useState(false);

  // Reset loaded state whenever we navigate to a different page
  useEffect(() => { setImgLoaded(false); }, [currentPage]);

  // ── Keyboard navigation ──────────────────────────────────────────────────
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === "Escape")      { onClose(); return; }
      if (e.key === "ArrowLeft")   { setCurrentPage((p) => Math.max(0, p - 1)); return; }
      if (e.key === "ArrowRight")  { setCurrentPage((p) => Math.min(file.page_count - 1, p + 1)); }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose, file.page_count]);

  const canPrev = currentPage > 0;
  const canNext = currentPage < file.page_count - 1;

  // High-resolution thumbnail for the modal (900 px wide)
  const imgUrl =
    `${BACKEND_BASE_URL}/api/files/${file.file_id}/thumbnail?page=${currentPage}&width=900`;

  // ── Page-dot indicator helpers ───────────────────────────────────────────
  // Show at most 11 dots; for long documents space them evenly
  const DOT_MAX = 11;
  const dotCount = Math.min(file.page_count, DOT_MAX);
  const dots = Array.from({ length: dotCount }, (_, i) => {
    const pageIdx =
      file.page_count <= DOT_MAX
        ? i
        : Math.round((i / (DOT_MAX - 1)) * (file.page_count - 1));
    return pageIdx;
  });

  return (
    /* Backdrop — clicking outside the card closes the modal */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6
        bg-black/80 backdrop-blur-sm animate-fadeIn"
      onClick={onClose}
    >
      {/* Inner card — stop propagation so clicks inside don't close modal */}
      <div
        className="relative flex flex-col bg-white rounded-3xl overflow-hidden animate-slideUp
          shadow-[0_32px_96px_rgba(0,0,0,0.55)]"
        style={{ width: "min(860px, 92vw)", maxHeight: "92vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-apple-border flex-shrink-0">
          {/* File-type icon */}
          <div className="w-7 h-7 rounded-lg bg-red-50 border border-red-100
            flex items-center justify-center flex-shrink-0">
            <FileText size={14} className="text-red-400" />
          </div>

          {/* Filename */}
          <p className="flex-1 text-[13px] font-semibold text-apple-text truncate min-w-0"
            title={file.filename}>
            {file.filename}
          </p>

          {/* Page counter badge */}
          <span className="text-[12px] font-medium text-apple-secondary
            bg-gray-100 px-2.5 py-1 rounded-full flex-shrink-0">
            Page {currentPage + 1} of {file.page_count}
          </span>

          {/* Close button */}
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-gray-100 hover:bg-red-50 hover:text-red-500
              flex items-center justify-center transition-colors duration-150 flex-shrink-0"
            title="Close (Esc)"
          >
            <X size={14} />
          </button>
        </div>

        {/* ── Page image ─────────────────────────────────────────────────── */}
        <div className="flex-1 min-h-0 flex items-center justify-center bg-gray-50 p-5 relative">
          {/* Loading shimmer while the image fetches */}
          {!imgLoaded && (
            <div className="absolute inset-5 rounded-xl bg-gray-200 animate-pulse" />
          )}
          <img
            key={currentPage}   /* remount on page change to restart load state */
            src={imgUrl}
            alt={`Page ${currentPage + 1} of ${file.filename}`}
            className={`max-h-full max-w-full object-contain rounded-xl shadow-md
              transition-opacity duration-200 ${imgLoaded ? "opacity-100" : "opacity-0"}`}
            onLoad={() => setImgLoaded(true)}
            draggable={false}
          />
        </div>

        {/* ── Navigation footer ──────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-4 px-5 py-3.5
          border-t border-apple-border flex-shrink-0">

          {/* Previous button */}
          <button
            onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
            disabled={!canPrev}
            title="Previous page (←)"
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-medium
              transition-all duration-150
              ${canPrev
                ? "bg-gray-100 hover:bg-gray-200 text-apple-text active:scale-95"
                : "bg-gray-50 text-apple-border cursor-not-allowed"
              }`}
          >
            <ChevronLeft size={15} />
            Previous
          </button>

          {/* Page dots — click to jump to an approximate page position */}
          <div className="flex items-center gap-1">
            {dots.map((pageIdx, i) => {
              const isActive = currentPage === pageIdx;
              return (
                <button
                  key={i}
                  onClick={() => setCurrentPage(pageIdx)}
                  title={`Page ${pageIdx + 1}`}
                  className={`rounded-full transition-all duration-200
                    ${isActive
                      ? "w-4 h-2 bg-apple-blue"
                      : "w-2 h-2 bg-apple-border hover:bg-apple-secondary"
                    }`}
                />
              );
            })}
          </div>

          {/* Next button */}
          <button
            onClick={() => setCurrentPage((p) => Math.min(file.page_count - 1, p + 1))}
            disabled={!canNext}
            title="Next page (→)"
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-medium
              transition-all duration-150
              ${canNext
                ? "bg-gray-100 hover:bg-gray-200 text-apple-text active:scale-95"
                : "bg-gray-50 text-apple-border cursor-not-allowed"
              }`}
          >
            Next
            <ChevronRight size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
