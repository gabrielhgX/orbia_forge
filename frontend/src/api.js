import axios from "axios";

const BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:8000";

// Exported so components can build direct asset URLs (e.g. thumbnail images)
export const BACKEND_BASE_URL = BASE_URL;

const api = axios.create({ baseURL: BASE_URL });

// ─── helpers ────────────────────────────────────────────────────────────────

function triggerDownload(blob, contentDisposition, fallback) {
  let filename = fallback;
  if (contentDisposition) {
    const m = contentDisposition.match(/filename="([^"]+)"/);
    if (m) filename = m[1];
  }
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => window.URL.revokeObjectURL(url), 200);
}

async function parseBlobError(err) {
  if (err.response?.data instanceof Blob) {
    try {
      const text = await err.response.data.text();
      const json = JSON.parse(text);
      return json.detail || "Operation failed";
    } catch {
      return "Operation failed";
    }
  }
  return err?.response?.data?.detail || err.message || "Operation failed";
}

// ─── API calls ───────────────────────────────────────────────────────────────

export async function uploadFile(file) {
  const fd = new FormData();
  fd.append("file", file);
  const { data } = await api.post("/api/upload", fd);
  return data;
}

export async function listFiles() {
  const { data } = await api.get("/api/files");
  return data;
}

export async function deleteFile(fileId) {
  const { data } = await api.delete(`/api/files/${fileId}`);
  return data;
}

export async function splitPdf(fileId, startPage, endPage) {
  try {
    const res = await api.post(
      "/api/split",
      { file_id: fileId, start_page: startPage, end_page: endPage },
      { responseType: "blob" }
    );
    triggerDownload(
      res.data,
      res.headers["content-disposition"],
      `split_${startPage}-${endPage}.pdf`
    );
  } catch (err) {
    throw new Error(await parseBlobError(err));
  }
}

export async function mergePdfs(fileIds, outputFilename = "merged.pdf") {
  try {
    const res = await api.post(
      "/api/merge",
      { file_ids: fileIds, output_filename: outputFilename },
      { responseType: "blob" }
    );
    triggerDownload(res.data, res.headers["content-disposition"], outputFilename);
  } catch (err) {
    throw new Error(await parseBlobError(err));
  }
}
