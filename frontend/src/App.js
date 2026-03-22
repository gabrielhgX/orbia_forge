import React, { useCallback, useEffect, useRef, useState } from "react";
import { deleteFile, listFiles, mergePdfs, splitPdf, uploadFile } from "./api";
import MergeModal from "./components/MergeModal";
import Sidebar from "./components/Sidebar";
import SplitModal from "./components/SplitModal";
import Toast from "./components/Toast";
import Workspace from "./components/Workspace";

export default function App() {
  const [files, setFiles] = useState([]);
  const [workspaceFiles, setWorkspaceFiles] = useState([]);
  const [draggedFile, setDraggedFile] = useState(null);

  const [showSplitModal, setShowSplitModal] = useState(false);
  const [splitTarget, setSplitTarget] = useState(null);
  const [showMergeModal, setShowMergeModal] = useState(false);

  const [loading, setLoading] = useState(false);
  const [toasts, setToasts] = useState([]);

  const toastIdRef = useRef(0);

  // ── bootstrap ──────────────────────────────────────────────────────────────
  useEffect(() => {
    listFiles()
      .then(setFiles)
      .catch(() => addToast("Could not reach the backend. Is it running?", "error"));
  }, []);

  // ── toasts ─────────────────────────────────────────────────────────────────
  const addToast = useCallback((message, type = "success") => {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  }, []);

  // ── upload ─────────────────────────────────────────────────────────────────
  const handleUpload = useCallback(
    async (acceptedFiles) => {
      for (const file of acceptedFiles) {
        try {
          setLoading(true);
          const result = await uploadFile(file);
          setFiles((prev) => [...prev, result]);
          addToast(`"${result.filename}" uploaded`, "success");
        } catch {
          addToast(`Failed to upload "${file.name}"`, "error");
        } finally {
          setLoading(false);
        }
      }
    },
    [addToast]
  );

  // ── delete ─────────────────────────────────────────────────────────────────
  const handleDelete = useCallback(
    async (fileId) => {
      try {
        await deleteFile(fileId);
        setFiles((prev) => prev.filter((f) => f.file_id !== fileId));
        setWorkspaceFiles((prev) => prev.filter((f) => f.file_id !== fileId));
        addToast("File deleted", "success");
      } catch {
        addToast("Failed to delete file", "error");
      }
    },
    [addToast]
  );

  // ── workspace DnD ──────────────────────────────────────────────────────────
  const handleDragStart = useCallback((file) => setDraggedFile(file), []);

  const handleDropToWorkspace = useCallback((file) => {
    setDraggedFile(null);
    setWorkspaceFiles((prev) =>
      prev.find((f) => f.file_id === file.file_id) ? prev : [...prev, file]
    );
  }, []);

  const handleRemoveFromWorkspace = useCallback((fileId) => {
    setWorkspaceFiles((prev) => prev.filter((f) => f.file_id !== fileId));
  }, []);

  // ── split ──────────────────────────────────────────────────────────────────
  const openSplit = useCallback((file) => {
    setSplitTarget(file);
    setShowSplitModal(true);
  }, []);

  const handleSplit = useCallback(
    async (fileId, startPage, endPage) => {
      try {
        setLoading(true);
        await splitPdf(fileId, startPage, endPage);
        setShowSplitModal(false);
        addToast("PDF split & download started!", "success");
      } catch (err) {
        addToast(err.message || "Failed to split PDF", "error");
      } finally {
        setLoading(false);
      }
    },
    [addToast]
  );

  // ── merge ──────────────────────────────────────────────────────────────────
  const handleMerge = useCallback(
    async (fileIds, outputName) => {
      try {
        setLoading(true);
        await mergePdfs(fileIds, outputName);
        setShowMergeModal(false);
        addToast("PDFs merged & download started!", "success");
      } catch (err) {
        addToast(err.message || "Failed to merge PDFs", "error");
      } finally {
        setLoading(false);
      }
    },
    [addToast]
  );

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen bg-apple-gray font-sans overflow-hidden">
      <Sidebar
        files={files}
        onUpload={handleUpload}
        onDelete={handleDelete}
        onDragStart={handleDragStart}
        loading={loading}
      />

      <Workspace
        files={workspaceFiles}
        draggedFile={draggedFile}
        onDrop={handleDropToWorkspace}
        onRemove={handleRemoveFromWorkspace}
        onSplit={openSplit}
        onMerge={() => setShowMergeModal(true)}
      />

      {showSplitModal && splitTarget && (
        <SplitModal
          file={splitTarget}
          onSplit={handleSplit}
          onClose={() => setShowSplitModal(false)}
          loading={loading}
        />
      )}

      {showMergeModal && (
        <MergeModal
          files={workspaceFiles}
          onMerge={handleMerge}
          onClose={() => setShowMergeModal(false)}
          loading={loading}
        />
      )}

      {/* Toast stack */}
      <div className="fixed bottom-6 right-6 flex flex-col gap-2 z-50 pointer-events-none">
        {toasts.map((t) => (
          <Toast key={t.id} message={t.message} type={t.type} />
        ))}
      </div>
    </div>
  );
}
