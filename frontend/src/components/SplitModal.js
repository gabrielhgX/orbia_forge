import { AlertCircle, FileText, Scissors, X } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function SplitModal({ file, onSplit, onClose, loading }) {
  const [startPage, setStartPage] = useState("1");
  const [endPage, setEndPage] = useState(String(file.page_count));
  const [error, setError] = useState("");
  const startRef = useRef(null);

  useEffect(() => {
    startRef.current?.focus();
  }, []);

  const validate = () => {
    const s = parseInt(startPage, 10);
    const e = parseInt(endPage, 10);
    if (!Number.isInteger(s) || !Number.isInteger(e)) return "Enter valid page numbers.";
    if (s < 1 || e < 1) return "Page numbers must be at least 1.";
    if (s > e) return "Start page must be ≤ end page.";
    if (e > file.page_count) return `End page cannot exceed ${file.page_count}.`;
    return "";
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const err = validate();
    if (err) { setError(err); return; }
    setError("");
    onSplit(file.file_id, parseInt(startPage, 10), parseInt(endPage, 10));
  };

  const handleBackdrop = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-50 animate-fadeIn"
      onMouseDown={handleBackdrop}
    >
      <div className="bg-white rounded-3xl shadow-mac-lg w-full max-w-[400px] mx-4 overflow-hidden animate-slideUp">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-apple-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-orange-100 rounded-2xl flex items-center justify-center">
              <Scissors size={16} className="text-orange-500" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-apple-text">Split PDF</h3>
              <p className="text-[11px] text-apple-secondary">Extract a page range as a new file</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors"
          >
            <X size={15} className="text-apple-secondary" />
          </button>
        </div>

        {/* ── File info strip ── */}
        <div className="px-6 py-3 bg-gray-50 border-b border-apple-border flex items-center gap-3">
          <div className="w-8 h-9 bg-red-50 border border-red-100 rounded-lg flex items-center justify-center flex-shrink-0">
            <FileText size={15} className="text-red-400" />
          </div>
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-apple-text truncate">{file.filename}</p>
            <p className="text-[11px] text-apple-secondary">
              {file.page_count} pages · {formatBytes(file.size)}
            </p>
          </div>
        </div>

        {/* ── Form ── */}
        <form onSubmit={handleSubmit} className="px-6 py-5">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="text-[11px] font-semibold text-apple-secondary uppercase tracking-widest block mb-1.5">
                From page
              </label>
              <input
                ref={startRef}
                type="number"
                value={startPage}
                onChange={(e) => { setStartPage(e.target.value); setError(""); }}
                min={1}
                max={file.page_count}
                className="w-full px-3 py-2.5 border border-apple-border rounded-xl text-sm
                  focus:outline-none focus:ring-2 focus:ring-apple-blue focus:border-transparent
                  transition-all"
              />
            </div>

            <div className="pb-2.5 text-apple-secondary text-sm font-light select-none">→</div>

            <div className="flex-1">
              <label className="text-[11px] font-semibold text-apple-secondary uppercase tracking-widest block mb-1.5">
                To page
              </label>
              <input
                type="number"
                value={endPage}
                onChange={(e) => { setEndPage(e.target.value); setError(""); }}
                min={1}
                max={file.page_count}
                className="w-full px-3 py-2.5 border border-apple-border rounded-xl text-sm
                  focus:outline-none focus:ring-2 focus:ring-apple-blue focus:border-transparent
                  transition-all"
              />
            </div>
          </div>

          <p className="text-[11px] text-apple-secondary mt-2">
            Valid range: 1 – {file.page_count}
          </p>

          {error && (
            <div className="mt-3 flex items-start gap-2 text-red-500 text-[12px] bg-red-50 px-3 py-2.5 rounded-xl border border-red-100">
              <AlertCircle size={13} className="mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* ── Actions ── */}
          <div className="flex gap-2.5 mt-5">
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
              className="flex-1 py-2.5 rounded-xl bg-orange-500 text-white text-[13px] font-semibold
                hover:bg-orange-600 active:scale-[0.98] transition-all flex items-center justify-center gap-2
                disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Scissors size={14} />
              )}
              {loading ? "Splitting…" : "Split & Download"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
