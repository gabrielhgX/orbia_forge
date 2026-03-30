import { ChevronDown, ChevronRight, FlipHorizontal, Maximize2, RotateCw, Scissors } from "lucide-react";
import React, { useState } from "react";

// ── Tool registry ─────────────────────────────────────────────────────────────
// To add a new tool: append an entry here. The panel renders each entry
// identically — icon, label, and optional sub-tools — with no other changes.
const TOOL_DEFS = [
  {
    id:       "scissors",
    icon:     Scissors,
    label:    "Scissors",
    accentBg: "bg-orange-500",
    autoOpen: true,   // sub-tools open automatically when the panel is hovered
    subTools: [
      {
        id:          "page-cut",
        icon:        Scissors,
        label:       "Page Cut",
        description: "Click a page to remove it instantly",
        action:      "pageCut",
      },
      {
        id:          "area-crop",
        icon:        Maximize2,
        label:       "Area Crop",
        description: "Click a page to open it and draw a cut line",
        action:      "areaCrop",
      },
    ],
  },
  {
    id:       "mirror-rotate",
    icon:     RotateCw,
    label:    "Mirror & Rotate",
    accentBg: "bg-blue-500",
    subTools: [
      {
        id:          "page-rotate",
        icon:        RotateCw,
        label:       "Rotate",
        description: "Click a page to rotate it",
        action:      "pageRotate",
      },
      {
        id:          "page-mirror",
        icon:        FlipHorizontal,
        label:       "Mirror",
        description: "Click a page to mirror it",
        action:      "pageMirror",
      },
    ],
  },
];

/**
 * ToolsPanel — retractable right-side tools panel.
 *
 * Props
 *  files             workspace files array — controls which sub-tools are enabled
 *  selectedFile      currently selected workspace file (or null)
 *  pageCropMode      null | { fileId, markedPages: Set }
 *  onSplit           opens the split/page-range modal
 *  onMerge           opens the merge modal
 *  onActivatePageCrop  enter page-crop mode for the selected file
 *  onCancelCrop      exit page-crop mode
 */
