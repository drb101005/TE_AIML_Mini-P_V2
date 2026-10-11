import fitz


def extract_pdf_pages(file_bytes: bytes, ocr: bool = False) -> list[dict]:
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
            if ocr and len(text) < 24:
                try:
                    text = page.get_text("text", textpage=page.get_textpage_ocr()).strip()
                except Exception as exc:
                    raise RuntimeError(
                        "This PDF appears scanned, but OCR could not run. Install Tesseract and its language data, then retry."
                    ) from exc

            pages.append({
                "page": page_number,
                "text": text,
            })
    finally:
        document.close()

    return pages
