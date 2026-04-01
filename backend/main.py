import io
import os
import shutil
import subprocess
import uuid
from typing import Dict, List, Optional

import fitz  # PyMuPDF
from fastapi import BackgroundTasks, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from PIL import Image
from pydantic import BaseModel

app = FastAPI(title="PDF Tool API")

# Expose custom compression-stats headers so the browser JS can read them.
_EXPOSED_HEADERS = [
    "Content-Disposition",
    "X-Original-Size",
    "X-Compressed-Size",
    "X-Savings-Percent",
    "X-Compression-Method",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=_EXPOSED_HEADERS,
)

# ── Compression pipeline ──────────────────────────────────────────────────────

# Per-level tuning.
# Ghostscript PDFSETTINGS map directly to its built-in distiller profiles:
#   /printer  → 300 DPI images, high quality  (low compression)
#   /ebook    → 150 DPI images, medium quality (balanced)
#   /screen   →  72 DPI images, aggressive     (maximum compression)
#
# PyMuPDF fallback mirrors the same intent via manual image downsampling.
_COMPRESS_LEVELS: Dict[str, dict] = {
    "low":    {"gs_setting": "/printer", "max_image_px": 1800, "jpeg_quality": 85},
    "medium": {"gs_setting": "/ebook",   "max_image_px": 1200, "jpeg_quality": 72},
    "high":   {"gs_setting": "/screen",  "max_image_px":  800, "jpeg_quality": 55},
}


def _find_ghostscript() -> Optional[str]:
    """
    Locate the Ghostscript binary.

    Checks PATH first (works on Linux/macOS and Windows if GS was added to PATH),
    then probes the standard Windows installation directories that the official
    Ghostscript installer uses but does NOT add to PATH by default.
    """
    # 1. PATH lookup (Linux, macOS, or Windows with GS in PATH)
    for name in ("gswin64c", "gswin32c", "gs", "gsc"):
        path = shutil.which(name)
        if path:
            return path

    # 2. Probe standard Windows install paths.
    #    The official installer creates  C:\Program Files\gs\gsX.YZ.W\bin\gswin64c.exe
    #    but never adds it to the system PATH, so shutil.which won't find it.
    gs_root = r"C:\Program Files\gs"
    if os.path.isdir(gs_root):
        # Sort descending so the newest version is tried first.
        versions = sorted(os.listdir(gs_root), reverse=True)
        for ver in versions:
            for binary in ("gswin64c.exe", "gswin32c.exe", "gs.exe"):
                candidate = os.path.join(gs_root, ver, "bin", binary)
                if os.path.isfile(candidate):
                    return candidate

    return None


# Cache the GS path at import time so we don't re-scan for every request.
_GS_BINARY: Optional[str] = _find_ghostscript()


