from sentence_transformers import SentenceTransformer


MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"

_model = None


def get_model() -> SentenceTransformer:
    """
    Load the embedding model once and reuse it.
    """

    global _model

    if _model is None:
        _model = SentenceTransformer(MODEL_NAME)

    return _model


def generate_embeddings(texts: list[str]) -> list[list[float]]:
    """
    Generate embeddings for multiple texts in one batch.

    Returns:
        A list of 384-dimensional vectors.
    """

    if not texts:
        return []

    model = get_model()

    embeddings = model.encode(
        texts,
        batch_size=32,
        show_progress_bar=False,
        normalize_embeddings=True,
    )

    return embeddings.tolist()