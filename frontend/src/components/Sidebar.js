import { FileText, Layers, Upload } from "lucide-react";
import React, { useState } from "react";
import { useDropzone } from "react-dropzone";
import FileItem from "./FileItem";

/**
 * Sidebar — left panel containing the file library.
 *
 * Supports two distinct drag interactions:
 *
 * 1. File upload — drag PDF files from the OS file system into the upload zone
 *    (handled by react-dropzone).
 *
 * 2. Workspace restore — drag a workspace panel header back onto the sidebar
 *    to close the panel and restore the file's thumbnail card in the library.
 *    The entire sidebar becomes a drop target when a workspace drag is active;
 *    a "restore" indicator appears to guide the user.
 *
 * Props:
 *  draggedWorkspaceFile  — the file object currently being dragged from the workspace
 *                          (null when no workspace drag is in progress)
 *  onDropFromWorkspace   — called with the file when dropped onto the sidebar
 */
export default function Sidebar({
  files,
  onUpload,
  onDelete,
  onDragStart,
  loading,
  draggedWorkspaceFile,
  onDropFromWorkspace,
}) {
  // Tracks whether a workspace-panel drag is hovering over the sidebar
  const [restoreDragOver, setRestoreDragOver] = useState(false);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: onUpload,
    accept: { "application/pdf": [".pdf"] },
    multiple: true,
    noClick: false,
  });

  // ── Workspace → Sidebar drop handlers ────────────────────────────────────
  const handleRestoreDragOver = (e) => {
    if (!draggedWorkspaceFile) return; // only handle workspace-panel drags
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setRestoreDragOver(true);
  };

  const handleRestoreDragLeave = (e) => {
    // Only fire when leaving the sidebar element itself (not a child)
    if (!e.currentTarget.contains(e.relatedTarget)) setRestoreDragOver(false);
  };

  const handleRestoreDrop = (e) => {
    e.preventDefault();
    setRestoreDragOver(false);
    if (draggedWorkspaceFile) onDropFromWorkspace(draggedWorkspaceFile);
  };

  return (
    <aside
      className={`
        w-72 min-w-[17rem] bg-white border-r flex flex-col h-full select-none
        transition-colors duration-200
        ${restoreDragOver ? "border-apple-blue bg-blue-50/40" : "border-apple-border"}
      `}
      onDragOver={handleRestoreDragOver}
      onDragLeave={handleRestoreDragLeave}
      onDrop={handleRestoreDrop}
    >
      {/* ── Logo / header ── */}
      <div className="px-5 pt-5 pb-4 border-b border-apple-border">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-apple-blue rounded-xl flex items-center justify-center shadow-sm">
            <Layers size={16} className="text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-apple-text leading-tight">Orbia Forge</h1>
            <p className="text-[11px] text-apple-secondary">Split · Merge · Organise</p>
          </div>
        </div>
      </div>

      {/* ── Restore-to-library drop indicator ────────────────────────────────
          Appears only while a workspace panel is being dragged. Guides the
          user to drop here to close the panel and restore its library card. */}
      {draggedWorkspaceFile && (
        <div
          className={`mx-4 mt-3 rounded-2xl border-2 border-dashed py-2.5 text-center
            transition-all duration-200
            ${restoreDragOver
              ? "border-apple-blue bg-blue-50 text-apple-blue"
              : "border-apple-border text-apple-secondary"
            }`}
        >
          <p className="text-[11px] font-medium">
            {restoreDragOver ? "Release to close panel" : "Drop here to restore to library"}
          </p>
        </div>
      )}

      {/* ── Drop / click upload zone ── */}
      <div className="px-4 pt-3 pb-2">
        <div
          {...getRootProps()}
          className={`relative border-2 border-dashed rounded-2xl p-4 text-center cursor-pointer
            transition-all duration-200 group
            ${isDragActive
              ? "border-apple-blue bg-blue-50 scale-[0.99]"
              : "border-apple-border hover:border-apple-blue hover:bg-gray-50"
            }`}
        >
          <input {...getInputProps()} />
          <div
            className={`w-8 h-8 rounded-xl mx-auto mb-2 flex items-center justify-center transition-colors
              ${isDragActive ? "bg-apple-blue" : "bg-gray-100 group-hover:bg-apple-blue"}`}
          >
            <Upload
              size={15}
              className={`transition-colors ${
                isDragActive ? "text-white" : "text-apple-secondary group-hover:text-white"
              }`}
            />
          </div>
          <p className="text-xs font-medium text-apple-secondary group-hover:text-apple-text transition-colors">
            {isDragActive ? "Drop PDFs here…" : "Drop PDFs or click to upload"}
          </p>
        </div>
      </div>

      {/* ── Library label ── */}
      <div className="px-5 py-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold text-apple-secondary uppercase tracking-widest">
          Library
        </span>
        <span className="text-[11px] text-apple-secondary bg-gray-100 rounded-full px-2 py-0.5 font-medium">
          {files.length}
        </span>
      </div>

      {/* ── Scrollable file card list ─────────────────────────────────────────
          Each FileItem is now a visual thumbnail card showing page 1 of the PDF.
          Cards are stacked vertically with a small gap between them. */}
      <div className="flex-1 overflow-y-auto px-3 pb-4">
        {files.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-center px-4">
            <FileText size={28} className="text-apple-border mb-2" />
            <p className="text-xs text-apple-secondary">No files yet</p>
            <p className="text-[11px] text-apple-border mt-0.5">Upload a PDF to get started</p>
          </div>
        ) : (
          <div className="space-y-2 pt-1">
            {files.map((file) => (
              <FileItem
                key={file.file_id}
                file={file}
                onDelete={onDelete}
                onDragStart={onDragStart}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Footer status ── */}
      {loading && (
        <div className="px-5 py-3 border-t border-apple-border flex items-center gap-2">
          <div className="w-3 h-3 border-2 border-apple-blue/30 border-t-apple-blue rounded-full animate-spin" />
          <span className="text-xs text-apple-secondary">Processing…</span>
        </div>
      )}
    </aside>
  );
}
