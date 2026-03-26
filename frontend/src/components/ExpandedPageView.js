import { ChevronLeft, ChevronRight, FileText, X } from "lucide-react";
import React, { useEffect, useState } from "react";
import { BACKEND_BASE_URL } from "../api";

/**
 * ExpandedPageView — full-resolution single-page document viewer.
 *
 * Design goals (per spec):
 *  - Document / editor aesthetic: minimal border-radius (rounded-md ≈ 6 px on
 *    the container, no rounding on the page image itself).
 *  - Full proportions — image is object-contain so nothing is ever cropped.
 *  - Clean chrome: header + navigation footer, no decorative padding.
 *  - Keyboard navigation: Escape closes, ←/→ navigate between pages.
 *  - Close via the × button or clicking the dark backdrop.
 *
 * Props
 *  file         full file object { file_id, filename, page_count, … }
 *  initialPage  0-based index of the page to open first
 *  onClose      called when the viewer should be dismissed
 */
export default function ExpandedPageView({ file, initialPage, onClose }) {
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [imgLoaded,   setImgLoaded]   = useState(false);

  // Reset load state when navigating to a new page
  useEffect(() => { setImgLoaded(false); }, [currentPage]);

  // ── Keyboard navigation ──────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape")     { onClose(); return; }
      if (e.key === "ArrowLeft")  setCurrentPage((p) => Math.max(0, p - 1));
      if (e.key === "ArrowRight") setCurrentPage((p) => Math.min(file.page_count - 1, p + 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, file.page_count]);

  const canPrev = currentPage > 0;
  const canNext = currentPage < file.page_count - 1;

  // High-resolution render — 1 400 px gives sharp text even on retina displays
  // without exceeding typical viewport widths.
  const imgUrl =
    `${BACKEND_BASE_URL}/api/files/${file.file_id}/thumbnail?page=${currentPage}&width=1400`;

  // ── Page-dot navigation helpers ──────────────────────────────────────────
  // At most 13 evenly-spaced dots for long documents
  const DOT_MAX = 13;
  const dots = Array.from({ length: Math.min(file.page_count, DOT_MAX) }, (_, i) => {
    return file.page_count <= DOT_MAX
      ? i
      : Math.round((i / (DOT_MAX - 1)) * (file.page_count - 1));
  });

  return (
    /* ── Backdrop ─────────────────────────────────────────────────────────── */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4
        bg-black/82 backdrop-blur-sm animate-fadeIn"
      onClick={onClose}
    >
      {/* ── Viewer card ──────────────────────────────────────────────────────
          rounded-md (6 px) — intentionally minimal to feel like a document viewer
          rather than a modal dialog. */}
      <div
        className="relative flex flex-col bg-white rounded-md overflow-hidden
          shadow-[0_24px_80px_rgba(0,0,0,0.6)] animate-slideUp"
        style={{ width: "min(1100px, 96vw)", height: "96vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header bar ─────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-4 py-3
          border-b border-gray-200 bg-gray-50 flex-shrink-0">

          {/* File icon */}
          <div className="w-6 h-6 rounded bg-red-100 border border-red-200
            flex items-center justify-center flex-shrink-0">
            <FileText size={13} className="text-red-500" />
          </div>

          {/* Filename */}
          <p className="flex-1 text-[13px] font-semibold text-gray-800 truncate min-w-0"
            title={file.filename}>
            {file.filename}
          </p>

          {/* Page counter */}
          <span className="text-[12px] font-medium text-gray-500
            bg-gray-200 px-2.5 py-0.5 rounded flex-shrink-0">
            {currentPage + 1} / {file.page_count}
          </span>

          {/* Close */}
          <button
            onClick={onClose}
            className="w-7 h-7 rounded bg-gray-200 hover:bg-red-100 hover:text-red-600
              flex items-center justify-center transition-colors duration-150 flex-shrink-0"
            title="Close (Esc)"
          >
            <X size={14} />
          </button>
        </div>

        {/* ── Page viewer ──────────────────────────────────────────────────
            object-contain ensures the full page is visible with correct
            proportions — no cropping, no distortion. */}
        <div className="flex-1 min-h-0 relative flex items-center justify-center
          bg-[#f0f0f0] p-2">

          {/* Loading shimmer */}
          {!imgLoaded && (
            <div className="absolute inset-0 bg-gray-200 animate-pulse rounded" />
          )}

          <img
            key={currentPage}   /* remount on page change to fire onLoad fresh */
            src={imgUrl}
            alt={`Page ${currentPage + 1} of ${file.filename}`}
            // No border-radius on the page image — document viewer aesthetic
            className={`max-h-full max-w-full object-contain shadow-sm
              transition-opacity duration-200 ${imgLoaded ? "opacity-100" : "opacity-0"}`}
            onLoad={() => setImgLoaded(true)}
            draggable={false}
          />
        </div>

        {/* ── Navigation footer ────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-3 px-4 py-2.5
          border-t border-gray-200 bg-gray-50 flex-shrink-0">

          {/* Previous */}
          <button
            onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
            disabled={!canPrev}
            title="Previous page (←)"
            className={`flex items-center gap-1 px-3 py-1.5 rounded text-[12px] font-medium
              transition-all duration-150
              ${canPrev
                ? "bg-gray-200 hover:bg-gray-300 text-gray-800 active:scale-95"
                : "bg-gray-100 text-gray-400 cursor-not-allowed"
              }`}
          >
            <ChevronLeft size={14} />
            Prev
          </button>

          {/* Page dots */}
          <div className="flex items-center gap-1">
            {dots.map((pageIdx, i) => (
              <button
                key={i}
                onClick={() => setCurrentPage(pageIdx)}
                title={`Page ${pageIdx + 1}`}
                className={`rounded-full transition-all duration-200
                  ${currentPage === pageIdx
                    ? "w-4 h-2 bg-apple-blue"
                    : "w-2 h-2 bg-gray-300 hover:bg-gray-500"
                  }`}
              />
            ))}
          </div>

          {/* Next */}
          <button
            onClick={() => setCurrentPage((p) => Math.min(file.page_count - 1, p + 1))}
            disabled={!canNext}
            title="Next page (→)"
            className={`flex items-center gap-1 px-3 py-1.5 rounded text-[12px] font-medium
              transition-all duration-150
              ${canNext
                ? "bg-gray-200 hover:bg-gray-300 text-gray-800 active:scale-95"
                : "bg-gray-100 text-gray-400 cursor-not-allowed"
              }`}
          >
            Next
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