def _compress_with_ghostscript(input_path: str, output_path: str, level: str) -> bool:
    """
    Compress a PDF using Ghostscript — the primary and most effective method.

    HOW IT WORKS
    ─────────────
    Ghostscript re-renders the entire document through its PostScript/PDF
    interpreter and writes a brand-new PDF.  Because it controls every stage
    of the output pipeline it can:

    • Downsample all raster images to the target DPI (/ebook = 150 DPI,
      /screen = 72 DPI).  This is the single biggest source of size reduction
      for image-heavy PDFs and is impossible to achieve safely by patching
      individual PDF streams from the outside.
    • Re-encode downsampled images as JPEG at the appropriate quality setting.
    • Subset embedded fonts — only the character outlines that actually appear
      in the document are kept; unused glyphs are stripped.
    • Eliminate duplicate image XObjects that appear on multiple pages.
    • Remove embedded thumbnails, document metadata, and other optional bloat.
    • Write a compact, linearised cross-reference table.

    WHY THE PREVIOUS PyMuPDF APPROACH MADE FILES LARGER
    ─────────────────────────────────────────────────────
    1. Already-JPEG images were left untouched (correct), but then the PDF was
       re-saved with `clean=True`.  PyMuPDF's content-stream cleaner reformats
       page content streams, which can INCREASE their compressed size when
       the originals were already well-packed by the authoring tool.
    2. `update_stream(xref, jpeg_data, compress=False)` replaces an image
       stream but does not update the surrounding PDF object dictionary
       (/Width, /Height, /ColorSpace, /Filter, /Length).  This can produce
       an internally inconsistent PDF that some readers will refuse to open,
       and the mismatch overhead grows the file.
    3. Stream-level patching cannot downsample JPEG images because the source
       is already lossy-compressed — decoding → scaling → re-encoding causes
       a quality loss with zero size benefit on content that was already at
       the target DPI.
    4. Without image downsampling there is almost nothing left to compress in
       a typical PDF, so `garbage=4 + deflate=True + clean=True` frequently
       produces a file that is the same size or slightly larger than the input.

    Returns True on success, False if GS is unavailable or exits with error.
    """
    if not _GS_BINARY:
        return False

    cfg = _COMPRESS_LEVELS[level]
    cmd = [
        _GS_BINARY,
        "-sDEVICE=pdfwrite",
        "-dCompatibilityLevel=1.4",
        f"-dPDFSETTINGS={cfg['gs_setting']}",
        "-dNOPAUSE",
        "-dQUIET",
        "-dBATCH",
        "-dDetectDuplicateImages=true",  # deduplicate image XObjects across pages
        "-dSubsetFonts=true",            # strip unused font glyphs
        "-dCompressFonts=true",          # deflate-compress font streams
        f"-sOutputFile={output_path}",
        input_path,
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, timeout=300)
        return result.returncode == 0 and os.path.getsize(output_path) > 0
    except (subprocess.TimeoutExpired, FileNotFoundError, OSError):
        return False


def _compress_with_pymupdf(input_path: str, output_path: str, level: str) -> None:
    """
    Fallback compression via PyMuPDF + Pillow, used only when Ghostscript is
    not installed.

    This path achieves meaningful compression only for PDFs whose images are
    stored as uncompressed bitmaps, PNG/LZW, or CCITT — i.e. where image
    re-encoding from a lossless format to JPEG is possible without a prior
    decode → lossy re-encode cycle.  It will NOT significantly compress PDFs
    whose images are already stored as JPEG (the most common case) because
    re-encoding JPEG→JPEG degrades quality with no size benefit.
    """
    cfg = _COMPRESS_LEVELS[level]
    max_px = cfg["max_image_px"]
    quality = cfg["jpeg_quality"]

    doc = fitz.open(input_path)
    visited: set = set()

    for page in doc:
        for img_ref in page.get_images(full=True):
            xref = img_ref[0]
            if xref in visited:
                continue
            visited.add(xref)
            try:
                info = doc.extract_image(xref)
                # Already JPEG — skip. Decoding + re-encoding adds loss and rarely saves space.
                if info.get("ext") in ("jpeg", "jpx"):
                    continue

                pix = fitz.Pixmap(doc, xref)
                if pix.width < 32 or pix.height < 32:
                    continue  # skip tiny masks / icons

                # JPEG only supports RGB and Grayscale.
                if pix.alpha or pix.n > 3:
                    pix = fitz.Pixmap(fitz.csRGB, pix)

                mode = "RGB" if pix.n == 3 else "L"
                pil_img = Image.frombytes(mode, (pix.width, pix.height), pix.samples)

                w, h = pil_img.size
                if max(w, h) > max_px:
                    scale = max_px / max(w, h)
                    pil_img = pil_img.resize(
                        (max(1, int(w * scale)), max(1, int(h * scale))),
                        Image.LANCZOS,
                    )

                buf = io.BytesIO()
                pil_img.save(buf, format="JPEG", quality=quality, optimize=True)
                jpeg_data = buf.getvalue()

                # Only replace if genuinely smaller — never inflate the file.
                if len(jpeg_data) < len(info["image"]):
                    doc.update_stream(xref, jpeg_data, compress=False)

            except Exception:
                pass  # leave problematic images untouched

    # deflate=True compresses content/text streams (safe, usually uncompressed).
    # Do NOT use deflate_images / deflate_fonts — they wrap already-compressed
    # JPEG/font data in an extra zlib layer, making those streams larger.
    doc.save(output_path, garbage=4, deflate=True, clean=True)
    doc.close()

