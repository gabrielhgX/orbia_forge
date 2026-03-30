import { ChevronLeft, ChevronRight, FileText, RotateCcw, Scissors, X } from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { BACKEND_BASE_URL } from "../api";

/**
 * ExpandedPageView — full-resolution single-page viewer with optional
 * area-crop mode.
 *
 * Props
 *  file           { file_id, filename, page_count, … }
 *  initialPage    0-based index to open first
 *  onClose        dismiss callback
 *  cropLineMode   when true, shows the cut-line crop UI instead of viewer
 *  onCropApply    async (fileId, pageIndex, keepRect[4]) → Promise  (crop mode only)
 */
export default function ExpandedPageView({
  file,
  initialPage,
  onClose,
  cropLineMode = false,
  onCropApply,
}) {
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [imgLoaded,   setImgLoaded]   = useState(false);

  // ── Crop state ─────────────────────────────────────────────────────────────
  // 'drawing'   → guide line tracks cursor; click to lock
  // 'selecting' → line locked; click a half to mark for deletion
  const [cropAxis,     setCropAxis]     = useState("h");      // 'h' | 'v'
  const [cropStage,    setCropStage]    = useState("drawing");
  const [hoverPos,     setHoverPos]     = useState(null);     // 0-1, follows cursor
  const [cutPos,       setCutPos]       = useState(null);     // 0-1, locked on click
  const [deleteHalf,   setDeleteHalf]   = useState(null);     // null | 'first' | 'second'
  const [cropApplying, setCropApplying] = useState(false);

  const overlayRef = useRef(null);

  // Reset crop state when page changes
  useEffect(() => {
    setCropStage("drawing");
    setCutPos(null);
    setHoverPos(null);
    setDeleteHalf(null);
    setCropApplying(false);
    setImgLoaded(false);
  }, [currentPage]);

  // ── Keyboard ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        if (cropLineMode && cropStage === "selecting") {
          // Step back to drawing phase
          setCropStage("drawing");
          setCutPos(null);
          setDeleteHalf(null);
        } else {
          onClose();
        }
        return;
      }
      // Arrow navigation disabled while editing a crop
      if (!cropLineMode) {
        if (e.key === "ArrowLeft")  setCurrentPage((p) => Math.max(0, p - 1));
        if (e.key === "ArrowRight") setCurrentPage((p) => Math.min(file.page_count - 1, p + 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, file.page_count, cropLineMode, cropStage]);

  // ── Crop overlay event handlers ─────────────────────────────────────────────
  const handleOverlayMouseMove = useCallback((e) => {
    if (cropStage !== "drawing") return;
    const el = overlayRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const raw = cropAxis === "h"
      ? (e.clientY - r.top)  / r.height
      : (e.clientX - r.left) / r.width;
    setHoverPos(Math.max(0.04, Math.min(0.96, raw)));
  }, [cropAxis, cropStage]);

  const handleOverlayClick = useCallback((e) => {
    if (cropStage !== "drawing" || hoverPos === null) return;
    e.stopPropagation();
    setCutPos(hoverPos);
    setCropStage("selecting");
    setHoverPos(null);
  }, [cropStage, hoverPos]);

  const handleCropReset = useCallback(() => {
    setCropStage("drawing");
    setCutPos(null);
    setDeleteHalf(null);
  }, []);

  const handleConfirmCrop = useCallback(async () => {
    if (!deleteHalf || cropApplying) return;
    // keep_rect = [x0_norm, y0_norm, x1_norm, y1_norm]  (fractions 0–1 of page)
    // "first"  = top  half (h) or left  half (v) — deleted
    // "second" = bottom half (h) or right half (v) — deleted
    let keepRect;
    if (cropAxis === "h") {
      keepRect = deleteHalf === "first"
        ? [0, cutPos, 1, 1]        // delete top,    keep bottom
        : [0, 0,      1, cutPos];  // delete bottom, keep top
    } else {
      keepRect = deleteHalf === "first"
        ? [cutPos, 0, 1, 1]        // delete left,   keep right
        : [0,      0, cutPos, 1];  // delete right,  keep left
    }
    setCropApplying(true);
    try {
      await onCropApply(file.file_id, currentPage, keepRect);
      // App.js closes the modal on success → component unmounts; do NOT touch state
    } catch {
      // Error toast already shown by App.js
      setCropApplying(false);
    }
  }, [deleteHalf, cropApplying, cropAxis, cutPos, onCropApply, file.file_id, currentPage]);

  // ── Shared helpers ──────────────────────────────────────────────────────────
  const canPrev = currentPage > 0;
  const canNext = currentPage < file.page_count - 1;

  const imgUrl =
    `${BACKEND_BASE_URL}/api/files/${file.file_id}/thumbnail?page=${currentPage}&width=1400`;

  const DOT_MAX = 13;
  const dots = Array.from({ length: Math.min(file.page_count, DOT_MAX) }, (_, i) =>
    file.page_count <= DOT_MAX
      ? i
      : Math.round((i / (DOT_MAX - 1)) * (file.page_count - 1))
  );

  // ── Active cut position (drawing = hoverPos, selecting = cutPos) ────────────
  const activeCut = cropStage === "drawing" ? hoverPos : cutPos;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4
        bg-black/82 backdrop-blur-sm animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="relative flex flex-col bg-white rounded-md overflow-hidden
          shadow-[0_24px_80px_rgba(0,0,0,0.6)] animate-slideUp"
        style={{ width: "min(1100px, 96vw)", height: "96vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-4 py-3
          border-b border-gray-200 bg-gray-50 flex-shrink-0">

          <div className="w-6 h-6 rounded bg-red-100 border border-red-200
            flex items-center justify-center flex-shrink-0">
            <FileText size={13} className="text-red-500" />
          </div>

          <p className="flex-1 text-[13px] font-semibold text-gray-800 truncate min-w-0"
            title={file.filename}>
            {file.filename}
          </p>

          {cropLineMode && (
            <span className="flex items-center gap-1 text-[11px] font-semibold
              px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 flex-shrink-0">
              <Scissors size={10} />
              Area Crop
            </span>
          )}

          <span className="text-[12px] font-medium text-gray-500
            bg-gray-200 px-2.5 py-0.5 rounded flex-shrink-0">
            {currentPage + 1} / {file.page_count}
          </span>

          <button
            onClick={onClose}
            className="w-7 h-7 rounded bg-gray-200 hover:bg-red-100 hover:text-red-600
              flex items-center justify-center transition-colors duration-150 flex-shrink-0"
            title="Close (Esc)"
          >
            <X size={14} />
          </button>
        </div>

        {/* ── Crop toolbar ─────────────────────────────────────────────────── */}
        {cropLineMode && (
          <div className="flex items-center gap-3 px-4 py-2.5
            bg-blue-50 border-b border-blue-200 flex-shrink-0">

            {cropStage === "drawing" && (
              <>
                <p className="flex-1 text-[12px] text-blue-800 leading-tight">
                  {cropAxis === "h"
                    ? "Hover over the page · click to place a horizontal cut line"
                    : "Hover over the page · click to place a vertical cut line"}
                </p>

                {/* Axis toggle */}
                <div className="flex items-center gap-0.5 bg-white rounded border border-blue-200 p-0.5 flex-shrink-0">
                  {["h", "v"].map((ax) => (
                    <button
                      key={ax}
                      onClick={() => setCropAxis(ax)}
                      className={`px-2.5 py-1 text-[11px] font-semibold rounded transition-colors
                        ${cropAxis === ax ? "bg-blue-600 text-white" : "text-blue-700 hover:bg-blue-100"}`}
                    >
                      {ax === "h" ? "Horizontal" : "Vertical"}
                    </button>
                  ))}
                </div>
              </>
            )}

            {cropStage === "selecting" && (
              <>
                <p className="flex-1 text-[12px] text-blue-800 leading-tight">
                  Click the half you want to{" "}
                  <span className="font-bold text-red-600">delete</span>, then confirm
                </p>

                <button
                  onClick={handleCropReset}
                  className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium
                    bg-white border border-blue-200 text-blue-700 hover:bg-blue-100
                    rounded transition-colors flex-shrink-0"
                >
                  <RotateCcw size={11} />
                  Reset line
                </button>

                <button
                  onClick={handleConfirmCrop}
                  disabled={!deleteHalf || cropApplying}
                  className={`px-3 py-1.5 text-[12px] font-semibold rounded
                    transition-colors flex-shrink-0
                    ${deleteHalf && !cropApplying
                      ? "bg-red-600 hover:bg-red-700 text-white"
                      : "bg-gray-200 text-gray-400 cursor-not-allowed"
                    }`}
                >
                  {cropApplying ? "Cropping…" : "Confirm Crop"}
                </button>
              </>
            )}
          </div>
        )}

        {/* ── Page viewer ──────────────────────────────────────────────────── */}
        <div className="flex-1 min-h-0 relative flex items-center justify-center
          bg-[#f0f0f0] p-2">

          {!imgLoaded && (
            <div className="absolute inset-0 bg-gray-200 animate-pulse rounded" />
          )}

          {/*
            The wrapper is a flex item with max-w-full so it cannot exceed the
            container width.  display:inline-block makes it shrink-wrap the
            rendered image, so that the absolute-inset-0 crop overlay aligns
            exactly with the image pixels.

            maxHeight on the <img> is an absolute value that does not depend on
            parent height, avoiding the circular-percentage problem with
            inline-block parents.  175 px covers header (56) + crop-toolbar (48)
            + footer (48) + padding (16) + buffer (7).
          */}
          <div
            className="relative max-w-full"
            style={{ display: "inline-block" }}
          >
            <img
              key={currentPage}
              src={imgUrl}
              alt={`Page ${currentPage + 1} of ${file.filename}`}
              className={`block max-w-full shadow-sm transition-opacity duration-200
                ${imgLoaded ? "opacity-100" : "opacity-0"}`}
              style={{ maxHeight: "calc(96vh - 175px)" }}
              onLoad={() => setImgLoaded(true)}
              draggable={false}
            />

            {/* ── Crop overlay (only after image is loaded) ──────────── */}
            {cropLineMode && imgLoaded && (
              <div
                ref={overlayRef}
                className="absolute inset-0"
                style={{ cursor: cropStage === "drawing" ? "crosshair" : "default" }}
                onMouseMove={handleOverlayMouseMove}
                onMouseLeave={() => cropStage === "drawing" && setHoverPos(null)}
                onClick={handleOverlayClick}
              >
                {/* Guide line — drawing phase */}
                {cropStage === "drawing" && activeCut !== null && (
                  <CutLine axis={cropAxis} pos={activeCut} color="rgba(59,130,246,0.85)" />
                )}

                {/* Locked line + half overlays — selecting phase */}
                {cropStage === "selecting" && cutPos !== null && (
                  <>
                    <CutLine axis={cropAxis} pos={cutPos} color="#2563eb" glow />

                    {/* First half: top (h) or left (v) */}
                    <HalfOverlay
                      style={cropAxis === "h"
                        ? { top: 0, left: 0, right: 0, height: `${cutPos * 100}%` }
                        : { top: 0, left: 0, bottom: 0, width:  `${cutPos * 100}%` }}
                      label={cropAxis === "h" ? "Top" : "Left"}
                      isSelected={deleteHalf === "first"}
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteHalf((p) => p === "first" ? null : "first");
                      }}
                    />

                    {/* Second half: bottom (h) or right (v) */}
                    <HalfOverlay
                      style={cropAxis === "h"
                        ? { left: 0, right: 0, bottom: 0, top:   `${cutPos * 100}%` }
                        : { top: 0, right: 0, bottom: 0, left:  `${cutPos * 100}%` }}
                      label={cropAxis === "h" ? "Bottom" : "Right"}
                      isSelected={deleteHalf === "second"}
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteHalf((p) => p === "second" ? null : "second");
                      }}
                    />
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Navigation footer ────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-3 px-4 py-2.5
          border-t border-gray-200 bg-gray-50 flex-shrink-0">

          <button
            onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
            disabled={!canPrev || cropLineMode}
            title={cropLineMode ? "Navigation disabled in crop mode" : "Previous page (←)"}
            className={`flex items-center gap-1 px-3 py-1.5 rounded text-[12px] font-medium
              transition-all duration-150
              ${canPrev && !cropLineMode
                ? "bg-gray-200 hover:bg-gray-300 text-gray-800 active:scale-95"
                : "bg-gray-100 text-gray-400 cursor-not-allowed"
              }`}
          >
            <ChevronLeft size={14} />
            Prev
          </button>

          <div className="flex items-center gap-1">
            {dots.map((pageIdx, i) => (
              <button
                key={i}
                onClick={() => !cropLineMode && setCurrentPage(pageIdx)}
                disabled={cropLineMode}
                title={`Page ${pageIdx + 1}`}
                className={`rounded-full transition-all duration-200
                  ${currentPage === pageIdx
                    ? "w-4 h-2 bg-apple-blue"
                    : "w-2 h-2 bg-gray-300 hover:bg-gray-500"
                  } ${cropLineMode ? "cursor-not-allowed" : ""}`}
              />
            ))}
          </div>

          <button
            onClick={() => setCurrentPage((p) => Math.min(file.page_count - 1, p + 1))}
            disabled={!canNext || cropLineMode}
            title={cropLineMode ? "Navigation disabled in crop mode" : "Next page (→)"}
            className={`flex items-center gap-1 px-3 py-1.5 rounded text-[12px] font-medium
              transition-all duration-150
              ${canNext && !cropLineMode
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

// ── CutLine ──────────────────────────────────────────────────────────────────
// Thin colored line drawn at `pos` (0–1) along the given axis.
function CutLine({ axis, pos, color, glow = false }) {
  const style = axis === "h"
    ? {
        position: "absolute",
        left: 0, right: 0,
        top: `${pos * 100}%`,
        height: 2,
        transform: "translateY(-1px)",
      }
    : {
        position: "absolute",
        top: 0, bottom: 0,
        left: `${pos * 100}%`,
        width: 2,
        transform: "translateX(-1px)",
      };

  return (
    <div
      style={{
        ...style,
        background: color,
        boxShadow: glow
          ? `0 0 0 1px rgba(255,255,255,0.75), 0 0 8px ${color}80`
          : "0 0 0 1px rgba(255,255,255,0.5)",
        pointerEvents: "none",
        zIndex: 10,
      }}
    />
  );
}

// ── HalfOverlay ──────────────────────────────────────────────────────────────
// Interactive overlay for one half of the page in the selecting phase.
// Hover → red tint + label.  Selected → solid red + label.
function HalfOverlay({ style, label, isSelected, onClick }) {
  const [hovered, setHovered] = useState(false);

  const showLabel = isSelected || hovered;
  const bgColor   = isSelected
    ? "rgba(239,68,68,0.28)"
    : hovered
      ? "rgba(239,68,68,0.14)"
      : "transparent";

  return (
    <div
      style={{ position: "absolute", ...style }}
      className="flex items-center justify-center transition-colors duration-150 cursor-pointer"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Background tint */}
      <div
        className="absolute inset-0 transition-all duration-150"
        style={{ background: bgColor }}
      />

      {/* Label badge */}
      {showLabel && (
        <div className={`relative z-10 flex items-center gap-1.5
          px-3 py-1.5 rounded-full text-[12px] font-bold shadow-lg
          pointer-events-none select-none
          ${isSelected ? "bg-red-600 text-white" : "bg-black/60 text-white"}`}>
          <X size={12} />
          {isSelected ? `Delete ${label}` : `Delete ${label}`}
        </div>
      )}

      {/* "Keep" indicator on the NON-selected half when the other is selected */}
      {!isSelected && !hovered && (
        // rendered but invisible — the absence of a badge signals "Keep"
        null
      )}
    </div>
  );
}
