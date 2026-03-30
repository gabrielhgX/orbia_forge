import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  cropPageLine,
  cropPages,
  deleteFile,
  downloadFile,
  listFiles,
  mergePages,
  reorderPages,
  splitPdf,
  transformPage,
  uploadFile,
  uploadPdfBlob,
} from "./api";
import ExpandedPageView from "./components/ExpandedPageView";
import Sidebar from "./components/Sidebar";
import SplitModal from "./components/SplitModal";
import Toast from "./components/Toast";
import ToolsPanel from "./components/ToolsPanel";
import Workspace from "./components/Workspace";

export default function App() {
  const [files,          setFiles]          = useState([]);
  const [workspaceFiles, setWorkspaceFiles] = useState([]);
  const setWorkspaceFilesLogged = useCallback((updater, reason) => {
    setWorkspaceFiles((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      console.log("[workspaceFiles] set:", reason);
      return next;
    });
  }, []);

  const [pageOrders, setPageOrders] = useState({});

  // Sidebar → Workspace drag tracking
  const [draggedFile,          setDraggedFile]          = useState(null);
  // Workspace → Sidebar drag tracking
  const [draggedWorkspaceFile, setDraggedWorkspaceFile] = useState(null);

  // Selected panel in the workspace
  const [selectedFileId, setSelectedFileId] = useState(null);

  // Page crop mode: null | { fileId: string, markedPages: Set<number> }
  const [pageCropMode, setPageCropMode] = useState(null);

  // Scissors (Page Cut) mode: the file_id of the panel currently in cut mode, or null
  const [scissorsFileId, setScissorsFileId] = useState(null);

  // Page transform mode: null | 'rotate' | 'mirror'
  const [pageTransformMode, setPageTransformMode] = useState(null);

  // Area crop mode — user single-clicks a page to open the crop editor
  const [areaCropMode, setAreaCropMode] = useState(false);

  const [showSplitModal, setShowSplitModal] = useState(false);
  const [splitTarget,    setSplitTarget]    = useState(null);

  // Page modal: { file, pageIdx } when open, null when closed
  const [pageModal, setPageModal] = useState(null);

  const [loading, setLoading] = useState(false);
  const [toasts,  setToasts]  = useState([]);

  const toastIdRef = useRef(0);

  // ── Toasts ───────────────────────────────────────────────────────────────────
  const addToast = useCallback((message, type = "success") => {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  }, []);

  // ── Bootstrap ────────────────────────────────────────────────────────────────
  useEffect(() => {
    listFiles()
      .then((next) => {
        setFiles(next);
      })
      .catch(() => addToast("Could not reach the backend. Is it running?", "error"));
  }, [addToast]);

  // ── Upload ───────────────────────────────────────────────────────────────────
  const handleUpload = useCallback(
    async (acceptedFiles) => {
      const nextUploads = [];
      try {
        setLoading(true);
        for (const file of acceptedFiles) {
          try {
            const result = await uploadFile(file);
            nextUploads.push(result);
            addToast(`"${result.filename}" uploaded`, "success");
          } catch {
            addToast(`Failed to upload "${file.name}"`, "error");
          }
        }

        // Always show new uploads immediately.
        if (nextUploads.length > 0) {
          setFiles((prev) => {
            const existing = new Set(prev.map((f) => f.file_id));
            const appended = nextUploads.filter((f) => !existing.has(f.file_id));
            return appended.length ? [...prev, ...appended] : prev;
          });
        }

        // Refresh library from backend to ensure the sidebar reflects the registry.
        try {
          const latest = await listFiles();
          setFiles(latest);
        } catch {
          addToast("Upload succeeded but library refresh failed. Is the backend running?", "error");
        }
      } finally {
        setLoading(false);
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
        setWorkspaceFilesLogged((prev) => prev.filter((f) => f.file_id !== fileId), "delete");
        if (selectedFileId === fileId) setSelectedFileId(null);
        if (pageCropMode?.fileId === fileId) setPageCropMode(null);
        addToast("File deleted", "success");
      } catch {
        addToast("Failed to delete file", "error");
      }
    },
    [addToast, selectedFileId, pageCropMode, setWorkspaceFilesLogged]
  );

  // ── Sidebar → Workspace drag ─────────────────────────────────────────────────
  const handleDragStart = useCallback((file) => setDraggedFile(file), []);

  const handleDropToWorkspace = useCallback((file) => {
    setDraggedFile(null);
    setWorkspaceFilesLogged((prev) => {
      if (prev.find((f) => f.file_id === file.file_id)) return prev;
      const pages = Array.from({ length: file.page_count }, (_, i) => i);
      return [...prev, { ...file, pages }];
    }, "drop_to_workspace");
  }, [setWorkspaceFilesLogged]);

  const handlePageReorderChange = useCallback((fileId, orderedOriginalPages) => {
    setWorkspaceFiles((prev) =>
      prev.map((f) => f.file_id === fileId ? { ...f, pages: orderedOriginalPages } : f)
    );
  }, []);

  const handleMovePageToPanel = useCallback(
    async ({ sourceFileId, pageIndex, targetFileId }) => {
      if (!sourceFileId || !targetFileId || sourceFileId === targetFileId) return;
      const source = workspaceFiles.find((f) => f.file_id === sourceFileId);
      const target = workspaceFiles.find((f) => f.file_id === targetFileId);
      if (!source || !target) return;

      const srcPageList = source.pages ?? Array.from({ length: source.page_count }, (_, i) => i);
      const tgtPageList = target.pages ?? Array.from({ length: target.page_count }, (_, i) => i);

      const srcPages = srcPageList
        .filter((p) => p !== pageIndex)
        .map((p) => ({ fileId: sourceFileId, pageIndex: p }));
      const tgtPages = [
        ...tgtPageList.map((p) => ({ fileId: targetFileId, pageIndex: p })),
        { fileId: sourceFileId, pageIndex },
      ];

      try {
        setLoading(true);
        const promises = [mergePages(tgtPages, `added_${target.filename}`)];
        if (srcPages.length > 0) promises.push(mergePages(srcPages, `moved_${source.filename}`));
        const [uploadedTgt, uploadedSrc] = await Promise.all(promises);

        setWorkspaceFiles((prev) =>
          prev
            .filter((f) => srcPages.length > 0 || f.file_id !== sourceFileId)
            .map((f) => {
              if (f.file_id === sourceFileId) return { ...uploadedSrc, pages: Array.from({ length: uploadedSrc.page_count }, (_, i) => i) };
              if (f.file_id === targetFileId) return { ...uploadedTgt, pages: Array.from({ length: uploadedTgt.page_count }, (_, i) => i) };
              return f;
            })
        );
        addToast("Page moved", "success");
      } catch (err) {
        addToast(err?.message || "Failed to move page", "error");
      } finally {
        setLoading(false);
      }
    },
    [workspaceFiles, addToast]
  );

  const handleExtractPageToNewPanel = useCallback(
    async ({ sourceFileId, pageIndex }) => {
      if (!sourceFileId) return;
      const source = workspaceFiles.find((f) => f.file_id === sourceFileId);
      if (!source) return;

      const srcPageList = source.pages ?? Array.from({ length: source.page_count }, (_, i) => i);
      const srcPages = srcPageList
        .filter((p) => p !== pageIndex)
        .map((p) => ({ fileId: sourceFileId, pageIndex: p }));
      const newDocPages = [{ fileId: sourceFileId, pageIndex }];

      try {
        setLoading(true);
        const promises = [mergePages(newDocPages, `extracted_page_${pageIndex + 1}.pdf`)];
        if (srcPages.length > 0) promises.push(mergePages(srcPages, `remaining_${source.filename}`));
        const [uploadedNew, uploadedSrc] = await Promise.all(promises);

        setWorkspaceFiles((prev) => {
          const srcIdx = prev.findIndex((f) => f.file_id === sourceFileId);
          if (srcIdx === -1) return prev;
          const next = prev.slice();
          if (uploadedSrc) {
            next[srcIdx] = { ...uploadedSrc, pages: Array.from({ length: uploadedSrc.page_count }, (_, i) => i) };
          } else {
            next.splice(srcIdx, 1);
          }
          const insertAt = uploadedSrc ? srcIdx + 1 : srcIdx;
          next.splice(insertAt, 0, { ...uploadedNew, pages: Array.from({ length: uploadedNew.page_count }, (_, i) => i) });
          return next;
        });
        addToast("Page extracted", "success");
      } catch (err) {
        addToast(err?.message || "Failed to extract page", "error");
      } finally {
        setLoading(false);
      }
    },
    [workspaceFiles, addToast]
  );

  const handleActivateScissors   = useCallback(() => {
    setScissorsFileId("active");
    setPageTransformMode(null);
    setAreaCropMode(false);
    setPageCropMode(null);
  }, []);
  const handleDeactivateScissors = useCallback(() => setScissorsFileId(null), []);

  // ── Scissors page deletion (permanent backend delete) ────────────────────
  const handleDeletePage = useCallback(
    async ({ fileId, pageIndex }) => {
      const source = workspaceFiles.find((f) => f.file_id === fileId);
      if (!source) return;
      const srcPageList = source.pages ?? Array.from({ length: source.page_count }, (_, i) => i);
      const remaining = srcPageList.filter((p) => p !== pageIndex);

      if (remaining.length === 0) {
        setWorkspaceFilesLogged((prev) => prev.filter((f) => f.file_id !== fileId), "scissors_last_page");
        if (selectedFileId === fileId) setSelectedFileId(null);
        addToast("Last page deleted — panel closed", "success");
        return;
      }

      try {
        setLoading(true);
        const updated = await mergePages(
          remaining.map((p) => ({ fileId, pageIndex: p })),
          source.filename
        );
        const withPages = { ...updated, pages: Array.from({ length: updated.page_count }, (_, i) => i) };
        setWorkspaceFilesLogged(
          (prev) => prev.map((f) => f.file_id === fileId ? withPages : f),
          "scissors_delete"
        );
        if (selectedFileId === fileId) setSelectedFileId(updated.file_id);
        addToast("Page deleted", "success");
      } catch (err) {
        addToast(err?.message || "Failed to delete page", "error");
      } finally {
        setLoading(false);
      }
    },
    [workspaceFiles, addToast, selectedFileId, scissorsFileId, setWorkspaceFilesLogged]
  );

  const handleActivateAreaCropMode = useCallback(() => {
    setAreaCropMode(true);
    setPageTransformMode(null);
    setScissorsFileId(null);
    setPageCropMode(null);
  }, []);
  const handleDeactivateAreaCropMode = useCallback(() => setAreaCropMode(false), []);

  const handleCropPageLine = useCallback(
    async (fileId, pageIndex, keepRectNorm) => {
      setLoading(true);
      try {
        const updatedFile = await cropPageLine(fileId, pageIndex, keepRectNorm);
        setWorkspaceFiles((prev) =>
          prev.map((f) => {
            if (f.file_id !== fileId) return f;
            return {
              ...f,
              ...updatedFile,
              pages: f.pages ?? Array.from({ length: updatedFile.page_count }, (_, i) => i),
              _thumbV: Date.now(),
            };
          })
        );
        setPageModal(null);
        setAreaCropMode(false);
        addToast("Page cropped", "success");
      } catch (err) {
        addToast(err.message || "Failed to crop page", "error");
        throw err; // let ExpandedPageView reset its loading state
      } finally {
        setLoading(false);
      }
    },
    [addToast]
  );

  const handleActivateRotateMode = useCallback(() => {
    setPageTransformMode("rotate");
    setScissorsFileId(null);
    setAreaCropMode(false);
    setPageCropMode(null);
  }, []);
  const handleActivateMirrorMode = useCallback(() => {
    setPageTransformMode("mirror");
    setScissorsFileId(null);
    setAreaCropMode(false);
    setPageCropMode(null);
  }, []);
  const handleDeactivateTransformMode = useCallback(() => setPageTransformMode(null), []);

  const handleTransformPage = useCallback(
    async ({ fileId, pageIndex, transform }) => {
      if (!fileId || typeof pageIndex !== "number") return;
      const mode = transform || pageTransformMode;
      if (mode !== "rotate" && mode !== "mirror") return;

      try {
        setLoading(true);
        const updatedFile = await transformPage(fileId, pageIndex, mode);

        setWorkspaceFilesLogged(
          (prev) => prev.map((f) => (f.file_id === fileId ? { ...f, ...updatedFile, _thumbV: Date.now() } : f)),
          `page_${mode}`
        );
        addToast(mode === "rotate" ? "Page rotated" : "Page mirrored", "success");
      } catch (err) {
        addToast(err?.message || "Failed to transform page", "error");
      } finally {
        setLoading(false);
      }
    },
    [addToast, pageTransformMode, setWorkspaceFilesLogged]
  );

  const handleRemoveFromWorkspace = useCallback((fileId) => {
    setWorkspaceFilesLogged((prev) => prev.filter((f) => f.file_id !== fileId), "remove_from_workspace");
    if (selectedFileId === fileId) setSelectedFileId(null);
    if (pageCropMode?.fileId === fileId) setPageCropMode(null);
    if (scissorsFileId === fileId) setScissorsFileId(null);
  }, [selectedFileId, pageCropMode, scissorsFileId, setWorkspaceFilesLogged]);

  const handleMergePanels = useCallback(
    async (sourceFileId, targetFileId) => {
      if (!sourceFileId || !targetFileId) return;
      if (sourceFileId === targetFileId) return;

      const a = workspaceFiles.find((f) => f.file_id === sourceFileId) ?? null;
      const b = workspaceFiles.find((f) => f.file_id === targetFileId) ?? null;
      if (!a || !b) return;

      const aOrder = a.pages ?? Array.from({ length: a.page_count }, (_, i) => i);
      const bOrder = b.pages ?? Array.from({ length: b.page_count }, (_, i) => i);

      const pages = [
        ...aOrder.map((pageIndex) => ({ fileId: sourceFileId, pageIndex })),
        ...bOrder.map((pageIndex) => ({ fileId: targetFileId, pageIndex })),
      ];

      const outputName = `merged_${a.filename.replace(/\.pdf$/i, "")}_${b.filename}`;

      try {
        setLoading(true);
        const uploaded = await mergePages(pages, outputName);
        setWorkspaceFilesLogged((prev) => {
          const aIdx = prev.findIndex((f) => f.file_id === sourceFileId);
          const bIdx = prev.findIndex((f) => f.file_id === targetFileId);
          const insertAt = Math.min(
            aIdx === -1 ? prev.length : aIdx,
            bIdx === -1 ? prev.length : bIdx
          );
          const without = prev.filter((f) => f.file_id !== sourceFileId && f.file_id !== targetFileId);
          const idx = Math.max(0, Math.min(insertAt, without.length));
          const withPages = { ...uploaded, pages: Array.from({ length: uploaded.page_count }, (_, i) => i) };
          return [...without.slice(0, idx), withPages, ...without.slice(idx)];
        }, "merge_panels");

        setSelectedFileId(uploaded.file_id);
        if (pageCropMode?.fileId === sourceFileId || pageCropMode?.fileId === targetFileId) setPageCropMode(null);
        if (scissorsFileId === sourceFileId || scissorsFileId === targetFileId) setScissorsFileId(null);

        addToast("PDFs merged", "success");
      } catch (err) {
        addToast(err?.message || "Failed to merge PDFs", "error");
      } finally {
        setLoading(false);
      }
    },
    [workspaceFiles, addToast, pageCropMode, scissorsFileId, setWorkspaceFilesLogged]
  );

  const handleReorderWorkspacePanels = useCallback((fileId, insertIndex) => {
    if (!fileId) return;
    setWorkspaceFilesLogged((prev) => {
      const fromIndex = prev.findIndex((f) => f.file_id === fileId);
      if (fromIndex === -1) return prev;
      const next = prev.slice();
      const [moved] = next.splice(fromIndex, 1);

      const raw = insertIndex ?? next.length;
      const idx = Math.max(0, Math.min(raw, next.length));
      next.splice(idx, 0, moved);
      return next;
    }, "reorder_panels");
  }, [setWorkspaceFilesLogged]);

  // ── Workspace → Sidebar drag (restore) ──────────────────────────────────────
  const handleDragStartFromWorkspace = useCallback((file) => {
    setDraggedWorkspaceFile(file);
  }, []);

  const handleDragEndFromWorkspace = useCallback(() => {
    setDraggedWorkspaceFile(null);
  }, []);

  const handleDropToSidebar = useCallback((file) => {
    setDraggedWorkspaceFile(null);
    setWorkspaceFilesLogged((prev) => prev.filter((f) => f.file_id !== file.file_id), "drop_to_sidebar");
    if (selectedFileId === file.file_id) setSelectedFileId(null);
    if (pageCropMode?.fileId === file.file_id) setPageCropMode(null);
  }, [selectedFileId, pageCropMode, setWorkspaceFilesLogged]);

  // ── Panel selection ──────────────────────────────────────────────────────────
  const handleSelectPanel = useCallback((fileId) => {
    setSelectedFileId(fileId);
    // Exit crop mode when switching to a different panel
    if (fileId !== null && pageCropMode && pageCropMode.fileId !== fileId) {
      setPageCropMode(null);
    }
    // Exit scissors mode when switching to a different panel
    if (fileId !== null && scissorsFileId && scissorsFileId !== fileId) {
      setScissorsFileId(null);
    }
  }, [pageCropMode, scissorsFileId]);

  // ── Download selected file ───────────────────────────────────────────────────
  const handleDownload = useCallback(async () => {
    if (!selectedFileId) return;
    const file = workspaceFiles.find((f) => f.file_id === selectedFileId);
    const order = file?.pages;
    const isReordered = order && order.some((p, i) => p !== i);
    try {
      setLoading(true);
      if (isReordered) {
        await reorderPages(selectedFileId, order);
      } else {
        await downloadFile(selectedFileId);
      }
      addToast("Download started!", "success");
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
    setPageModal({ file, pageIdx, cropMode: areaCropMode });
  }, [areaCropMode]);

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

  const selectedFile = workspaceFiles.find((f) => f.file_id === selectedFileId) ?? null;

  // ── Active tool state (for Workspace deactivation strip) ─────────────────
  const activeToolLabel =
    pageTransformMode === "rotate" ? "Rotate" :
    pageTransformMode === "mirror" ? "Mirror" :
    areaCropMode   ? "Area Crop" :
    scissorsFileId ? "Scissors" :
    pageCropMode   ? "Crop" :
    null;

  const handleDeactivateActiveTool = useCallback(() => {
    if (pageTransformMode) setPageTransformMode(null);
    else if (areaCropMode) setAreaCropMode(false);
    else if (scissorsFileId) setScissorsFileId(null);
    else if (pageCropMode)   setPageCropMode(null);
  }, [pageTransformMode, areaCropMode, scissorsFileId, pageCropMode]);

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
        pageOrders={pageOrders}
        draggedFile={draggedFile}
        onDrop={handleDropToWorkspace}
        onRemove={handleRemoveFromWorkspace}
        onPageClick={handlePageClick}
        pageTransformMode={pageTransformMode}
        onTransformPage={handleTransformPage}
        areaCropMode={areaCropMode}
        selectedFileId={selectedFileId}
        onSelectPanel={handleSelectPanel}
        onDownload={handleDownload}
        pageCropMode={pageCropMode}
        onTogglePageMark={handleTogglePageMark}
        onConfirmCrop={handleConfirmCrop}
        onCancelCrop={handleCancelCrop}
        onPageReorderChange={handlePageReorderChange}
        scissorsFileId={scissorsFileId}
        onActivateScissors={handleActivateScissors}
        onDeactivateScissors={handleDeactivateScissors}
        onReorderWorkspacePanels={handleReorderWorkspacePanels}
        onMergePanels={handleMergePanels}
        onMovePageToPanel={handleMovePageToPanel}
        onExtractPageToNewPanel={handleExtractPageToNewPanel}
        onDeletePage={handleDeletePage}
        activeToolLabel={activeToolLabel}
        onDeactivateTool={handleDeactivateActiveTool}
      />

      {/* Right panel — editing tools */}
      <ToolsPanel
        files={workspaceFiles}
        selectedFile={selectedFile}
        pageCropMode={pageCropMode}
        scissorsFileId={scissorsFileId}
        pageTransformMode={pageTransformMode}
        areaCropMode={areaCropMode}
        onSplit={openSplit}
        onActivatePageCrop={handleActivatePageCrop}
        onCancelCrop={handleCancelCrop}
        onActivateScissors={handleActivateScissors}
        onDeactivateScissors={handleDeactivateScissors}
        onActivateRotateMode={handleActivateRotateMode}
        onActivateMirrorMode={handleActivateMirrorMode}
        onDeactivateTransformMode={handleDeactivateTransformMode}
        onActivateAreaCropMode={handleActivateAreaCropMode}
        onDeactivateAreaCropMode={handleDeactivateAreaCropMode}
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

      {/* Full-page expanded viewer */}
      {pageModal && (
        <ExpandedPageView
          file={pageModal.file}
          initialPage={pageModal.pageIdx}
          onClose={() => setPageModal(null)}
          cropLineMode={pageModal.cropMode || false}
          onCropApply={handleCropPageLine}
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
