import { FileText, GitMerge, GripVertical, X } from "lucide-react";
import React, { useRef, useState } from "react";

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function MergeModal({ files, onMerge, onClose, loading }) {
  const [order, setOrder] = useState([...files]);
  const [outputName, setOutputName] = useState("merged.pdf");
  const dragIdx = useRef(null);

  const totalPages = order.reduce((sum, f) => sum + f.page_count, 0);

  // ── reorder via drag ──────────────────────────────────────────────────────
  const handleDragStart = (idx) => { dragIdx.current = idx; };

  const handleDragEnter = (idx) => {
    if (dragIdx.current === null || dragIdx.current === idx) return;
    const next = [...order];
    const [moved] = next.splice(dragIdx.current, 1);
    next.splice(idx, 0, moved);
    dragIdx.current = idx;
    setOrder(next);
  };

  const handleDragEnd = () => { dragIdx.current = null; };

  const handleSubmit = (e) => {
    e.preventDefault();
    const name = outputName.trim() || "merged.pdf";
    onMerge(order.map((f) => f.file_id), name.endsWith(".pdf") ? name : name + ".pdf");
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
                {order.length} files · {totalPages} total pages
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

        {/* ── Merge order ── */}
        <div className="px-6 py-4">
          <p className="text-[11px] font-semibold text-apple-secondary uppercase tracking-widest mb-2.5">
            Merge order — drag to reorder
          </p>
          <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
            {order.map((file, idx) => (
              <div
                key={file.file_id}
                draggable
                onDragStart={() => handleDragStart(idx)}
                onDragEnter={() => handleDragEnter(idx)}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => e.preventDefault()}
                className="flex items-center gap-2.5 px-3 py-2.5 bg-gray-50 rounded-xl
                  cursor-grab active:cursor-grabbing hover:bg-gray-100 transition-colors
                  select-none"
              >
                <span className="text-[11px] font-bold text-apple-secondary w-4 text-center flex-shrink-0">
                  {idx + 1}
                </span>
                <GripVertical size={13} className="text-apple-border flex-shrink-0" />
                <div className="w-7 h-8 bg-red-50 border border-red-100 rounded flex items-center justify-center flex-shrink-0">
                  <FileText size={13} className="text-red-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium text-apple-text truncate">{file.filename}</p>
                  <p className="text-[11px] text-apple-secondary">
                    {file.page_count} pages · {formatBytes(file.size)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Output name ── */}
        <form onSubmit={handleSubmit} className="px-6 pb-5">
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
              disabled={loading}
              className="flex-1 py-2.5 rounded-xl bg-apple-blue text-white text-[13px] font-semibold
                hover:bg-blue-600 active:scale-[0.98] transition-all flex items-center justify-center gap-2
                disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <GitMerge size={14} />
              )}
              {loading ? "Merging…" : "Merge & Download"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