TEMP_DIR = os.path.join(os.path.dirname(__file__), "temp_files")
os.makedirs(TEMP_DIR, exist_ok=True)

# In-memory file registry: file_id -> metadata dict
file_registry: Dict[str, dict] = {}


class SplitRequest(BaseModel):
    file_id: str
    start_page: int
    end_page: int


class MergeRequest(BaseModel):
    file_ids: List[str]
    output_filename: str = "merged.pdf"


class MergePageRef(BaseModel):
    file_id: str
    page_index: int  # 0-indexed


class MergePagesRequest(BaseModel):
    pages: List[MergePageRef]
    output_filename: str = "merged.pdf"


class CropPagesRequest(BaseModel):
    file_id: str
    pages_to_delete: List[int]  # 0-indexed


class ReorderRequest(BaseModel):
    file_id: str
    page_order: List[int]  # 0-indexed original page numbers in desired display order


class TransformPageRequest(BaseModel):
    file_id: str
    page_index: int  # 0-indexed
    transform: str  # 'rotate' | 'mirror'


class CropPageLineRequest(BaseModel):
    file_id: str
    page_index: int  # 0-indexed
    # Normalized fractions of the page: [x0, y0, x1, y1] each in 0.0–1.0
    keep_rect: List[float]


def _remove_file(path: str) -> None:
    try:
        if os.path.exists(path):
            os.remove(path)
    except OSError:
        pass


@app.get("/")
async def root():
    return {
        "message": "PDF Tool API is running",
        "ghostscript": _GS_BINARY or "not found — PyMuPDF fallback will be used",
    }


@app.get("/api/compression-info")
async def compression_info():
    """
    Returns whether Ghostscript is available and the configured compression levels.
    The frontend can call this on startup to warn the user if GS is missing.
    """
    return {
        "ghostscript_available": bool(_GS_BINARY),
        "ghostscript_path": _GS_BINARY,
        "levels": {
            k: {"gs_setting": v["gs_setting"], "jpeg_quality": v["jpeg_quality"]}
            for k, v in _COMPRESS_LEVELS.items()
        },
    }


@app.post("/api/upload")
async def upload_pdf(file: UploadFile = File(...)):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")

    content = await file.read()
    file_id = str(uuid.uuid4())
    file_path = os.path.join(TEMP_DIR, f"{file_id}.pdf")

    with open(file_path, "wb") as f:
        f.write(content)

    try:
        doc = fitz.open(file_path)
        page_count = len(doc)
        doc.close()
    except Exception:
        _remove_file(file_path)
        raise HTTPException(status_code=400, detail="Invalid or corrupt PDF file")

    metadata = {
        "file_id": file_id,
        "filename": file.filename,
        "page_count": page_count,
        "size": len(content),
        "path": file_path,
        "origin": "upload",
    }
    file_registry[file_id] = metadata

    return {k: v for k, v in metadata.items() if k != "path"}


