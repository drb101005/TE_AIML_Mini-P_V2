import fitz


def extract_pdf_pages(file_bytes: bytes) -> list[dict]:
    """
    Extract text from a PDF page by page.

    Returns:
        [
            {
                "page": 1,
                "text": "..."
            },
            ...
        ]
    """

    document = fitz.open(stream=file_bytes, filetype="pdf")

    pages = []

    try:
        for page_number, page in enumerate(document, start=1):
            text = page.get_text("text").strip()

            pages.append({
                "page": page_number,
                "text": text,
            })
    finally:
        document.close()

    return pages