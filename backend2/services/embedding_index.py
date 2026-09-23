from services.embeddings import generate_embeddings


def build_embedding_index(
    tree: dict,
    content_store: dict,
) -> dict:
    """
    Build a separate hierarchical embedding index.

    The embedding index contains:
        - id
        - title
        - type
        - parent_id
        - children
        - embedding

    It DOES NOT contain legal text.
    """

    searchable_nodes = []

    def collect_nodes(node: dict):
        node_id = node["id"]

        if node_id in content_store:
            searchable_nodes.append(node)

        for child in node.get("children", []):
            collect_nodes(child)

    collect_nodes(tree)

    # ---------------------------------------------------------
    # Collect text in the exact same order as the nodes.
    # ---------------------------------------------------------

    texts = [
        content_store[node["id"]]["text"]
        for node in searchable_nodes
    ]

    # ---------------------------------------------------------
    # Generate all embeddings in one batch.
    # ---------------------------------------------------------

    embeddings = generate_embeddings(texts)

    embedding_by_id = {
        node["id"]: embedding
        for node, embedding in zip(
            searchable_nodes,
            embeddings,
        )
    }

    # ---------------------------------------------------------
    # Rebuild a separate tree containing only index data.
    # ---------------------------------------------------------

    def create_index_node(
        node: dict,
        parent_id: str | None,
    ) -> dict:

        node_id = node["id"]

        index_node = {
            "id": node_id,
            "title": node["title"],
            "type": node["type"],
            "parent_id": parent_id,
            "children": [],
        }

        if node_id in embedding_by_id:
            index_node["embedding"] = embedding_by_id[node_id]

        for child in node.get("children", []):
            index_node["children"].append(
                create_index_node(
                    child,
                    node_id,
                )
            )

        return index_node

    return create_index_node(
        tree,
        None,
    )