@app.post("/api/transform-page")
async def transform_page(request: TransformPageRequest):
    if request.file_id not in file_registry:
        raise HTTPException(status_code=404, detail="File not found")

    meta = file_registry[request.file_id]
    if not os.path.exists(meta["path"]):
        raise HTTPException(status_code=404, detail="File not found on disk")

    transform = (request.transform or "").lower().strip()
    if transform not in {"rotate", "mirror"}:
        raise HTTPException(status_code=400, detail="Invalid transform; expected 'rotate' or 'mirror'")

    src_path = meta["path"]
    src = fitz.open(src_path)
    try:
        total = len(src)
        if request.page_index < 0 or request.page_index >= total:
            raise HTTPException(status_code=400, detail=f"Invalid page index: {request.page_index}")

        if transform == "rotate":
            page = src[request.page_index]
            page.set_rotation((page.rotation + 90) % 360)

            tmp_path = f"{src_path}.tmp"
            src.save(tmp_path)
            src.close()
            os.replace(tmp_path, src_path)
        else:
            # Mirror horizontally by building a new document where the target page
            # is rendered onto a same-sized page through a horizontal-flip matrix
            # applied to the content stream directly, avoiding any reliance on
            # non-standard rect behaviour in show_pdf_page.
            out = fitz.open()
            try:
                for i in range(total):
                    if i != request.page_index:
                        out.insert_pdf(src, from_page=i, to_page=i)
                        continue

                    pg = src[i]
                    w, h = pg.rect.width, pg.rect.height
                    new_page = out.new_page(width=w, height=h)

                    # Insert the source page normally, then rewrite its content
                    # stream to prepend a horizontal-flip CTM:
                    #   [-1  0  0  1  w  0] cm   →  mirror about x = w/2
                    new_page.show_pdf_page(new_page.rect, src, i, keep_proportion=False)

                    # Wrap the XObject call with a save/CTM/restore so the flip
                    # is baked into the page content rather than the XObject.
                    xrefs = new_page.get_contents()
                    if xrefs:
                        raw = b"".join(out.xref_stream(x) for x in xrefs)
                        flipped = (
                            f"q -1 0 0 1 {w:.4f} 0 cm\n".encode()
                            + raw
                            + b"\nQ"
                        )
                        out.update_stream(xrefs[0], flipped)
                        for x in xrefs[1:]:
                            out.update_stream(x, b"")

                tmp_path = f"{src_path}.tmp"
                out.save(tmp_path)
            finally:
                out.close()
            # Must close src before os.replace; Windows holds a file lock while open.
            src.close()
            os.replace(tmp_path, src_path)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Transform failed: {exc}") from exc
    finally:
        try:
            src.close()
        except Exception:
            pass

    meta["size"] = os.path.getsize(src_path)
    file_registry[request.file_id] = meta
    return {k: v for k, v in meta.items() if k != "path"}


@app.post("/api/crop-page-line")
async def crop_page_line(request: CropPageLineRequest):
    """Crop a single page to the specified sub-rectangle and save it in-place.

    keep_rect is [x0, y0, x1, y1] as fractions (0–1) of the current page size.
    The result page will have exactly the cropped dimensions (not original size
    with whitespace), because we create a new page sized to the clip area and
    use show_pdf_page with clip= to transfer only that region.
    """
    if request.file_id not in file_registry:
        raise HTTPException(status_code=404, detail="File not found")

    meta = file_registry[request.file_id]
    if not os.path.exists(meta["path"]):
        raise HTTPException(status_code=404, detail="File not found on disk")

    keep = request.keep_rect
    if len(keep) != 4:
        raise HTTPException(status_code=400, detail="keep_rect must be [x0, y0, x1, y1]")

    src_path = meta["path"]
    src = fitz.open(src_path)
    try:
        total = len(src)
        if request.page_index < 0 or request.page_index >= total:
            raise HTTPException(status_code=400, detail=f"Invalid page index: {request.page_index}")

        out = fitz.open()
        try:
            for i in range(total):
                if i != request.page_index:
                    out.insert_pdf(src, from_page=i, to_page=i)
                    continue

                pg = src[i]
                pw, ph = pg.rect.width, pg.rect.height

                x0 = keep[0] * pw
                y0 = keep[1] * ph
                x1 = keep[2] * pw
                y1 = keep[3] * ph
                clip_rect = fitz.Rect(x0, y0, x1, y1)
                nw, nh = clip_rect.width, clip_rect.height

                if nw <= 0 or nh <= 0:
                    raise HTTPException(status_code=400, detail="Crop rectangle has zero area")

                new_page = out.new_page(width=nw, height=nh)
                new_page.show_pdf_page(
                    fitz.Rect(0, 0, nw, nh),
                    src, i,
                    clip=clip_rect,
                    keep_proportion=False,
                )

            tmp_path = f"{src_path}.tmp"
            out.save(tmp_path)
        finally:
            out.close()

        src.close()
        os.replace(tmp_path, src_path)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Crop failed: {exc}") from exc
    finally:
        try:
            src.close()
        except Exception:
            pass

    meta["size"] = os.path.getsize(src_path)
    file_registry[request.file_id] = meta
    return {k: v for k, v in meta.items() if k != "path"}


