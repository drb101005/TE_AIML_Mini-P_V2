from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from services.pdf_parser import extract_pdf_pages
from services.tree_builder import build_document_structure
from services.embedding_index import build_embedding_index
from services.retriever import search


# ============================================================
# APP
# ============================================================

app = FastAPI(
    title="Legal RAG Backend",
    description="Structure-aware legal document retrieval system",
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# IN-MEMORY STORAGE
# ============================================================

embedding_indexes = {}
content_stores = {}


# ============================================================
# REQUEST MODELS
# ============================================================

class QueryRequest(BaseModel):
    query: str
    top_k: int = 5


# ============================================================
# HEALTH CHECK
# ============================================================

@app.get("/")
def health_check():
    return {
        "status": "ok",
        "service": "Legal RAG Backend",
    }


# ============================================================
# STEP 1: RAW PDF EXTRACTION
# ============================================================

@app.post("/upload")
async def upload_pdf(file: UploadFile = File(...)):

    if file.content_type != "application/pdf":
        raise HTTPException(
            status_code=400,
            detail="Only PDF files are allowed.",
        )

    file_bytes = await file.read()

    try:
        pages = extract_pdf_pages(file_bytes)

    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to process PDF: {str(exc)}",
        )

    return {
        "filename": file.filename,
        "page_count": len(pages),
        "pages": pages,
    }


# ============================================================
# STEP 2: PDF → HIERARCHICAL STRUCTURE
# ============================================================

@app.post("/upload/structure")
async def upload_structure(file: UploadFile = File(...)):

    if file.content_type != "application/pdf":
        raise HTTPException(
            status_code=400,
            detail="Only PDF files are allowed.",
        )

    file_bytes = await file.read()

    try:
        pages = extract_pdf_pages(file_bytes)

        structure = build_document_structure(
            pages=pages,
            filename=file.filename or "document.pdf",
        )

    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to process document: {str(exc)}",
        )

    return structure


# ============================================================
# STEP 3: PDF → EMBEDDING INDEX + CONTENT STORE
# ============================================================

@app.post("/upload/embeddings")
async def upload_embeddings(file: UploadFile = File(...)):

    if file.content_type != "application/pdf":
        raise HTTPException(
            status_code=400,
            detail="Only PDF files are allowed.",
        )

    file_bytes = await file.read()

    try:
        # --------------------------------------------
        # Extract pages
        # --------------------------------------------

        pages = extract_pdf_pages(file_bytes)

        # --------------------------------------------
        # Build document structure
        # --------------------------------------------

        structure = build_document_structure(
            pages=pages,
            filename=file.filename or "document.pdf",
        )

        # --------------------------------------------
        # Build embedding index
        # --------------------------------------------

        embedding_index = build_embedding_index(
            tree=structure["tree"],
            content_store=structure["content_store"],
        )

    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to build embedding index: {str(exc)}",
        )

    # --------------------------------------------
    # Store separately
    # --------------------------------------------

    embedding_indexes["current"] = embedding_index

    content_stores["current"] = structure["content_store"]

    return {
        "filename": file.filename,
        "status": "indexed",
        "embedding_dimensions": 384,
        "searchable_nodes": len(
            structure["content_store"]
        ),
    }


# ============================================================
# STEP 4: SEMANTIC QUERY
# ============================================================

@app.post("/query")
async def query_document(request: QueryRequest):

    # --------------------------------------------
    # Check index
    # --------------------------------------------

    if "current" not in embedding_indexes:
        raise HTTPException(
            status_code=400,
            detail="No document has been indexed yet.",
        )

    # --------------------------------------------
    # Validate query
    # --------------------------------------------

    if not request.query.strip():
        raise HTTPException(
            status_code=400,
            detail="Query cannot be empty.",
        )

    if request.top_k < 1:
        raise HTTPException(
            status_code=400,
            detail="top_k must be at least 1.",
        )

    # --------------------------------------------
    # Search
    # --------------------------------------------

    results = search(
        query=request.query,
        embedding_index=embedding_indexes["current"],
        content_store=content_stores["current"],
        top_k=request.top_k,
    )

    return {
        "query": request.query,
        "results": results,
    }


# ============================================================
# DEBUG: INSPECT ONE NODE'S EMBEDDING
# ============================================================

@app.get("/debug/embedding/{node_id}")
async def debug_embedding(node_id: str):

    if "current" not in embedding_indexes:
        raise HTTPException(
            status_code=400,
            detail="No document has been indexed yet.",
        )

    def find_node(node: dict):

        if node["id"] == node_id:
            return node

        for child in node.get("children", []):
            result = find_node(child)

            if result:
                return result

        return None

    node = find_node(
        embedding_indexes["current"]
    )

    if node is None:
        raise HTTPException(
            status_code=404,
            detail=f"Node {node_id} not found.",
        )

    embedding = node.get("embedding")

    if embedding is None:
        raise HTTPException(
            status_code=404,
            detail=f"Node {node_id} has no embedding.",
        )

    return {
        "id": node["id"],
        "title": node["title"],
        "dimensions": len(embedding),
        "embedding": embedding,
    }