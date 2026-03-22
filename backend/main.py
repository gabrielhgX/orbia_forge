import os
import uuid
from typing import Dict, List

import fitz  # PyMuPDF
from fastapi import BackgroundTasks, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
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
