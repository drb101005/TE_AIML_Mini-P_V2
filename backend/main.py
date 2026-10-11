from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import numpy as np
from copy import deepcopy
from uuid import uuid4
from difflib import SequenceMatcher
import re

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
corpus_state = None


# ============================================================
# REQUEST MODELS
# ============================================================

class QueryRequest(BaseModel):
    query: str
    top_k: int = 5


class RelationshipReview(BaseModel):
    status: str


def _walk_tree(node: dict):
    yield node
    for child in node.get("children", []):
        yield from _walk_tree(child)


def _public_corpus():
    if corpus_state is None:
        return None
    return {key: corpus_state[key] for key in ("tree", "content_store", "relationships", "documents")}


def _build_semantic_links(index_tree: dict, content_store: dict, existing: list[dict]) -> list[dict]:
    section_nodes = [
        node for node in _walk_tree(index_tree)
        if "embedding" in node and node["id"] in content_store
    ]
    if len(section_nodes) < 2:
        return []

    vectors = np.asarray([node["embedding"] for node in section_nodes], dtype=np.float32)
    document_ids = [content_store[node["id"]].get("document_id") for node in section_nodes]
    existing_pairs = {
        tuple(sorted((link["source_id"], link["target_id"])))
        for link in existing
    }
    candidates = {}
    block_size = 32
    for start in range(0, len(section_nodes), block_size):
        similarities = vectors[start:start + block_size] @ vectors.T
        for offset, scores in enumerate(similarities):
            source_index = start + offset
            source_id = section_nodes[source_index]["id"]
            ranked = np.argsort(scores)[::-1]
            kept = 0
            for target_index in ranked:
                if target_index == source_index or document_ids[target_index] == document_ids[source_index]:
                    continue
                target_id = section_nodes[target_index]["id"]
                if scores[target_index] < 0.72:
                    break
                pair = tuple(sorted((source_id, target_id)))
                if pair in existing_pairs:
                    continue
                candidates[pair] = max(float(scores[target_index]), candidates.get(pair, 0.0))
                kept += 1
                if kept == 2:
                    break

    links = []
    for (source_id, target_id), score in candidates.items():
        source = content_store[source_id]
        target = content_store[target_id]
        evidence = source["text"][:1200]
        relation_type = _infer_relationship(evidence)
        links.append({
            "id": f"semantic-{source_id}-{target_id}",
            "source_id": source_id,
            "target_id": target_id,
            "type": relation_type or "semantic_similarity",
            "confidence": score,
            "evidence": evidence,
            "target_evidence": target["text"][:1200],
            "page": source["page_start"],
            "status": "pending",
            "suggested": True,
        })
    return links


def _infer_relationship(text: str) -> str | None:
    patterns = [
        (r"\b(shall not|must not|is prohibited|prohibits?)\b", "prohibits"),
        (r"\b(amends?|amended|amending|substitutes?|repeals?)\b", "amends"),
        (r"\b(means|defined as|definition of|shall mean)\b", "defines"),
        (r"\b(except|exception|notwithstanding|does not apply)\b", "exception_to"),
        (r"\b(shall|must|is required to|oblig(?:es|ation))\b", "sets_obligation"),
    ]
    for pattern, relation in patterns:
        if re.search(pattern, text, re.IGNORECASE):
            return relation
    return None


async def _index_corpus(files: list[UploadFile]) -> dict:
    global corpus_state
    if not files:
        raise HTTPException(status_code=400, detail="Choose at least one supported document.")
    previous = corpus_state
    documents = list(previous["documents"]) if previous else []
    if len(documents) + len(files) > 100:
        raise HTTPException(status_code=400, detail="A collection can contain up to 100 documents.")

    collection = deepcopy(previous["tree"]) if previous else {"id": "corpus", "title": "Document collection", "type": "collection", "parent_id": None, "children": []}
    combined_content = dict(previous["content_store"]) if previous else {}
    relationships = [
        link for link in previous["relationships"]
        if not link["id"].startswith("cross-ref-")
    ] if previous else []
    mentions = list(previous["reference_mentions"]) if previous else []

    for file in files:
        filename = file.filename or "document"
        extension = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""
        if extension not in {"pdf", "docx", "txt"}:
            raise HTTPException(status_code=400, detail=f"{filename} is not a supported PDF, DOCX, or TXT file.")
        file_bytes = await file.read()
        try:
            if extension == "pdf":
                pages = extract_pdf_pages(file_bytes, ocr=True)
            elif extension == "docx":
                from docx import Document
                import io
                doc = Document(io.BytesIO(file_bytes))
                pages = [{"page": 1, "text": "\n".join(p.text for p in doc.paragraphs if p.text.strip())}]
            else:
                pages = [{"page": 1, "text": file_bytes.decode("utf-8-sig")}]
            document_id = uuid4().hex
            structure = build_document_structure(
                pages=pages,
                filename=file.filename or "document.pdf",
                document_id=document_id,
            )
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Failed to process {filename}: {exc}")
        collection["children"].append(structure["tree"])
        combined_content.update(structure["content_store"])
        relationships.extend(structure["relationships"])
        mentions.extend(structure["reference_mentions"])
        documents.append({"id": document_id, "filename": filename, "size_bytes": len(file_bytes), "sections": len(structure["content_store"])})

    # Connect citations across files only when the referenced section number has one clear target.
    sections_by_number = {}
    for node_id, content in combined_content.items():
        sections_by_number.setdefault(content["section_number"].upper(), []).append((node_id, content))
    existing_mentions = {(link["source_id"], link["target_id"]) for link in relationships}
    for mention in mentions:
        source = combined_content[mention["source_id"]]
        local_targets = [node_id for node_id, content in sections_by_number.get(mention["section_number"], []) if content["document_id"] == source["document_id"]]
        if local_targets:
            continue
        targets = [(node_id, content) for node_id, content in sections_by_number.get(mention["section_number"], []) if content["document_id"] != source["document_id"]]
        if not targets:
            continue
        ambiguous = len(targets) > 1
        for target_id, _ in targets:
            pair = (mention["source_id"], target_id)
            if pair in existing_mentions:
                continue
            existing_mentions.add(pair)
            relationships.append({
                "id": f"cross-ref-{mention['source_id']}-{target_id}-{len(relationships)}",
                "source_id": mention["source_id"],
                "target_id": target_id,
                "type": "ambiguous_reference" if ambiguous else "explicit_reference",
                "confidence": None if ambiguous else 1.0,
                "evidence": mention["evidence"],
                "page": mention["page"],
            })

    index = build_embedding_index(collection, combined_content)
    relationships.extend(_build_semantic_links(index, combined_content, relationships))
    for link in relationships:
        link["source_filename"] = combined_content[link["source_id"]]["filename"]
        link["target_filename"] = combined_content[link["target_id"]]["filename"]
        if link["type"] == "explicit_reference":
            inferred = _infer_relationship(link.get("evidence", ""))
            if inferred:
                link["type"] = inferred
        link.setdefault("status", "confirmed" if link["type"] == "explicit_reference" else "pending")
    embedding_indexes["current"] = index
    content_stores["current"] = combined_content
    corpus_state = {
        "tree": collection,
        "content_store": combined_content,
        "relationships": relationships,
        "documents": documents,
        "reference_mentions": mentions,
    }
    return _public_corpus()


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
        "section_relationships": len(structure["relationships"]),
    }


