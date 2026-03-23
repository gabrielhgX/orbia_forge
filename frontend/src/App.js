import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  cropPages,
  deleteFile,
  downloadFile,
  listFiles,
  mergePdfs,
  splitPdf,
  uploadFile,
} from "./api";
import ExpandedPageView from "./components/ExpandedPageView";
import MergeModal from "./components/MergeModal";
import Sidebar from "./components/Sidebar";
import SplitModal from "./components/SplitModal";
import Toast from "./components/Toast";
import ToolsPanel from "./components/ToolsPanel";
import Workspace from "./components/Workspace";

export default function App() {
  const [files,          setFiles]          = useState([]);
  const [workspaceFiles, setWorkspaceFiles] = useState([]);

  // Sidebar → Workspace drag tracking
  const [draggedFile,          setDraggedFile]          = useState(null);
  // Workspace → Sidebar drag tracking
  const [draggedWorkspaceFile, setDraggedWorkspaceFile] = useState(null);

  // Selected panel in the workspace
  const [selectedFileId, setSelectedFileId] = useState(null);

  // Page crop mode: null | { fileId: string, markedPages: Set<number> }
  const [pageCropMode, setPageCropMode] = useState(null);

  const [showSplitModal, setShowSplitModal] = useState(false);
  const [splitTarget,    setSplitTarget]    = useState(null);
  const [showMergeModal, setShowMergeModal] = useState(false);

  // Page modal: { file, pageIdx } when open, null when closed
  const [pageModal, setPageModal] = useState(null);

  const [loading, setLoading] = useState(false);
  const [toasts,  setToasts]  = useState([]);

  const toastIdRef = useRef(0);

  // ── Bootstrap ────────────────────────────────────────────────────────────────
  useEffect(() => {
    listFiles()
      .then(setFiles)
      .catch(() => addToast("Could not reach the backend. Is it running?", "error"));
  }, []);

  // ── Toasts ───────────────────────────────────────────────────────────────────
  const addToast = useCallback((message, type = "success") => {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  }, []);

  // ── Upload ───────────────────────────────────────────────────────────────────
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

  // ── Delete ───────────────────────────────────────────────────────────────────
  const handleDelete = useCallback(
    async (fileId) => {
      try {
        await deleteFile(fileId);
        setFiles((prev) => prev.filter((f) => f.file_id !== fileId));
        setWorkspaceFiles((prev) => prev.filter((f) => f.file_id !== fileId));
        if (selectedFileId === fileId) setSelectedFileId(null);
        if (pageCropMode?.fileId === fileId) setPageCropMode(null);
        addToast("File deleted", "success");
      } catch {
        addToast("Failed to delete file", "error");
      }
    },
    [addToast, selectedFileId, pageCropMode]
  );

  // ── Sidebar → Workspace drag ─────────────────────────────────────────────────
  const handleDragStart = useCallback((file) => setDraggedFile(file), []);

  const handleDropToWorkspace = useCallback((file) => {
    setDraggedFile(null);
    setWorkspaceFiles((prev) =>
      prev.find((f) => f.file_id === file.file_id) ? prev : [...prev, file]
    );
  }, []);

  const handleRemoveFromWorkspace = useCallback((fileId) => {
    setWorkspaceFiles((prev) => prev.filter((f) => f.file_id !== fileId));
    if (selectedFileId === fileId) setSelectedFileId(null);
    if (pageCropMode?.fileId === fileId) setPageCropMode(null);
  }, [selectedFileId, pageCropMode]);

  // ── Workspace → Sidebar drag (restore) ──────────────────────────────────────
  const handleDragStartFromWorkspace = useCallback((file) => {
    setDraggedWorkspaceFile(file);
  }, []);

  const handleDragEndFromWorkspace = useCallback(() => {
    setDraggedWorkspaceFile(null);
  }, []);

  const handleDropToSidebar = useCallback((file) => {
    setDraggedWorkspaceFile(null);
    setWorkspaceFiles((prev) => prev.filter((f) => f.file_id !== file.file_id));
    if (selectedFileId === file.file_id) setSelectedFileId(null);
    if (pageCropMode?.fileId === file.file_id) setPageCropMode(null);
  }, [selectedFileId, pageCropMode]);

  // ── Panel selection ──────────────────────────────────────────────────────────
  const handleSelectPanel = useCallback((fileId) => {
    setSelectedFileId(fileId);
    // Exit crop mode when switching to a different panel
    if (fileId !== null && pageCropMode && pageCropMode.fileId !== fileId) {
      setPageCropMode(null);
    }
  }, [pageCropMode]);

  // ── Download selected file ───────────────────────────────────────────────────
  const handleDownload = useCallback(async () => {
    if (!selectedFileId) return;
    const file = workspaceFiles.find((f) => f.file_id === selectedFileId);
    try {
      setLoading(true);
      await downloadFile(selectedFileId);
      addToast(`Download started!`, "success");
    } catch (err) {
      addToast(err.message || "Failed to download", "error");
    } finally {
      setLoading(false);
    }
  }, [selectedFileId, workspaceFiles, addToast]);

  // ── Page crop mode ───────────────────────────────────────────────────────────
  const handleActivatePageCrop = useCallback(() => {
    if (!selectedFileId) return;
    setPageCropMode({ fileId: selectedFileId, markedPages: new Set() });
  }, [selectedFileId]);

  const handleTogglePageMark = useCallback((pageIdx) => {
    setPageCropMode((prev) => {
      if (!prev) return prev;
      const newMarked = new Set(prev.markedPages);
      if (newMarked.has(pageIdx)) newMarked.delete(pageIdx);
      else newMarked.add(pageIdx);
      return { ...prev, markedPages: newMarked };
    });
  }, []);

  const handleConfirmCrop = useCallback(async () => {
    if (!pageCropMode || !pageCropMode.markedPages.size) return;
    try {
      setLoading(true);
      await cropPages(pageCropMode.fileId, Array.from(pageCropMode.markedPages));
      setPageCropMode(null);
      addToast("Pages deleted — download started!", "success");
    } catch (err) {
      addToast(err.message || "Failed to crop pages", "error");
    } finally {
      setLoading(false);
    }
  }, [pageCropMode, addToast]);

  const handleCancelCrop = useCallback(() => {
    setPageCropMode(null);
  }, []);

  // ── Page modal (enlarged page viewer) ───────────────────────────────────────
  const handlePageClick = useCallback((file, pageIdx) => {
    setPageModal({ file, pageIdx });
  }, []);

  // ── Split ────────────────────────────────────────────────────────────────────
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

  // ── Merge ────────────────────────────────────────────────────────────────────
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

  const selectedFile = workspaceFiles.find((f) => f.file_id === selectedFileId) ?? null;

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen bg-apple-gray font-sans overflow-hidden">

      {/* Left panel — file library */}
      <Sidebar
        files={files}
        onUpload={handleUpload}
        onDelete={handleDelete}
        onDragStart={handleDragStart}
        loading={loading}
        draggedWorkspaceFile={draggedWorkspaceFile}
        onDropFromWorkspace={handleDropToSidebar}
      />

      {/* Centre — PDF panel canvas */}
      <Workspace
        files={workspaceFiles}
        draggedFile={draggedFile}
        onDrop={handleDropToWorkspace}
        onRemove={handleRemoveFromWorkspace}
        onDragStartFromWorkspace={handleDragStartFromWorkspace}
        onDragEndFromWorkspace={handleDragEndFromWorkspace}
        onPageClick={handlePageClick}
        selectedFileId={selectedFileId}
        onSelectPanel={handleSelectPanel}
        onDownload={handleDownload}
        pageCropMode={pageCropMode}
        onTogglePageMark={handleTogglePageMark}
        onConfirmCrop={handleConfirmCrop}
        onCancelCrop={handleCancelCrop}
      />

      {/* Right panel — editing tools */}
      <ToolsPanel
        files={workspaceFiles}
        selectedFile={selectedFile}
        pageCropMode={pageCropMode}
        onSplit={openSplit}
        onMerge={() => setShowMergeModal(true)}
        onActivatePageCrop={handleActivatePageCrop}
        onCancelCrop={handleCancelCrop}
      />

      {/* ── Modals ── */}
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

      {/* Full-page expanded viewer */}
      {pageModal && (
        <ExpandedPageView
          file={pageModal.file}
          initialPage={pageModal.pageIdx}
          onClose={() => setPageModal(null)}
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
