import { ArrowDownToLine, ChevronDown, FileText, GitMerge, PackageOpen, X } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import WorkspaceCard from "./WorkspaceCard";

export default function Workspace({
  files,
  pageOrders,
  draggedFile,
  onDrop,
  onRemove,
  onPageClick,
  pageTransformMode,
  onTransformPage,
  areaCropMode,
  selectedFileId,
  onSelectPanel,
  onDownload,
  onCompress,
  pageCropMode,
  onTogglePageMark,
  onConfirmCrop,
  onCancelCrop,
  onPageReorderChange,
  scissorsFileId,
  onDeactivateScissors,
  onReorderWorkspacePanels,
  onMergePanels,
  onMovePageToPanel,
  onExtractPageToNewPanel,
  onDeletePage,
  activeToolLabel,
  onDeactivateTool,
}) {
  const [dragOverFile, setDragOverFile] = useState(false);
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);
  const [compressExpanded, setCompressExpanded] = useState(false);
  const downloadMenuRef = useRef(null);

  useEffect(() => {
    if (!downloadMenuOpen) return;
    const handleClickOutside = (e) => {
      if (downloadMenuRef.current && !downloadMenuRef.current.contains(e.target)) {
        setDownloadMenuOpen(false);
        setCompressExpanded(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [downloadMenuOpen]);

  // ── Page drag state (mouse-based, cross-PDF move / extract / within-panel reorder) ──
  const [pageDrag, setPageDrag] = useState(null);
  const pageDragRef = useRef(null);
  const [pageDropTargetId, setPageDropTargetId] = useState(null);
  const pageDropTargetIdRef = useRef(null);
  const lastPageCursorRef = useRef({ x: 0, y: 0 });
  const cleanupPageMouseListenersRef = useRef(null);
  const [reorderInsertBefore, setReorderInsertBefore] = useState(null); // insert index within source panel
  const pageElsRef = useRef({}); // { [fileId]: { [pageIndex]: HTMLElement } }

  // ── Panel drag state ───────────────────────────────────────────────────────
  const [draggingPanelId, setDraggingPanelId] = useState(null);
  const draggingPanelIdRef = useRef(null);
  const [dragPos, setDragPos] = useState(null); // { x, y, offsetX, offsetY, w, h }
  const panelElsRef = useRef({});
  const rafMoveRef = useRef(0);
  // Live visual order during drag; null = not dragging, use files prop
  const [dragOrder, setDragOrder] = useState(null);
  // Set to true when a merge is triggered so dragEnd skips reorder commit
  const mergeTriggeredRef = useRef(false);
  // Tracks last hovered panel to avoid redundant state updates on rapid dragover
  const lastDragOverRef = useRef(null);
  const [mergeHoverPanelId, setMergeHoverPanelId] = useState(null);
  const lastLoggedHoverRef = useRef(null);

  const cleanupMouseListenersRef = useRef(null);
  const mergeHoverPanelIdRef = useRef(null);

  const [isMergeMode, setIsMergeMode] = useState(false);
  const isMergeModeRef = useRef(false);
  const dragMetaRef = useRef({ offsetX: 0, offsetY: 0, w: 0, h: 0 });
  const [pendingMerge, setPendingMerge] = useState(null); // { sourceId, targetId }

  const handlePanelDragStart = (info) => {
    const fileId = info?.fileId;
    if (!fileId) return;
    if (pageDragRef.current) return;
    if (pendingMerge) return;
    draggingPanelIdRef.current = fileId;
    setDraggingPanelId(fileId);
    lastDragOverRef.current = null;
    mergeHoverPanelIdRef.current = null;
    isMergeModeRef.current = false;
    setIsMergeMode(false);
    if (info?.rect) {
      dragMetaRef.current = {
        offsetX: info.offsetX ?? 0,
        offsetY: info.offsetY ?? 0,
        w: info.rect.width,
        h: info.rect.height,
      };
      setDragPos({
        x: Math.round(info.rect.left + (info.offsetX ?? 0)),
        y: Math.round(info.rect.top + (info.offsetY ?? 0)),
        offsetX: info.offsetX ?? 0,
        offsetY: info.offsetY ?? 0,
        w: info.rect.width,
        h: info.rect.height,
      });
    } else {
      dragMetaRef.current = { offsetX: 0, offsetY: 0, w: 0, h: 0 };
      setDragPos(null);
    }

    // Mouse-based drag: track cursor globally for reliable merge detection.
    const onMouseMove = (e) => {
      handlePanelDragMove({ fileId, x: e.clientX, y: e.clientY });
    };
    const onMouseUp = () => {
      const targetId = mergeHoverPanelIdRef.current;
      if (isMergeModeRef.current && targetId && fileId) {
        // Don't commit reorder; show inline confirm UI.
        mergeTriggeredRef.current = true;
        setPendingMerge({ sourceId: fileId, targetId });
      }
      handlePanelDragEnd();
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    cleanupMouseListenersRef.current = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      cleanupMouseListenersRef.current = null;
    };

    // Ensure we process an initial position immediately.
    if (typeof info?.x === "number" && typeof info?.y === "number") {
      handlePanelDragMove({ fileId, x: info.x, y: info.y });
    }
  };

  const handlePanelDragMove = ({ fileId, x, y }) => {
    const activeId = draggingPanelIdRef.current;
    if (!activeId || fileId !== activeId) return;
    if (pendingMerge) return;
    if (pageDragRef.current) return;
    const rx = Math.round(x);
    const ry = Math.round(y);

    // Update ghost position immediately so it stays locked to the cursor.
    // Keep collision/reorder work in rAF to avoid excessive layout thrash.
    setDragPos((prev) => (prev ? { ...prev, x: rx, y: ry } : prev));
    if (rafMoveRef.current) cancelAnimationFrame(rafMoveRef.current);
    rafMoveRef.current = requestAnimationFrame(() => {
      // Tab-style merge activation: if dragged panel overlaps a target panel horizontally
      // by at least 50% of the target width, activate merge mode.
      const draggedLeft = rx - (dragMetaRef.current?.offsetX ?? 0);
      const draggedTop = ry - (dragMetaRef.current?.offsetY ?? 0);
      const draggedW = dragMetaRef.current?.w ?? 0;
      const draggedH = dragMetaRef.current?.h ?? 0;
      const draggedRight = draggedLeft + draggedW;
      const draggedBottom = draggedTop + draggedH;

      let nextMergeHover = null;
      let bestScore = 0;

      for (const f of files) {
        if (f.file_id === activeId) continue;
        const el = panelElsRef.current[f.file_id];
        if (!el) continue;
        const r = el.getBoundingClientRect();

        const overlapX = Math.max(0, Math.min(draggedRight, r.right) - Math.max(draggedLeft, r.left));
        const overlapY = Math.max(0, Math.min(draggedBottom, r.bottom) - Math.max(draggedTop, r.top));

        // Require some vertical overlap so a panel in another row (if any) doesn't trigger.
        if (overlapY < Math.min(draggedH, r.height) * 0.25) continue;
        if (overlapX < r.width * 0.5) continue;

        // Prefer the panel with the largest horizontal overlap.
        if (overlapX > bestScore) {
          bestScore = overlapX;
          nextMergeHover = f.file_id;
        }
      }

      const nextMergeMode = Boolean(nextMergeHover);
      if (isMergeModeRef.current !== nextMergeMode) {
        isMergeModeRef.current = nextMergeMode;
        setIsMergeMode(nextMergeMode);
      }

      setMergeHoverPanelId(nextMergeHover);
      mergeHoverPanelIdRef.current = nextMergeHover;
      if (lastLoggedHoverRef.current !== nextMergeHover) {
        lastLoggedHoverRef.current = nextMergeHover;
        if (nextMergeHover) console.log("[merge-hover] target:", nextMergeHover, "cursor:", rx, ry);
        else console.log("[merge-hover] none", "cursor:", rx, ry);
      }

      // While merging, disable reorder updates.
      if (nextMergeMode) return;

      const ids = (dragOrder || files.map((f) => f.file_id)).filter((id) => id !== activeId);
      const cursorX = rx;
      let insertAt = ids.length;
      for (let i = 0; i < ids.length; i++) {
        const el = panelElsRef.current[ids[i]];
        if (!el) continue;
        const r = el.getBoundingClientRect();
        const mid = r.left + r.width / 2;
        if (cursorX < mid) { insertAt = i; break; }
      }
      const next = ids.slice();
      next.splice(insertAt, 0, activeId);
      setDragOrder(next);
    });
  };

  // Cleanup safeguard if component unmounts mid-drag.
  useEffect(() => {
    return () => {
      cleanupMouseListenersRef.current?.();
      cleanupPageMouseListenersRef.current?.();
    };
  }, []);

  const handlePanelDragEnd = () => {
    cleanupMouseListenersRef.current?.();
    draggingPanelIdRef.current = null;
    isMergeModeRef.current = false;
    setIsMergeMode(false);
    if (!mergeTriggeredRef.current && dragOrder && draggingPanelId) {
      const finalIndex = dragOrder.indexOf(draggingPanelId);
      if (finalIndex !== -1) onReorderWorkspacePanels?.(draggingPanelId, finalIndex);
    }
    mergeTriggeredRef.current = false;
    lastDragOverRef.current = null;
    setDraggingPanelId(null);
    setDragOrder(null);
    setDragPos(null);
    setMergeHoverPanelId(null);
  };

  const computeInsertBefore = (fileId, draggingPageIdx, cursorY) => {
    const pageEls = pageElsRef.current[fileId] || {};
    const file = files.find((f) => f.file_id === fileId);
    if (!file) return 0;
    const pageOrder = file.pages || Array.from({ length: file.page_count }, (_, i) => i);
    const others = pageOrder.filter((p) => p !== draggingPageIdx);
    for (let i = 0; i < others.length; i++) {
      const el = pageEls[others[i]];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (cursorY < r.top + r.height / 2) return i;
    }
    return others.length;
  };

  const handleExternalPageDragStart = (info) => {
    if (!info?.fileId || typeof info?.pageIndex !== "number") return;
    if (pendingMerge) return;
    if (draggingPanelIdRef.current) return;
    if (pageDragRef.current) return;

    const rect = info?.rect;
    const startX = Math.round(info.x);
    const startY = Math.round(info.y);
    const DRAG_THRESHOLD = 5;
    let hasDragged = false;

    const pendingInfo = {
      sourceFileId: info.fileId,
      pageIndex: info.pageIndex,
      x: startX,
      y: startY,
      offsetX: rect ? Math.round(info.x - rect.left) : 0,
      offsetY: rect ? Math.round(info.y - rect.top) : 0,
      w: rect ? Math.round(rect.width) : 240,
      h: rect ? Math.round(rect.height) : 160,
    };

    // Use the ref as a concurrency lock only; don't show the ghost yet.
    pageDragRef.current = pendingInfo;
    setPageDropTargetId(null);
    pageDropTargetIdRef.current = null;
    lastPageCursorRef.current = { x: startX, y: startY };

    const prevUserSelect = document.body.style.userSelect;

    const onMouseMove = (e) => {
      const current = pageDragRef.current;
      if (!current) return;
      const rx = Math.round(e.clientX);
      const ry = Math.round(e.clientY);

      // Don't start the visual drag or track panels until threshold is exceeded.
      if (!hasDragged) {
        if (Math.abs(rx - startX) < DRAG_THRESHOLD && Math.abs(ry - startY) < DRAG_THRESHOLD) return;
        hasDragged = true;
        document.body.style.userSelect = "none";
      }

      lastPageCursorRef.current = { x: rx, y: ry };
      const next = { ...current, x: rx, y: ry };
      pageDragRef.current = next;
      setPageDrag(next);

      // Detect which panel is under cursor (exclude source panel).
      let targetId = null;
      for (const f of files) {
        if (f.file_id === current.sourceFileId) continue;
        const el = panelElsRef.current[f.file_id];
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (rx >= r.left && rx <= r.right && ry >= r.top && ry <= r.bottom) {
          targetId = f.file_id;
          break;
        }
      }
      if (pageDropTargetIdRef.current !== targetId) {
        pageDropTargetIdRef.current = targetId;
        setPageDropTargetId(targetId);
      }

      // When hovering over the source panel, compute insertion index for the reorder indicator.
      if (!targetId) {
        const sourceEl = panelElsRef.current[current.sourceFileId];
        if (sourceEl) {
          const r = sourceEl.getBoundingClientRect();
          if (rx >= r.left && rx <= r.right && ry >= r.top && ry <= r.bottom) {
            setReorderInsertBefore(computeInsertBefore(current.sourceFileId, current.pageIndex, ry));
          } else {
            setReorderInsertBefore(null);
          }
        }
      } else {
        setReorderInsertBefore(null);
      }
    };

    const onMouseUp = () => {
      const current = pageDragRef.current;
      const lastKnownTarget = pageDropTargetIdRef.current; // capture before reset

      cleanupPageMouseListenersRef.current?.();
      pageDragRef.current = null;
      setPageDrag(null);
      setPageDropTargetId(null);
      pageDropTargetIdRef.current = null;
      setReorderInsertBefore(null);
      document.body.style.userSelect = prevUserSelect;

      // A mousedown + mouseup without moving past the threshold is just a click — do nothing.
      if (!hasDragged || !current) return;

      // Recompute drop target from last cursor position to avoid missing the final hover.
      const { x: rx, y: ry } = lastPageCursorRef.current;

      // First check if cursor is within the source panel → within-panel reorder.
      const sourceEl = panelElsRef.current[current.sourceFileId];
      if (sourceEl) {
        const sr = sourceEl.getBoundingClientRect();
        if (rx >= sr.left && rx <= sr.right && ry >= sr.top && ry <= sr.bottom) {
          const file = files.find((f) => f.file_id === current.sourceFileId);
          if (file) {
            const pageOrder = file.pages || Array.from({ length: file.page_count }, (_, i) => i);
            const others = pageOrder.filter((p) => p !== current.pageIndex);
            const insertAt = computeInsertBefore(current.sourceFileId, current.pageIndex, ry);
            const newOrder = [...others.slice(0, insertAt), current.pageIndex, ...others.slice(insertAt)];
            onPageReorderChange?.(current.sourceFileId, newOrder);
          }
          return;
        }
      }

      // Otherwise check for an external target panel.
      let targetId = null;
      for (const f of files) {
        if (f.file_id === current.sourceFileId) continue;
        const el = panelElsRef.current[f.file_id];
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (rx >= r.left && rx <= r.right && ry >= r.top && ry <= r.bottom) {
          targetId = f.file_id;
          break;
        }
      }

      // Fall back to last known hover target in case cursor drifted outside panel on mouseup.
      const effectiveTarget = targetId || lastKnownTarget;

      if (effectiveTarget) {
        onMovePageToPanel?.({
          sourceFileId: current.sourceFileId,
          pageIndex: current.pageIndex,
          targetFileId: effectiveTarget,
        });
      } else {
        onExtractPageToNewPanel?.({
          sourceFileId: current.sourceFileId,
          pageIndex: current.pageIndex,
        });
      }
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    cleanupPageMouseListenersRef.current = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      cleanupPageMouseListenersRef.current = null;
    };
  };

  // Called by WorkspaceCard's onDragOver — reorders panels in real time
  const handleDragOverPanel = (targetFileId) => {
    if (!draggingPanelId || draggingPanelId === targetFileId) return;
    if (lastDragOverRef.current === targetFileId) return;
    lastDragOverRef.current = targetFileId;

    const current = dragOrder || files.map((f) => f.file_id);
    const from = current.indexOf(draggingPanelId);
    const to   = current.indexOf(targetFileId);
    if (from === -1 || to === -1) return;

    const next = [...current];
    next.splice(from, 1);
    next.splice(to, 0, draggingPanelId);
    setDragOrder(next);
  };

  // Derive display order: use live dragOrder during drag, otherwise files prop
  const displayFiles = (() => {
    if (pendingMerge?.sourceId && pendingMerge?.targetId) {
      const sourceId = pendingMerge.sourceId;
      const targetId = pendingMerge.targetId;
      const idxS = files.findIndex((f) => f.file_id === sourceId);
      const idxT = files.findIndex((f) => f.file_id === targetId);
      const insertAt = Math.max(0, Math.min(idxS, idxT));
      const rest = files.filter((f) => f.file_id !== sourceId && f.file_id !== targetId);
      const placeholder = {
        file_id: "__pending_merge__",
        __kind: "pending_merge",
        sourceId,
        targetId,
      };
      return [...rest.slice(0, insertAt), placeholder, ...rest.slice(insertAt)];
    }
    return dragOrder
      ? dragOrder.map((id) => files.find((f) => f.file_id === id)).filter(Boolean)
      : files;
  })();

  const isEmpty = files.length === 0;
  const selectedFile = files.find((f) => f.file_id === selectedFileId) ?? null;

  // ── Sidebar drop zone ──────────────────────────────────────────────────────
  // Note: panel-to-panel reorder is handled by mouse move collision detection.

  const handleDragOver = (e) => {
    const source = e.dataTransfer.getData("drag-source");
    if (source !== "sidebar") return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    if (!dragOverFile) setDragOverFile(true);
  };

  const handleDragLeave = (e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) setDragOverFile(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOverFile(false);
    const source = e.dataTransfer.getData("drag-source");
    if (source === "sidebar" && draggedFile) onDrop(draggedFile);
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

        {selectedFile && (
          <div className="relative" ref={downloadMenuRef}>
            <button
              onClick={() => setDownloadMenuOpen((o) => !o)}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg
                bg-apple-blue hover:bg-blue-600 text-white text-[12px] font-semibold
                transition-colors duration-150 shadow-sm active:scale-95"
              title={`Download options for "${selectedFile.filename}"`}
            >
              <ArrowDownToLine size={13} />
              Download
              <span className="text-blue-200 font-normal truncate max-w-[140px]">
                {selectedFile.filename}
              </span>
              <ChevronDown size={11} className={`transition-transform duration-150 ${downloadMenuOpen ? "rotate-180" : ""}`} />
            </button>

            {downloadMenuOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-56 bg-white rounded-xl
                shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-apple-border/60 overflow-hidden z-50">

                {/* ── File Download ── */}
                <button
                  onClick={() => { setDownloadMenuOpen(false); setCompressExpanded(false); onDownload?.(); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-[12px] font-medium
                    text-apple-text hover:bg-apple-gray transition-colors text-left"
                >
                  <ArrowDownToLine size={13} className="text-apple-blue flex-shrink-0" />
                  <span>File Download</span>
                </button>

                <div className="h-px bg-apple-border/40 mx-3" />

                {/* ── File Compression (expandable) ── */}
                <button
                  onClick={() => setCompressExpanded((v) => !v)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-[12px] font-medium
                    text-apple-text hover:bg-apple-gray transition-colors text-left"
                >
                  <PackageOpen size={13} className="text-violet-500 flex-shrink-0" />
                  <span className="flex-1">File Compression</span>
                  <ChevronDown
                    size={11}
                    className={`text-apple-secondary transition-transform duration-150
                      ${compressExpanded ? "rotate-180" : ""}`}
                  />
                </button>

                {/* ── Level picker (slides in) ── */}
                {compressExpanded && (
                  <div className="bg-apple-gray/60 border-t border-apple-border/40 px-3 py-2 flex flex-col gap-1">
                    <p className="text-[10px] font-semibold text-apple-secondary uppercase tracking-wide px-1 mb-0.5">
                      Quality
                    </p>
                    {[
                      { id: "low",    label: "Low compression",    sub: "High quality · 300 DPI",    color: "text-emerald-600" },
                      { id: "medium", label: "Medium compression",  sub: "Balanced · 150 DPI",        color: "text-amber-600"  },
                      { id: "high",   label: "High compression",    sub: "Max savings · 72 DPI",      color: "text-red-500"    },
                    ].map(({ id, label, sub, color }) => (
                      <button
                        key={id}
                        onClick={() => {
                          setDownloadMenuOpen(false);
                          setCompressExpanded(false);
                          onCompress?.(id);
                        }}
                        className="w-full flex flex-col px-3 py-2 rounded-lg text-left
                          hover:bg-white transition-colors border border-transparent
                          hover:border-apple-border/40 hover:shadow-sm"
                      >
                        <span className={`text-[12px] font-semibold ${color}`}>{label}</span>
                        <span className="text-[10px] text-apple-secondary mt-0.5">{sub}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {!selectedFile && !isEmpty && (
          <p className="text-[11px] text-apple-secondary">
            Click any page to enlarge · Tools panel →
          </p>
        )}
      </header>

      {/* ── Active tool strip ── */}
      {activeToolLabel && (
        <div className="flex-shrink-0 flex items-center justify-between gap-3
          px-6 py-2 bg-apple-blue border-b border-blue-600">
          <span className="text-[12px] font-medium text-white/90">
            <span className="font-bold text-white">{activeToolLabel}</span> mode is active —
            click any page to apply
          </span>
          <button
            onClick={onDeactivateTool}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full
              bg-white/20 hover:bg-white/30 text-white text-[11px] font-semibold
              transition-colors duration-150 flex-shrink-0"
          >
            <X size={11} />
            Stop using {activeToolLabel}
          </button>
        </div>
      )}

      {/* ── Canvas ── */}
      <div
        className={`flex-1 relative overflow-hidden transition-colors duration-200
          ${dragOverFile ? "bg-blue-50" : "bg-apple-gray"}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleCanvasClick}
      >
        {/* Sidebar drag-over overlay */}
        {dragOverFile && (
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

        {pageDrag && (
          <div className="fixed inset-0 pointer-events-none z-[10000]">
            <div
              style={{
                position: "fixed",
                left: pageDrag.x - pageDrag.offsetX,
                top: pageDrag.y - pageDrag.offsetY,
                width: pageDrag.w,
                height: pageDrag.h,
                transform: "translate3d(0px, 0px, 0px)",
                boxShadow: "0 18px 46px rgba(0,0,0,0.24)",
              }}
              className="rounded-lg overflow-hidden bg-white"
            >
              <div className="w-full h-full bg-apple-gray flex items-center justify-center">
                <div className="text-[11px] font-semibold text-apple-secondary">Dragging page</div>
              </div>
            </div>

            {!pageDropTargetId && (
              <div className="fixed bottom-4 left-0 right-0 flex justify-center">
                <div className="px-3 py-1.5 rounded-full bg-emerald-600 text-white text-[11px] font-semibold shadow-sm">
                  Create new PDF
                </div>
              </div>
            )}
          </div>
        )}

        {/* Empty state */}
        {isEmpty && !dragOverFile && (
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

        {/* ── Panel row — horizontal, scrollable ───────────────────────────── */}
        {!isEmpty && (
          <div className="absolute inset-0 overflow-x-auto overflow-y-hidden">
            <div className="flex gap-2 p-4 h-full items-stretch min-w-max">
              <div className="w-2 flex-shrink-0" />
              {displayFiles.map((file, index) => {
                if (file?.__kind === "pending_merge") {
                  const sourceFile = files.find((f) => f.file_id === file.sourceId) || null;
                  const targetFile = files.find((f) => f.file_id === file.targetId) || null;
                  return (
                    <React.Fragment key={file.file_id}>
                      <div
                        className="relative flex-shrink-0 flex flex-col bg-white overflow-hidden h-full rounded-lg
                          border-2 border-violet-500 shadow-[0_0_0_3px_rgba(139,92,246,0.22)] shadow-mac"
                        style={{ width: 320 }}
                      >
                        <div className="px-4 py-3 border-b border-apple-border/60">
                          <div className="text-[11px] font-semibold text-violet-700">Merge</div>
                          <div className="text-[13px] font-semibold text-apple-text mt-0.5">
                            Merge these PDFs?
                          </div>
                          <div className="text-[11px] text-apple-secondary mt-1 truncate">
                            {sourceFile?.filename || "(unknown)"} + {targetFile?.filename || "(unknown)"}
                          </div>
                        </div>

                        <div className="flex-1 flex flex-col justify-center px-4 py-4 gap-2">
                          <button
                            className="w-full px-3 py-2 rounded-lg bg-violet-600 hover:bg-violet-700
                              text-white text-[12px] font-semibold transition-colors"
                            onClick={() => {
                              const src = file.sourceId;
                              const tgt = file.targetId;
                              setPendingMerge(null);
                              onMergePanels?.(src, tgt);
                            }}
                          >
                            Confirm
                          </button>
                          <button
                            className="w-full px-3 py-2 rounded-lg bg-white hover:bg-apple-gray
                              text-apple-text text-[12px] font-semibold border border-apple-border/60
                              transition-colors"
                            onClick={() => setPendingMerge(null)}
                          >
                            Undo
                          </button>
                        </div>
                      </div>

                      {index < displayFiles.length - 1 && (
                        <div className="w-2 flex-shrink-0" />
                      )}
                    </React.Fragment>
                  );
                }
                const fileCropMode =
                  pageCropMode?.fileId === file.file_id ? pageCropMode : null;
                return (
                  <React.Fragment key={file.file_id}>
                    <WorkspaceCard
                      file={file}
                      orderedPages={pageOrders?.[file.file_id] || null}
                      disablePageReorder={!!pageDrag}
                      onRemove={onRemove}
                      onPageClick={(pageIdx) => {
                        onSelectPanel(file.file_id);
                        onPageClick(file, pageIdx);
                      }}
                      pageTransformMode={pageTransformMode}
                      onTransformPage={onTransformPage}
                      areaCropMode={areaCropMode}
                      isSelected={selectedFileId === file.file_id}
                      onSelect={() => onSelectPanel(file.file_id)}
                      cropMode={fileCropMode}
                      onTogglePageMark={onTogglePageMark}
                      onConfirmCrop={onConfirmCrop}
                      onCancelCrop={onCancelCrop}
                      onPageReorderChange={onPageReorderChange}
                      isScissorsActive={!!scissorsFileId}
                      onDeactivateScissors={onDeactivateScissors}
                      onDeletePage={onDeletePage}
                      onPanelDragStart={handlePanelDragStart}
                      onPanelDragMove={handlePanelDragMove}
                      onPanelDragEnd={handlePanelDragEnd}
                      onExternalPageDragStart={handleExternalPageDragStart}
                      isDragging={draggingPanelId === file.file_id}
                      onDragOverPanel={handleDragOverPanel}
                      isMergeTarget={
                        mergeHoverPanelId === file.file_id &&
                        draggingPanelId !== file.file_id
                      }
                      isMergeSource={
                        isMergeMode && draggingPanelId === file.file_id
                      }
                      isPageDropTarget={pageDropTargetId === file.file_id}
                      draggingPageIndex={pageDrag?.sourceFileId === file.file_id ? pageDrag.pageIndex : undefined}
                      reorderInsertBefore={pageDrag?.sourceFileId === file.file_id ? reorderInsertBefore : null}
                      onRegisterPageEl={(pageIdx, el) => {
                        if (!pageElsRef.current[file.file_id]) pageElsRef.current[file.file_id] = {};
                        if (el) pageElsRef.current[file.file_id][pageIdx] = el;
                        else delete pageElsRef.current[file.file_id][pageIdx];
                      }}
                      onRegisterPanelEl={(el) => {
                        if (el) panelElsRef.current[file.file_id] = el;
                        else delete panelElsRef.current[file.file_id];
                      }}
                    />

                    {index < displayFiles.length - 1 && (
                      <div className="w-2 flex-shrink-0" />
                    )}
                  </React.Fragment>
                );
              })}
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
