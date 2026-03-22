import { FileText, Scissors, X } from "lucide-react";
import React, { useState } from "react";

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function WorkspaceCard({ file, onRemove, onSplit }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="relative bg-white rounded-2xl shadow-mac hover:shadow-mac-lg
        transition-all duration-200 overflow-hidden group cursor-default"
    >
      {/* ── Remove badge ── */}
      <button
        onClick={() => onRemove(file.file_id)}
        className={`absolute top-2.5 right-2.5 w-5 h-5 bg-red-500 rounded-full
          flex items-center justify-center z-10
          transition-all duration-200
          ${hovered ? "opacity-100 scale-100" : "opacity-0 scale-75"}`}
      >
        <X size={10} className="text-white" />
      </button>

      {/* ── Thumbnail area ── */}
      <div className="h-32 bg-gradient-to-br from-red-50 to-orange-50 flex items-center justify-center border-b border-apple-border">
        <div className="relative text-center">
          {/* Stacked paper effect */}
          <div className="absolute -bottom-1 -right-2 w-11 h-13 bg-red-100/60 rounded-lg" />
          <div className="absolute -bottom-0.5 -right-1 w-11 h-13 bg-red-200/60 rounded-lg" />
          <div className="relative w-11 h-13 bg-white rounded-lg shadow flex items-center justify-center mx-auto">
            <FileText size={20} className="text-red-400" />
          </div>
          <p className="mt-2.5 text-[11px] font-medium text-apple-secondary">
            {file.page_count} {file.page_count === 1 ? "pg" : "pgs"}
          </p>
        </div>
      </div>

      {/* ── Info ── */}
      <div className="px-3 pt-2.5 pb-1">
        <p
          className="text-[12px] font-semibold text-apple-text truncate leading-tight"
          title={file.filename}
        >
          {file.filename}
        </p>
        <p className="text-[11px] text-apple-secondary mt-0.5">{formatBytes(file.size)}</p>
      </div>

      {/* ── Split shortcut ── */}
      <button
        onClick={() => onSplit(file)}
        className="w-full flex items-center justify-center gap-1 py-2 text-[11px] font-medium
          text-apple-secondary hover:text-orange-500 hover:bg-orange-50
          transition-colors duration-150 rounded-b-2xl"
      >
        <Scissors size={11} />
        Split this file
      </button>
    </div>
  );
}
