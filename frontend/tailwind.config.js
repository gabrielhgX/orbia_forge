/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        apple: {
          blue: "#0071e3",
          gray: "#f5f5f7",
          text: "#1d1d1f",
          secondary: "#6e6e73",
          border: "#d2d2d7",
        },
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          '"SF Pro Display"',
          '"Segoe UI"',
          "Roboto",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
      },
      boxShadow: {
        mac: "0 2px 20px rgba(0,0,0,0.08)",
        "mac-lg": "0 8px 40px rgba(0,0,0,0.14)",
      },
      keyframes: {
        fadeIn: {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        slideUp: {
          from: { opacity: "0", transform: "translateY(14px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        toastIn: {
          from: { opacity: "0", transform: "translateY(16px) scale(0.97)" },
          to: { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        // Workspace panel slides in from slightly above when a PDF is dropped
        panelEntry: {
          from: { opacity: "0", transform: "translateY(-18px) scale(0.97)" },
          to: { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        // Individual page thumbnails reveal sequentially (stagger via animationDelay)
        pageReveal: {
          from: { opacity: "0", transform: "translateY(-10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        fadeIn: "fadeIn 0.2s ease-out",
        slideUp: "slideUp 0.25s cubic-bezier(0.16,1,0.3,1)",
        toastIn: "toastIn 0.3s cubic-bezier(0.16,1,0.3,1)",
        panelEntry: "panelEntry 0.35s cubic-bezier(0.16,1,0.3,1)",
        pageReveal: "pageReveal 0.25s ease-out both",
      },
    },
  },
  plugins: [],
};