@app.post("/corpus/upload")
async def upload_corpus(files: list[UploadFile] = File(...)):
    return await _index_corpus(files)


@app.get("/corpus")
async def get_corpus():
    return _public_corpus()


@app.delete("/corpus")
async def clear_corpus():
    global corpus_state
    corpus_state = None
    embedding_indexes.pop("current", None)
    content_stores.pop("current", None)
    return {"status": "cleared"}


@app.patch("/relationships/{relationship_id}")
async def review_relationship(relationship_id: str, review: RelationshipReview):
    if review.status not in {"confirmed", "rejected"}:
        raise HTTPException(status_code=400, detail="Status must be confirmed or rejected.")
    if corpus_state is None:
        raise HTTPException(status_code=404, detail="No collection is indexed.")
    for link in corpus_state["relationships"]:
        if link["id"] == relationship_id:
            link["status"] = review.status
            return link
    raise HTTPException(status_code=404, detail="Relationship not found.")


@app.post("/compare")
async def compare_versions(payload: dict):
    if corpus_state is None:
        raise HTTPException(status_code=400, detail="Upload both document versions first.")
    before_id, after_id = payload.get("before_document_id"), payload.get("after_document_id")
    docs = {doc["id"]: doc for doc in corpus_state["documents"]}
    if before_id not in docs or after_id not in docs or before_id == after_id:
        raise HTTPException(status_code=400, detail="Select two different documents from the collection.")
    before = {c["section_number"].upper(): c for c in corpus_state["content_store"].values() if c.get("document_id") == before_id}
    after = {c["section_number"].upper(): c for c in corpus_state["content_store"].values() if c.get("document_id") == after_id}
    changes = []
    for number in sorted(set(before) | set(after)):
        old, new = before.get(number), after.get(number)
        if old is None:
            kind, ratio = "added", 0.0
        elif new is None:
            kind, ratio = "removed", 0.0
        else:
            ratio = SequenceMatcher(None, old["text"], new["text"]).ratio()
            if ratio >= 0.985:
                continue
            kind = "modified"
        node_ids = {record["node_id"] for record in (old, new) if record}
        connected = [link for link in corpus_state["relationships"] if link["source_id"] in node_ids or link["target_id"] in node_ids]
        changes.append({"section_number": number, "change": kind, "before": old, "after": new, "similarity": round(ratio, 3), "affected_relationships": connected})
    return {"before": docs[before_id], "after": docs[after_id], "changes": changes}


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

    answer_claims = []
    query_terms = {term.lower() for term in re.findall(r"[a-zA-Z0-9]{3,}", request.query)}
    stop_terms = {"what", "when", "where", "which", "does", "this", "that", "with", "from", "have", "into", "about", "under", "there", "their"}
    query_terms -= stop_terms
    for result in results[:5]:
        sentences = re.split(r"(?<=[.!?])\s+", result.get("text", "").strip())
        candidates = [sentence.strip() for sentence in sentences if len(sentence.strip()) > 25]
        claim = max(candidates, key=lambda sentence: len(query_terms & {term.lower() for term in re.findall(r"[a-zA-Z0-9]{3,}", sentence)}), default="")
        if claim:
            answer_claims.append({"text": claim, "source_id": result["id"], "filename": result.get("filename"), "section": result.get("title"), "page": result.get("page_start"), "similarity": result["similarity"]})
    return {
        "query": request.query,
        "results": results,
        "answer_claims": answer_claims,
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
