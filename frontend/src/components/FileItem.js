import { FileText, GripVertical, Trash2 } from "lucide-react";
import React, { useState } from "react";

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FileItem({ file, onDelete, onDragStart }) {
  const [hovered, setHovered] = useState(false);
  const [dragging, setDragging] = useState(false);

  const handleDragStart = (e) => {
    // Custom drag image: tiny transparent element
    const ghost = document.createElement("div");
    ghost.className = "drag-ghost";
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 0, 0);
    setTimeout(() => document.body.removeChild(ghost), 0);

    e.dataTransfer.effectAllowed = "copy";
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
      className={`flex items-center gap-2.5 px-2 py-2 rounded-xl cursor-grab active:cursor-grabbing
        transition-all duration-150
        ${dragging ? "opacity-40 scale-95" : ""}
        ${hovered ? "bg-gray-50" : ""}
      `}
    >
      <GripVertical size={13} className="text-apple-border flex-shrink-0" />

      {/* Icon */}
      <div className="w-8 h-9 bg-red-50 border border-red-100 rounded-lg flex items-center justify-center flex-shrink-0">
        <FileText size={15} className="text-red-400" />
      </div>

      {/* Meta */}
      <div className="flex-1 min-w-0">
        <p
          className="text-[13px] font-medium text-apple-text truncate leading-tight"
          title={file.filename}
        >
          {file.filename}
        </p>
        <p className="text-[11px] text-apple-secondary leading-tight mt-0.5">
          {file.page_count} {file.page_count === 1 ? "page" : "pages"} ·{" "}
          {formatBytes(file.size)}
        </p>
      </div>

      {/* Delete */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete(file.file_id);
        }}
        className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0
          transition-all duration-150
          ${hovered ? "opacity-100 hover:bg-red-50 hover:text-red-400 text-apple-secondary" : "opacity-0 pointer-events-none"}`}
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}
