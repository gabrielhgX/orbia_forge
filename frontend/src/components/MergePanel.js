import { DragDropContext, Draggable, Droppable } from "@hello-pangea/dnd";
import { FileText, GitMerge, GripVertical, X } from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { BACKEND_BASE_URL, mergePages, uploadPdfBlob } from "../api";

function downloadBlob(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => window.URL.revokeObjectURL(url), 200);
}

export default function MergePanel({
  position = { x: 20, y: 20 },
  onPositionChange,
  zIndex = 10,
  onFocus,
  draggingPanelFile,
  mergePanels,
  onAddPanelToMerge,
  onImportToWorkspace,
  onClose,
}) {
  const [mergePagesState, setMergePagesState] = useState([]); // { panelId, pdfId, originalPageIndex }
  const [outputName, setOutputName] = useState("merged.pdf");

  const [isMerging, setIsMerging] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null); // { blob, filename }

  const [panelWidth, setPanelWidth] = useState(360);
  const [isResizing, setIsResizing] = useState(false);
  const [isWindowDragging, setIsWindowDragging] = useState(false);
  const resizeStartX = useRef(0);
  const resizeStartW = useRef(0);

  const startWindowDrag = (e) => {
    if (e.target.closest("button") || e.target.closest("input")) return;
    e.preventDefault();
    setIsWindowDragging(true);
    onFocus?.();

    const startX = e.clientX - position.x;
    const startY = e.clientY - position.y;

    const onMouseMove = (mv) => {
      onPositionChange?.(mv.clientX - startX, mv.clientY - startY);
    };
    const onMouseUp = () => {
      setIsWindowDragging(false);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const outputNameRef = useRef("merged.pdf");

  const fileNameById = useMemo(() => {
    const map = {};
    for (const p of mergePanels || []) map[p.file_id] = p.filename;
    return map;
  }, [mergePanels]);

  const mergeSources = useMemo(() => {
    const panels = mergePanels || [];
    return panels.map((p) => {
      const pages = p.pages && p.pages.length
        ? p.pages
        : Array.from({ length: p.page_count }, (_, i) => i);
      return { panelId: p.file_id, fileMeta: p, pages };
    });
  }, [mergePanels]);

  useEffect(() => {
    // Ensure mergePagesState contains exactly the pages from current mergePanels
    const next = [];
    for (const src of mergeSources) {
      for (const pageIndex of src.pages) {
        next.push({ panelId: src.panelId, pdfId: src.panelId, originalPageIndex: pageIndex });
      }
    }
    setMergePagesState(next);
    // Intentionally: panel changes reset per-page reordering to match panel order.
  }, [mergeSources]);

  const handleDragEnd = (result) => {
    if (!result.destination) return;
    if (result.destination.index === result.source.index) return;
    const next = Array.from(mergePagesState);
    const [moved] = next.splice(result.source.index, 1);
    next.splice(result.destination.index, 0, moved);
    setMergePagesState(next);
  };

  const handleGenerate = async () => {
    if (mergePagesState.length === 0) return;

    setError("");
    const name = (outputName.trim() || "merged.pdf").endsWith(".pdf")
      ? (outputName.trim() || "merged.pdf")
      : (outputName.trim() || "merged.pdf") + ".pdf";
    outputNameRef.current = name;

    try {
      setIsMerging(true);
      const { blob } = await mergePages(
        mergePagesState.map((p) => ({ fileId: p.pdfId, pageIndex: p.originalPageIndex })),
        name
      );
      setResult({ blob, filename: name });
    } catch (err) {
      setError(err?.message || "Failed to merge PDFs");
    } finally {
      setIsMerging(false);
    }
  };

  const handleDownload = () => {
    if (!result?.blob) return;
    downloadBlob(result.blob, result.filename || outputNameRef.current);
  };

  const handleImport = async () => {
    if (!result?.blob) return;
    setError("");
    try {
      const uploaded = await uploadPdfBlob(result.blob, result.filename || outputNameRef.current);
      onImportToWorkspace?.(uploaded);
    } catch (e) {
      setError(e?.message || "Failed to import merged PDF");
    }
  };

  const startResize = (e) => {
    e.preventDefault();
    setIsResizing(true);
    resizeStartX.current = e.clientX;
    resizeStartW.current = panelWidth;

    const onMouseMove = (mv) => {
      const delta = mv.clientX - resizeStartX.current;
      setPanelWidth(Math.max(280, Math.min(680, resizeStartW.current + delta)));
    };
    const onMouseUp = () => {
      setIsResizing(false);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const [workspaceDragOver, setWorkspaceDragOver] = useState(false);

  return (
    <div
      style={{
        width: panelWidth,
        position: "absolute",
        left: position.x,
        top: position.y,
        zIndex,
        maxHeight: "calc(100vh - 140px)",
        pointerEvents: isWindowDragging ? "none" : "auto",
      }}
      onMouseDown={() => onFocus?.()}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("workspace-panel-id")) return;
        e.preventDefault();
        if (!workspaceDragOver) setWorkspaceDragOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setWorkspaceDragOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setWorkspaceDragOver(false);
        if (e.dataTransfer.getData("drag-source") !== "workspace-panel") return;
        try {
          const fileMeta = JSON.parse(e.dataTransfer.getData("workspace-panel-file"));
          setError("");
          setResult(null);
          onAddPanelToMerge?.(fileMeta);
        } catch {}
      }}
      className={`
        relative flex flex-col bg-white overflow-hidden
        animate-panelEntry rounded-lg cursor-default
        transition-shadow duration-200
        border-2 border-apple-blue/40 shadow-mac hover:shadow-mac-lg
        ${isResizing || isWindowDragging ? "select-none" : ""}
        ${workspaceDragOver ? "border-apple-blue shadow-mac-lg" : ""}
      `}
    >
      {/* Header */}
      <div
        onMouseDown={startWindowDrag}
        onClick={(e) => e.stopPropagation()}
        className="flex items-center gap-2 px-3 py-2.5 bg-blue-50 border-b border-apple-border/60
          flex-shrink-0 select-none cursor-grab active:cursor-grabbing"
      >
        <GripVertical size={14} className="text-apple-border flex-shrink-0" />
        <GitMerge size={13} className="text-apple-blue flex-shrink-0" />
        <p className="text-[13px] font-semibold text-apple-text truncate flex-1 leading-tight">
          Merge Mode
        </p>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose?.();
          }}
          className="w-5 h-5 rounded-full bg-gray-200 hover:bg-gray-300
            flex items-center justify-center flex-shrink-0 transition-colors duration-150"
          title="Close"
        >
          <X size={9} className="text-gray-700" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto bg-apple-gray p-3 space-y-3 min-h-0">
        <div
          className={`rounded-xl border-2 border-dashed px-3 py-3 transition-colors select-none
            ${workspaceDragOver ? "border-apple-blue bg-blue-50" : "border-apple-border bg-white"}`}
        >
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gray-50 border border-apple-border/60 flex items-center justify-center flex-shrink-0">
              <GitMerge size={15} className={workspaceDragOver ? "text-apple-blue" : "text-apple-secondary"} />
            </div>
            <div className="min-w-0">
              <p className="text-[12px] font-semibold text-apple-text leading-tight">
                Drop workspace panels here
              </p>
              <p className="text-[11px] text-apple-secondary mt-0.5 leading-tight">
                Drag a PDF window into Merge to add its pages
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-apple-border/60 overflow-hidden">
          <div className="px-3 py-2 border-b border-apple-border/60 flex items-center justify-between">
            <p className="text-[10px] font-semibold text-apple-secondary uppercase tracking-widest">
              Sources
            </p>
            <p className="text-[11px] text-apple-secondary">{mergeSources.length}</p>
          </div>
          {mergeSources.length === 0 ? (
            <div className="p-3">
              <p className="text-[12px] text-apple-secondary">No panels added</p>
            </div>
          ) : (
            <div className="p-3 space-y-2">
              {mergeSources.map((s) => (
                <div
                  key={s.panelId}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("drag-source", "merge");
                    e.dataTransfer.setData("merge-panel-id", s.panelId);
                  }}
                  className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg bg-gray-50 border border-apple-border/60"
                >
                  <div className="w-7 h-8 bg-red-50 border border-red-100 rounded flex items-center justify-center flex-shrink-0">
                    <FileText size={13} className="text-red-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-medium text-apple-text truncate">{s.fileMeta.filename}</p>
                    <p className="text-[11px] text-apple-secondary">{s.pages.length} pages</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-apple-border/60 p-3">
          <label className="text-[10px] font-semibold text-apple-secondary uppercase tracking-widest block mb-2">
            Output filename
          </label>
          <input
            type="text"
            value={outputName}
            onChange={(e) => setOutputName(e.target.value)}
            placeholder="merged.pdf"
            className="w-full px-3 py-2.5 border border-apple-border rounded-xl text-sm
              focus:outline-none focus:ring-2 focus:ring-apple-blue focus:border-transparent transition-all"
          />

          {error && (
            <p className="text-[11px] text-red-600 mt-2 leading-tight">{error}</p>
          )}

          <div className="flex gap-2.5 mt-3">
            <button
              type="button"
              onClick={handleGenerate}
              disabled={isMerging || mergePagesState.length === 0}
              className="flex-1 py-2 rounded-lg bg-apple-blue text-white text-[12px] font-semibold
                hover:bg-blue-600 active:scale-[0.98] transition-all flex items-center justify-center gap-2
                disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
            >
              {isMerging ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <GitMerge size={14} />
              )}
              {isMerging ? "Merging…" : "Generate"}
            </button>
          </div>

          {result?.blob && (
            <div className="flex gap-2.5 mt-2">
              <button
                type="button"
                onClick={handleDownload}
                className="flex-1 py-2 rounded-lg border border-apple-border text-[12px] font-medium
                  text-apple-text hover:bg-gray-50 transition-colors"
              >
                Download
              </button>
              <button
                type="button"
                onClick={handleImport}
                className="flex-1 py-2 rounded-lg bg-green-600 text-white text-[12px] font-semibold
                  hover:bg-green-700 active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              >
                Import
              </button>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-apple-border/60 overflow-hidden">
          <div className="px-3 py-2 border-b border-apple-border/60 flex items-center justify-between">
            <p className="text-[10px] font-semibold text-apple-secondary uppercase tracking-widest">
              Pages
            </p>
            <p className="text-[11px] text-apple-secondary">
              {mergePagesState.length}
            </p>
          </div>

          {mergePagesState.length === 0 ? (
            <div className="p-4 text-center">
              <FileText size={16} className="text-apple-border mx-auto" />
              <p className="text-[12px] font-medium text-apple-secondary mt-2">No pages yet</p>
            </div>
          ) : (
            <div className="p-3">
              <DragDropContext onDragEnd={handleDragEnd}>
                <Droppable droppableId="merge-pages">
                  {(provided) => (
                    <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2">
                      {mergePagesState.map((p, idx) => {
                        const thumbUrl = `${BACKEND_BASE_URL}/api/files/${p.pdfId}/thumbnail?page=${p.originalPageIndex}&width=260`;
                        const name = fileNameById[p.pdfId] || "PDF";
                        return (
                          <Draggable
                            key={`${p.pdfId}-${p.originalPageIndex}-${idx}`}
                            draggableId={`${p.pdfId}-${p.originalPageIndex}-${idx}`}
                            index={idx}
                            isDragDisabled={isMerging}
                          >
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg border
                                  ${snapshot.isDragging
                                    ? "bg-white border-apple-blue/40 shadow-mac-lg"
                                    : "bg-gray-50 border-apple-border/60 hover:bg-gray-100"}
                                  transition-colors select-none`}
                              >
                                <span className="text-[11px] font-bold text-apple-secondary w-5 text-center flex-shrink-0">
                                  {idx + 1}
                                </span>
                                <GripVertical size={13} className="text-apple-border flex-shrink-0" />
                                <div className="w-9 h-11 bg-white border border-apple-border/60 rounded-md overflow-hidden flex-shrink-0">
                                  <img src={thumbUrl} alt="" className="w-full h-full object-cover" draggable={false} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-[12px] font-medium text-apple-text truncate">{name}</p>
                                  <p className="text-[11px] text-apple-secondary">Page {p.originalPageIndex + 1}</p>
                                </div>
                              </div>
                            )}
                          </Draggable>
                        );
                      })}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>
            </div>
          )}
        </div>
      </div>

      {/* Right-edge resize handle */}
      <div
        onMouseDown={(e) => {
          e.stopPropagation();
          startResize(e);
        }}
        className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize
          hover:bg-apple-blue/20 active:bg-apple-blue/30 transition-colors duration-150"
        title="Drag to resize"
      />
    </div>
  );
}
