import numpy as np

from services.embeddings import generate_embeddings


def cosine_similarity(
    query_embedding: list[float],
    node_embedding: list[float],
) -> float:
    """
    Calculate cosine similarity between two vectors.

    Both vectors are already normalized by our embedding
    function, but we keep the explicit calculation here
    for clarity.
    """

    query = np.asarray(query_embedding, dtype=np.float32)
    node = np.asarray(node_embedding, dtype=np.float32)

    query_norm = np.linalg.norm(query)
    node_norm = np.linalg.norm(node)

    if query_norm == 0 or node_norm == 0:
        return 0.0

    return float(
        np.dot(query, node)
        / (query_norm * node_norm)
    )


def collect_embedded_nodes(tree: dict) -> list[dict]:
    """
    Traverse the embedding tree and collect nodes
    that contain an embedding.
    """

    nodes = []

    def walk(node: dict):
        if "embedding" in node:
            nodes.append(node)

        for child in node.get("children", []):
            walk(child)

    walk(tree)

    return nodes


def search(
    query: str,
    embedding_index: dict,
    content_store: dict,
    top_k: int = 5,
) -> list[dict]:
    """
    Semantic search over our custom hierarchical
    embedding index.

    Returns actual text from the separate content store.
    """

    if not query.strip():
        return []

    nodes = collect_embedded_nodes(embedding_index)

    if not nodes:
        return []

    # Generate the query embedding.
    query_embedding = generate_embeddings([query])[0]

    results = []

    for node in nodes:
        node_id = node["id"]

        similarity = cosine_similarity(
            query_embedding,
            node["embedding"],
        )

        content = content_store.get(node_id, {})

        results.append({
            "id": node_id,
            "title": node["title"],
            "type": node["type"],
            "parent_id": node["parent_id"],
            "similarity": similarity,
            "text": content.get("text", ""),
            "page_start": content.get("page_start"),
            "page_end": content.get("page_end"),
        })

    results.sort(
        key=lambda item: item["similarity"],
        reverse=True,
    )

    return results[:top_k]