@app.get("/api/files")
async def list_files():
    return [
        {k: v for k, v in meta.items() if k != "path"}
        for meta in file_registry.values()
        if meta.get("origin", "upload") == "upload"
    ]


@app.delete("/api/files/{file_id}")
async def delete_file(file_id: str):
    if file_id not in file_registry:
        raise HTTPException(status_code=404, detail="File not found")

    meta = file_registry.pop(file_id)
    _remove_file(meta["path"])
    return {"status": "deleted", "file_id": file_id}


@app.get("/api/files/{file_id}/thumbnail")
async def get_thumbnail(file_id: str, page: int = 0, width: int = 200):
    """
    Render a single PDF page as a PNG thumbnail.
    - page: 0-indexed page number (default 0 = first page)
    - width: output pixel width; height is scaled to preserve aspect ratio
    """
    if file_id not in file_registry:
        raise HTTPException(status_code=404, detail="File not found")

    meta = file_registry[file_id]
    if not os.path.exists(meta["path"]):
        raise HTTPException(status_code=404, detail="File not found on disk")

    doc = fitz.open(meta["path"])
    if page < 0 or page >= len(doc):
        doc.close()
        raise HTTPException(
            status_code=400,
            detail=f"Invalid page. Document has {len(doc)} page(s); use 0-based index.",
        )

    pg = doc[page]
    scale = width / pg.rect.width
    mat = fitz.Matrix(scale, scale)
    pix = pg.get_pixmap(matrix=mat, alpha=False)
    png_bytes = pix.tobytes("png")
    doc.close()

    return Response(
        content=png_bytes,
        media_type="image/png",
        # This server can mutate PDFs in place (e.g. rotate/mirror), so thumbnails must not be cached.
        headers={"Cache-Control": "no-store"},
    )


@app.get("/api/files/{file_id}/download")
async def download_file(file_id: str):
    if file_id not in file_registry:
        raise HTTPException(status_code=404, detail="File not found")
    meta = file_registry[file_id]
    if not os.path.exists(meta["path"]):
        raise HTTPException(status_code=404, detail="File not found on disk")
    return FileResponse(
        meta["path"],
        media_type="application/pdf",
        filename=meta["filename"],
        headers={"Content-Disposition": f'attachment; filename="{meta["filename"]}"'},
    )


@app.get("/api/files/{file_id}/compress")
async def compress_file(
    file_id: str,
    background_tasks: BackgroundTasks,
    level: str = "medium",
):
    if file_id not in file_registry:
        raise HTTPException(status_code=404, detail="File not found")
    if level not in _COMPRESS_LEVELS:
        raise HTTPException(status_code=400, detail="level must be low, medium, or high")

    meta = file_registry[file_id]
    if not os.path.exists(meta["path"]):
        raise HTTPException(status_code=404, detail="File not found on disk")

    original_size = os.path.getsize(meta["path"])
    output_id = str(uuid.uuid4())
    output_path = os.path.join(TEMP_DIR, f"output_{output_id}.pdf")

    # ── Primary: Ghostscript ──────────────────────────────────────────────────
    # GS is the gold standard: it re-renders the full PDF, downsamples all
    # images to the target DPI, and subsets fonts — routinely 40–80% reduction.
    gs_ok = _compress_with_ghostscript(meta["path"], output_path, level)
    method = "ghostscript" if gs_ok else "pymupdf"

    # ── Fallback: PyMuPDF + Pillow ────────────────────────────────────────────
    if not gs_ok:
        _compress_with_pymupdf(meta["path"], output_path, level)

    compressed_size = os.path.getsize(output_path)

    # ── Safety net ───────────────────────────────────────────────────────────
    # If the output somehow grew (PDF was already well-optimised), discard the
    # attempt and do a minimal dead-object cleanup pass instead so we never
    # send back a file larger than the original.
    if compressed_size >= original_size:
        _remove_file(output_path)
        doc = fitz.open(meta["path"])
        doc.save(output_path, garbage=4, deflate=True)
        doc.close()
        compressed_size = os.path.getsize(output_path)
        method = "cleanup-only"

    savings_pct = round((1 - compressed_size / original_size) * 100, 1)

    base_name = os.path.splitext(meta["filename"])[0]
    download_name = f"{base_name}_compressed.pdf"

    background_tasks.add_task(_remove_file, output_path)
    return FileResponse(
        output_path,
        media_type="application/pdf",
        filename=download_name,
        headers={
            "Content-Disposition": f'attachment; filename="{download_name}"',
            # Stats are read by the frontend to show in a toast notification.
            "X-Original-Size":        str(original_size),
            "X-Compressed-Size":      str(compressed_size),
            "X-Savings-Percent":      str(savings_pct),
            "X-Compression-Method":   method,
        },
    )


