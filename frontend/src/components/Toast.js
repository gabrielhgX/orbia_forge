import { AlertCircle, CheckCircle2, Info, XCircle } from "lucide-react";
import React from "react";

const VARIANTS = {
  success: {
    icon: CheckCircle2,
    iconClass: "text-emerald-500",
    bg: "bg-white border-emerald-200",
  },
  error: {
    icon: XCircle,
    iconClass: "text-red-500",
    bg: "bg-white border-red-200",
  },
  warning: {
    icon: AlertCircle,
    iconClass: "text-amber-500",
    bg: "bg-white border-amber-200",
  },
  info: {
    icon: Info,
    iconClass: "text-apple-blue",
    bg: "bg-white border-blue-200",
  },
};

export default function Toast({ message, type = "success" }) {
  const v = VARIANTS[type] || VARIANTS.success;
  const Icon = v.icon;

  return (
    <div
      className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-2xl
        border shadow-mac-lg animate-toastIn backdrop-blur-sm
        ${v.bg}`}
    >
      <Icon size={16} className={`flex-shrink-0 ${v.iconClass}`} />
      <p className="text-[13px] font-medium text-apple-text max-w-xs">{message}</p>
    </div>
  );
}
