import { DragDropContext, Draggable, Droppable } from "@hello-pangea/dnd";
import { FileText, GitMerge, GripVertical, Upload, X } from "lucide-react";
import React, { useMemo, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { BACKEND_BASE_URL, mergePages, uploadFile, uploadPdfBlob } from "../api";

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

export default function MergeModal({ onClose, onImportToWorkspace }) {
  const [mergeFiles, setMergeFiles] = useState([]); // backend file metadata
  const [mergePagesState, setMergePagesState] = useState([]); // { pdfId, originalPageIndex }
  const [outputName, setOutputName] = useState("merged.pdf");

  const [isUploading, setIsUploading] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [error, setError] = useState("");

  const [result, setResult] = useState(null); // { blob, filename }
  const outputNameRef = useRef("merged.pdf");

  const totalPages = mergePagesState.length;

  const fileNameById = useMemo(() => {
    const map = {};
    for (const f of mergeFiles) map[f.file_id] = f.filename;
    return map;
  }, [mergeFiles]);

  const appendUploadedFile = (uploadedMeta) => {
    setMergeFiles((prev) => [...prev, uploadedMeta]);
    setMergePagesState((prev) => [
      ...prev,
      ...Array.from({ length: uploadedMeta.page_count }, (_, i) => ({
        pdfId: uploadedMeta.file_id,
        originalPageIndex: i,
      })),
    ]);
  };

  const onDrop = async (acceptedFiles) => {
    if (!acceptedFiles?.length) return;
    setError("");
    setResult(null);
    try {
      setIsUploading(true);
      for (const f of acceptedFiles) {
        const uploaded = await uploadFile(f);
        appendUploadedFile(uploaded);
      }
    } catch (e) {
      setError(e?.message || "Failed to upload PDF(s)");
    } finally {
      setIsUploading(false);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"] },
    multiple: true,
    noClick: false,
  });

  const handleDragEnd = (result) => {
    if (!result.destination) return;
    if (result.destination.index === result.source.index) return;
    const next = Array.from(mergePagesState);
    const [moved] = next.splice(result.source.index, 1);
    next.splice(result.destination.index, 0, moved);
    setMergePagesState(next);
  };

  const handleGenerate = async (e) => {
    e.preventDefault();
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
      setIsUploading(true);
      const uploaded = await uploadPdfBlob(result.blob, result.filename || outputNameRef.current);
      onImportToWorkspace?.(uploaded);
      onClose();
    } catch (e) {
      setError(e?.message || "Failed to import merged PDF");
    } finally {
      setIsUploading(false);
    }
  };

  const handleBackdrop = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-50 animate-fadeIn"
      onMouseDown={handleBackdrop}
    >
      <div className="bg-white rounded-3xl shadow-mac-lg w-full max-w-[420px] mx-4 overflow-hidden animate-slideUp">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-apple-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-100 rounded-2xl flex items-center justify-center">
              <GitMerge size={16} className="text-apple-blue" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-apple-text">Merge PDFs</h3>
              <p className="text-[11px] text-apple-secondary">
                {mergeFiles.length} files · {totalPages} total pages
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors"
          >
            <X size={15} className="text-apple-secondary" />
          </button>
        </div>

        {/* ── Drop zone ── */}
        <div className="px-6 pt-4">
          <div
            {...getRootProps()}
            className={`rounded-2xl border-2 border-dashed px-4 py-4 transition-colors cursor-pointer select-none
              ${isDragActive ? "border-apple-blue bg-blue-50" : "border-apple-border bg-gray-50"}`}
          >
            <input {...getInputProps()} />
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-2xl bg-white border border-apple-border/60 flex items-center justify-center">
                <Upload size={15} className={isDragActive ? "text-apple-blue" : "text-apple-secondary"} />
              </div>
              <div className="min-w-0">
                <p className="text-[12px] font-semibold text-apple-text leading-tight">
                  Drag & drop PDFs here
                </p>
                <p className="text-[11px] text-apple-secondary mt-0.5 leading-tight">
                  Or click to choose files
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Page list ── */}
        <div className="px-6 py-4">
          <p className="text-[11px] font-semibold text-apple-secondary uppercase tracking-widest mb-2.5">
            Pages — drag to reorder
          </p>
          <div className="max-h-60 overflow-y-auto pr-1">
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
                          isDragDisabled={isUploading || isMerging}
                        >
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border
                                ${snapshot.isDragging
                                  ? "bg-white border-apple-blue/40 shadow-mac-lg"
                                  : "bg-gray-50 border-apple-border/60 hover:bg-gray-100"}
                                transition-colors select-none`}
                            >
                              <span className="text-[11px] font-bold text-apple-secondary w-5 text-center flex-shrink-0">
                                {idx + 1}
                              </span>
                              <GripVertical size={13} className="text-apple-border flex-shrink-0" />
                              <div className="w-10 h-12 bg-white border border-apple-border/60 rounded-lg overflow-hidden flex-shrink-0">
                                <img src={thumbUrl} alt="" className="w-full h-full object-cover" draggable={false} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-[12px] font-medium text-apple-text truncate">
                                  {name}
                                </p>
                                <p className="text-[11px] text-apple-secondary">
                                  Page {p.originalPageIndex + 1}
                                </p>
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

            {mergePagesState.length === 0 && (
              <div className="py-10 text-center">
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-2xl bg-gray-100 mb-2">
                  <FileText size={16} className="text-apple-border" />
                </div>
                <p className="text-[12px] font-medium text-apple-secondary">No pages yet</p>
              </div>
            )}
          </div>
        </div>

        {/* ── Output name ── */}
        <form onSubmit={handleGenerate} className="px-6 pb-5">
          <label className="text-[11px] font-semibold text-apple-secondary uppercase tracking-widest block mb-1.5">
            Output filename
          </label>
          <input
            type="text"
            value={outputName}
            onChange={(e) => setOutputName(e.target.value)}
            placeholder="merged.pdf"
            className="w-full px-3 py-2.5 border border-apple-border rounded-xl text-sm
              focus:outline-none focus:ring-2 focus:ring-apple-blue focus:border-transparent
              transition-all"
          />

          {error && (
            <p className="text-[11px] text-red-600 mt-2 leading-tight">{error}</p>
          )}

          {/* ── Actions ── */}
          <div className="flex gap-2.5 mt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-apple-border text-[13px] font-medium
                text-apple-text hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isUploading || isMerging || mergePagesState.length === 0}
              className="flex-1 py-2.5 rounded-xl bg-apple-blue text-white text-[13px] font-semibold
                hover:bg-blue-600 active:scale-[0.98] transition-all flex items-center justify-center gap-2
                disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
            >
              {isUploading || isMerging ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <GitMerge size={14} />
              )}
              {isUploading ? "Processing…" : isMerging ? "Merging…" : "Generate"}
            </button>
          </div>

          {result?.blob && (
            <div className="flex gap-2.5 mt-3">
              <button
                type="button"
                onClick={handleDownload}
                className="flex-1 py-2.5 rounded-xl border border-apple-border text-[13px] font-medium
                  text-apple-text hover:bg-gray-50 transition-colors"
              >
                Download
              </button>
              <button
                type="button"
                onClick={handleImport}
                disabled={isUploading}
                className="flex-1 py-2.5 rounded-xl bg-green-600 text-white text-[13px] font-semibold
                  hover:bg-green-700 active:scale-[0.98] transition-all flex items-center justify-center gap-2
                  disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
              >
                {isUploading ? "Importing…" : "Import to workspace"}
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