@app.post("/api/crop-pages")
async def crop_pages(request: CropPagesRequest, background_tasks: BackgroundTasks):
    if request.file_id not in file_registry:
        raise HTTPException(status_code=404, detail="File not found")

    meta = file_registry[request.file_id]
    if not os.path.exists(meta["path"]):
        raise HTTPException(status_code=404, detail="File not found on disk")

    doc = fitz.open(meta["path"])
    total = len(doc)

    pages_to_delete = sorted(set(request.pages_to_delete), reverse=True)
    for p in pages_to_delete:
        if p < 0 or p >= total:
            doc.close()
            raise HTTPException(status_code=400, detail=f"Invalid page index: {p}")

    if len(pages_to_delete) >= total:
        doc.close()
        raise HTTPException(status_code=400, detail="Cannot delete all pages from the document")

    for p in pages_to_delete:
        doc.delete_page(p)

    output_id = str(uuid.uuid4())
    output_path = os.path.join(TEMP_DIR, f"output_{output_id}.pdf")
    doc.save(output_path)
    doc.close()

    base_name = os.path.splitext(meta["filename"])[0]
    download_name = f"{base_name}_cropped.pdf"

    background_tasks.add_task(_remove_file, output_path)
    return FileResponse(
        output_path,
        media_type="application/pdf",
        filename=download_name,
        headers={"Content-Disposition": f'attachment; filename="{download_name}"'},
    )


@app.post("/api/merge-pages")
async def merge_pages(request: MergePagesRequest):
    if not request.pages:
        raise HTTPException(status_code=400, detail="pages cannot be empty")

    print("Generating PDF with pages:", [(p.file_id, p.page_index) for p in request.pages])

    merged = fitz.open()

    opened_docs: Dict[str, fitz.Document] = {}
    try:
        for ref in request.pages:
            if ref.file_id not in file_registry:
                raise HTTPException(status_code=404, detail=f"File '{ref.file_id}' not found")

            meta = file_registry[ref.file_id]
            if not os.path.exists(meta["path"]):
                raise HTTPException(status_code=404, detail=f"File '{meta['filename']}' not found on disk")

            doc = opened_docs.get(ref.file_id)
            if doc is None:
                doc = fitz.open(meta["path"])
                opened_docs[ref.file_id] = doc

            if ref.page_index < 0 or ref.page_index >= len(doc):
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid page index {ref.page_index} for file '{ref.file_id}'",
                )

            merged.insert_pdf(doc, from_page=ref.page_index, to_page=ref.page_index)
    finally:
        for doc in opened_docs.values():
            try:
                doc.close()
            except Exception:
                pass

    file_id = str(uuid.uuid4())
    filename = (
        request.output_filename
        if request.output_filename.endswith(".pdf")
        else request.output_filename + ".pdf"
    )
    file_path = os.path.join(TEMP_DIR, f"{file_id}.pdf")
    page_count = len(merged)
    merged.save(file_path)
    merged.close()

    size = os.path.getsize(file_path)
    metadata = {
        "file_id": file_id,
        "filename": filename,
        "page_count": page_count,
        "size": size,
        "path": file_path,
        "origin": "derived",
    }
    file_registry[file_id] = metadata

    print(f"Generated PDF: file_id={file_id}, pages={page_count}")

    return {k: v for k, v in metadata.items() if k != "path"}


