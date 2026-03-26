import os
import uuid
from typing import Dict, List

import fitz  # PyMuPDF
from fastapi import BackgroundTasks, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel

app = FastAPI(title="PDF Tool API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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


def _remove_file(path: str) -> None:
    try:
        if os.path.exists(path):
            os.remove(path)
    except OSError:
        pass


@app.get("/")
async def root():
    return {"message": "PDF Tool API is running"}


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
    }
    file_registry[file_id] = metadata

    return {k: v for k, v in metadata.items() if k != "path"}


@app.get("/api/files")
async def list_files():
    return [
        {k: v for k, v in meta.items() if k != "path"}
        for meta in file_registry.values()
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
        # Allow browser/CDN caching for 1 hour; file content is immutable per file_id+page
        headers={"Cache-Control": "public, max-age=3600"},
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
