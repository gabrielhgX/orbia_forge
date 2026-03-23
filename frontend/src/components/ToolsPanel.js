import { ChevronDown, ChevronRight, GitMerge, Maximize2, Scissors } from "lucide-react";
import React, { useState } from "react";

// ── Tool registry ─────────────────────────────────────────────────────────────
// To add a new tool: append an entry here. The panel renders each entry
// identically — icon, label, and optional sub-tools — with no other changes.
const TOOL_DEFS = [
  {
    id:       "scissors",
    icon:     Scissors,
    label:    "Cut Pages",
    accentBg: "bg-orange-500",
    autoOpen: true,   // sub-tools open automatically when the panel is hovered
    subTools: [
      {
        id:          "page-crop",
        icon:        Scissors,
        label:       "Page crop",
        description: "Click pages to mark them for deletion",
        action:      "pageCrop",
      },
      {
        id:          "area-crop",
        icon:        Maximize2,
        label:       "Area crop",
        description: "Crop a region from a page",
        comingSoon:  true,
      },
    ],
  },
  {
    id:       "merge",
    icon:     GitMerge,
    label:    "Merge PDFs",
    accentBg: "bg-blue-500",
    subTools: [
      {
        id:          "merge-all",
        icon:        GitMerge,
        label:       "Merge all open",
        description: "Combine all workspace PDFs into one",
        action:      "merge",
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
  onSplit,
  onMerge,
  onActivatePageCrop,
  onCancelCrop,
}) {
  const [expanded,   setExpanded]   = useState(false);
  const [openToolId, setOpenToolId] = useState(null);

  // ── Action dispatcher ────────────────────────────────────────────────────
  const handleAction = (action) => {
    if (action === "pageCrop" && selectedFile) {
      if (pageCropMode) onCancelCrop();
      else onActivatePageCrop();
    }
    if (action === "merge"    && files.length >= 2) onMerge();
  };

  // ── Sub-tool availability ────────────────────────────────────────────────
  const isEnabled = (subTool) => {
    if (subTool.comingSoon)                   return false;
    if (subTool.action === "pageCrop")        return !!selectedFile;
    if (subTool.action === "merge")           return files.length >= 2;
    return true;
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

                    return (
                      <button
                        key={sub.id}
                        onClick={() => enabled && handleAction(sub.action)}
                        disabled={!enabled}
                        className={`w-full flex items-start gap-2.5 pl-10 pr-4 py-2 text-left
                          transition-colors duration-150
                          ${enabled
                            ? isCropActive
                              ? "bg-red-50 hover:bg-red-100 cursor-pointer"
                              : "hover:bg-gray-50 cursor-pointer"
                            : "opacity-50 cursor-not-allowed"
                          }`}
                      >
                        <SubIcon size={13}
                          className={`flex-shrink-0 mt-0.5 ${isCropActive ? "text-red-500" : "text-apple-secondary"}`}
                        />
                        <div className="min-w-0 overflow-hidden">
                          <p className={`text-[12px] font-medium leading-tight
                            flex items-center gap-1.5 whitespace-nowrap
                            ${isCropActive ? "text-red-600" : "text-apple-text"}`}>
                            {isCropActive ? "Exit crop mode" : sub.label}
                            {sub.comingSoon && (
                              <span className="text-[9px] font-bold bg-gray-100
                                text-apple-secondary px-1 py-0.5 rounded whitespace-nowrap">
                                SOON
                              </span>
                            )}
                          </p>
                          <p className="text-[10px] text-apple-secondary mt-0.5
                            leading-tight whitespace-nowrap">
                            {isCropActive
                              ? "Click to cancel crop mode"
                              : !enabled && sub.action === "pageCrop"
                                ? "Select a panel first"
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