export default function ToolsPanel({
  files,
  selectedFile,
  pageCropMode,
  scissorsFileId,
  pageTransformMode,
  areaCropMode,
  onSplit,
  onActivatePageCrop,
  onCancelCrop,
  onActivateScissors,
  onDeactivateScissors,
  onActivateRotateMode,
  onActivateMirrorMode,
  onDeactivateTransformMode,
  onActivateAreaCropMode,
  onDeactivateAreaCropMode,
}) {
  const [expanded,   setExpanded]   = useState(false);
  const [openToolId, setOpenToolId] = useState(null);

  // ── Action dispatcher ────────────────────────────────────────────────────
  const handleAction = (action) => {
    const targetFile = selectedFile || (files.length > 0 ? files[0] : null);
    if (action === "pageCrop" && targetFile) {
      if (pageCropMode) onCancelCrop();
      else onActivatePageCrop();
    }
    if (action === "pageCut" && files.length > 0) {
      if (scissorsFileId) onDeactivateScissors();
      else onActivateScissors();
    }
    if (action === "pageRotate" && files.length > 0) {
      const isActive = pageTransformMode === "rotate";
      if (isActive) onDeactivateTransformMode?.();
      else onActivateRotateMode?.();
    }
    if (action === "pageMirror" && files.length > 0) {
      const isActive = pageTransformMode === "mirror";
      if (isActive) onDeactivateTransformMode?.();
      else onActivateMirrorMode?.();
    }
    if (action === "areaCrop" && files.length > 0) {
      if (areaCropMode) onDeactivateAreaCropMode?.();
      else onActivateAreaCropMode?.();
    }
  };

  // ── Sub-tool availability ────────────────────────────────────────────────
  const isEnabled = (subTool) => {
    if (subTool.comingSoon) return false;
    return files.length > 0;
  };

  // ── Panel expand/collapse handlers ──────────────────────────────────────
  const handleMouseEnter = () => {
    setExpanded(true);
    // Auto-open tools that have autoOpen: true
    const autoTool = TOOL_DEFS.find((t) => t.autoOpen);
    if (autoTool) setOpenToolId(autoTool.id);
  };

  const handleMouseLeave = () => {
    setExpanded(false);
    setOpenToolId(null);
  };

  return (
    <aside
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`
        relative flex flex-col h-full flex-shrink-0 bg-white border-l border-apple-border
        overflow-hidden select-none
        transition-all duration-300 ease-in-out
        ${expanded ? "w-[232px]" : "w-12"}
      `}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 border-b border-apple-border">
        {expanded ? (
          <div className="flex items-center gap-3 px-4 pt-5 pb-4">
            <div className="w-7 h-7 flex-shrink-0 rounded-lg
              bg-gradient-to-br from-violet-500 to-purple-600
              flex items-center justify-center shadow-sm">
              <Scissors size={14} className="text-white" />
            </div>
            <div className="min-w-0 overflow-hidden">
              <h2 className="text-sm font-bold text-apple-text leading-tight whitespace-nowrap">
                Tools
              </h2>
              <p className="text-[10px] text-apple-secondary whitespace-nowrap">
                Edit & process PDFs
              </p>
            </div>
          </div>
        ) : (
          <div className="h-[68px] flex items-center justify-center">
            <div className="w-7 h-7 rounded-lg
              bg-gradient-to-br from-violet-500 to-purple-600
              flex items-center justify-center">
              <Scissors size={14} className="text-white" />
            </div>
          </div>
        )}
      </div>

      {/* ── Tool list ─────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden py-2">
        {TOOL_DEFS.map((tool) => {
          const ToolIcon = tool.icon;
          const isOpen   = openToolId === tool.id;

          return (
            <div key={tool.id}>
              {/* ── Tool row ── */}
              <button
                onClick={() => {
                  if (expanded) setOpenToolId(isOpen ? null : tool.id);
                }}
                title={!expanded ? tool.label : undefined}
                className={`w-full flex items-center gap-3 px-2.5 py-2.5 text-left
                  transition-colors duration-150 hover:bg-gray-50
                  ${isOpen && expanded ? "bg-gray-50" : ""}`}
              >
                <div className={`w-7 h-7 flex-shrink-0 rounded-lg ${tool.accentBg}
                  flex items-center justify-center`}>
                  <ToolIcon size={14} className="text-white" />
                </div>

                {expanded && (
                  <>
                    <span className="flex-1 text-[13px] font-medium text-apple-text
                      truncate whitespace-nowrap">
                      {tool.label}
                    </span>
                    {isOpen
                      ? <ChevronDown  size={13} className="text-apple-secondary flex-shrink-0" />
                      : <ChevronRight size={13} className="text-apple-secondary flex-shrink-0" />
                    }
                  </>
                )}
              </button>

              {/* ── Sub-tool list ── */}
              {expanded && isOpen && (
                <div className="overflow-hidden animate-toolsSlide">
                  {tool.subTools.map((sub) => {
                    const SubIcon   = sub.icon;
                    const enabled   = isEnabled(sub);
                    const isCropActive =
                      sub.action === "pageCrop" && pageCropMode && selectedFile &&
                      pageCropMode.fileId === selectedFile.file_id;
                    const isCutActive =
                      sub.action === "pageCut" && !!scissorsFileId;
                    const isRotateActive   = sub.action === "pageRotate" && pageTransformMode === "rotate";
                    const isMirrorActive   = sub.action === "pageMirror" && pageTransformMode === "mirror";
                    const isAreaCropActive = sub.action === "areaCrop"   && !!areaCropMode;
                    const isActive = isCropActive || isCutActive;
                    const isTransformActive = isRotateActive || isMirrorActive || isAreaCropActive;

                    return (
                      <button
                        key={sub.id}
                        onClick={() => enabled && handleAction(sub.action)}
                        disabled={!enabled}
                        className={`w-full flex items-start gap-2.5 pl-10 pr-4 py-2 text-left
                          transition-colors duration-150
                          ${enabled
                            ? (isActive || isTransformActive)
                              ? "bg-orange-50 hover:bg-orange-100 cursor-pointer"
                              : "hover:bg-gray-50 cursor-pointer"
                            : "opacity-50 cursor-not-allowed"
                          }`}
                      >
                        <SubIcon size={13}
                          className={`flex-shrink-0 mt-0.5 ${(isActive || isTransformActive) ? "text-orange-500" : "text-apple-secondary"}`}
                        />
                        <div className="min-w-0 overflow-hidden">
                          <p className={`text-[12px] font-medium leading-tight
                            flex items-center gap-1.5 whitespace-nowrap
                            ${(isActive || isTransformActive) ? "text-orange-600" : "text-apple-text"}`}>
                            {isCutActive
                              ? "Stop cutting"
                              : isCropActive
                                ? "Exit crop mode"
                                : isRotateActive
                                  ? "Stop rotating"
                                  : isMirrorActive
                                    ? "Stop mirroring"
                                    : isAreaCropActive
                                      ? "Stop area crop"
                                      : sub.label}
                            {sub.comingSoon && (
                              <span className="text-[9px] font-bold bg-gray-100
                                text-apple-secondary px-1 py-0.5 rounded whitespace-nowrap">
                                SOON
                              </span>
                            )}
                          </p>
                          <p className="text-[10px] text-apple-secondary mt-0.5
                            leading-tight whitespace-nowrap">
                            {isCutActive
                              ? "Click to exit scissors mode"
                              : isCropActive
                                ? "Click to cancel crop mode"
                                : isRotateActive
                                  ? "Click to exit rotate mode"
                                  : isMirrorActive
                                    ? "Click to exit mirror mode"
                                    : isAreaCropActive
                                      ? "Click to exit area crop mode"
                                      : !enabled
                                        ? "Open a PDF first"
                                        : sub.description}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Collapse hint ── */}
      {expanded && (
        <div className="flex-shrink-0 px-3 py-2 border-t border-apple-border">
          <p className="text-[10px] text-apple-border text-center whitespace-nowrap">
            Hover to expand · Mouse out to collapse
          </p>
        </div>
      )}
    </aside>
  );
}