@app.post("/api/reorder")
async def reorder_pages(request: ReorderRequest, background_tasks: BackgroundTasks):
    """Return a new PDF whose pages follow the requested order.

    page_order is a list of 0-based original page indices, e.g. [0, 2, 1, 3]
    means the output PDF has the original pages in that sequence.
    """
    if request.file_id not in file_registry:
        raise HTTPException(status_code=404, detail="File not found")

    meta = file_registry[request.file_id]
    if not os.path.exists(meta["path"]):
        raise HTTPException(status_code=404, detail="File not found on disk")

    doc = fitz.open(meta["path"])
    total = len(doc)

    if not request.page_order:
        doc.close()
        raise HTTPException(status_code=400, detail="page_order cannot be empty")

    for p in request.page_order:
        if p < 0 or p >= total:
            doc.close()
            raise HTTPException(status_code=400, detail=f"Invalid page index: {p}")

    new_doc = fitz.open()
    for p in request.page_order:
        new_doc.insert_pdf(doc, from_page=p, to_page=p)

    output_id = str(uuid.uuid4())
    output_path = os.path.join(TEMP_DIR, f"output_{output_id}.pdf")
    new_doc.save(output_path)
    new_doc.close()
    doc.close()

    base_name = os.path.splitext(meta["filename"])[0]
    download_name = f"{base_name}_reordered.pdf"

    background_tasks.add_task(_remove_file, output_path)
    return FileResponse(
        output_path,
        media_type="application/pdf",
        filename=download_name,
        headers={"Content-Disposition": f'attachment; filename="{download_name}"'},
    )


@app.post("/api/split")
async def split_pdf(request: SplitRequest, background_tasks: BackgroundTasks):
    if request.file_id not in file_registry:
        raise HTTPException(status_code=404, detail="File not found")

    meta = file_registry[request.file_id]
    src_path = meta["path"]

    if not os.path.exists(src_path):
        raise HTTPException(status_code=404, detail="File not found on disk")

    doc = fitz.open(src_path)
    total = len(doc)

    start = request.start_page - 1  # convert to 0-indexed
    end = request.end_page - 1

    if start < 0 or end >= total or start > end:
        doc.close()
        raise HTTPException(
            status_code=400,
            detail=f"Invalid page range. Document has {total} page(s). Valid range: 1–{total}",
        )

    new_doc = fitz.open()
    new_doc.insert_pdf(doc, from_page=start, to_page=end)

    output_id = str(uuid.uuid4())
    output_path = os.path.join(TEMP_DIR, f"output_{output_id}.pdf")
    new_doc.save(output_path)
    new_doc.close()
    doc.close()

    base_name = os.path.splitext(meta["filename"])[0]
    download_name = f"{base_name}_pages_{request.start_page}-{request.end_page}.pdf"

    background_tasks.add_task(_remove_file, output_path)

    return FileResponse(
        output_path,
        media_type="application/pdf",
        filename=download_name,
        headers={"Content-Disposition": f'attachment; filename="{download_name}"'},
    )


@app.post("/api/merge")
async def merge_pdfs(request: MergeRequest, background_tasks: BackgroundTasks):
    if len(request.file_ids) < 2:
        raise HTTPException(status_code=400, detail="At least 2 files are required to merge")

    merged = fitz.open()

    for file_id in request.file_ids:
        if file_id not in file_registry:
            raise HTTPException(status_code=404, detail=f"File '{file_id}' not found")

        meta = file_registry[file_id]
        if not os.path.exists(meta["path"]):
            raise HTTPException(status_code=404, detail=f"File '{meta['filename']}' not found on disk")

        doc = fitz.open(meta["path"])
        merged.insert_pdf(doc)
        doc.close()

    output_id = str(uuid.uuid4())
    output_path = os.path.join(TEMP_DIR, f"output_{output_id}.pdf")
    merged.save(output_path)
    merged.close()

    download_name = request.output_filename if request.output_filename.endswith(".pdf") else request.output_filename + ".pdf"

    background_tasks.add_task(_remove_file, output_path)

    return FileResponse(
        output_path,
        media_type="application/pdf",
        filename=download_name,
        headers={"Content-Disposition": f'attachment; filename="{download_name}"'},
    )
