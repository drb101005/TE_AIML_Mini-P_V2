import re


CHAPTER_PATTERN = re.compile(
    r"^Chapter\s+([IVXLCDM]+)\s*(.*)$",
    re.IGNORECASE,
)

SECTION_PATTERN = re.compile(
    r"^(\d+[A-Z]?(?:-[A-Z])?)\.\s+(.+)$"
)

SECTION_REFERENCE_PATTERN = re.compile(
    r"\bsections?\s+((?:\d+[A-Z]?(?:-[A-Z])?)(?:\s*(?:,|and|&)\s*\d+[A-Z]?(?:-[A-Z])?)*)",
    re.IGNORECASE,
)
REFERENCE_NUMBER_PATTERN = re.compile(r"\d+[A-Z]?(?:-[A-Z])?", re.IGNORECASE)


def create_node(
    node_id: str,
    title: str,
    node_type: str,
    parent_id: str | None,
):
    return {
        "id": node_id,
        "title": title.strip(),
        "type": node_type,
        "parent_id": parent_id,
        "children": [],
    }


def find_content_start(pages: list[dict]) -> int:
    """
    Find the first page of the actual Act.

    Our PDF has a table of contents before the actual document.
    The actual document begins with PREAMBLE.
    """

    for index, page in enumerate(pages):
        text = page["text"].upper()

        if "PREAMBLE" in text:
            return index

    # Fallback: if PREAMBLE is not found, start from page 1.
    return 0


def build_document_structure(
    pages: list[dict],
    filename: str,
    document_id: str | None = None,
):
    root_id = document_id or "document"
    document = create_node(
        node_id=root_id,
        title=filename,
        node_type="document",
        parent_id=None,
    )

    content_store = {}
    content_pages = {}
    relationships = []
    reference_mentions = []
    section_ids_by_number = {}

    current_parent = document
    current_section_id = None

    chapter_count = 0
    # ---------------------------------------------------------
    # Ignore the table of contents.
    # ---------------------------------------------------------

    start_index = find_content_start(pages)

    # ---------------------------------------------------------
    # Preliminary node
    # Sections 1 and 2 occur before Chapter I.
    # ---------------------------------------------------------

    preliminary = create_node(
        node_id=f"{root_id}-preliminary" if document_id else "preliminary",
        title="Preliminary",
        node_type="preliminary",
        parent_id=root_id,
    )

    document["children"].append(preliminary)
    current_parent = preliminary

    # ---------------------------------------------------------
    # Process actual document pages.
    # ---------------------------------------------------------

    for page in pages[start_index:]:
        page_number = page["page"]

        lines = [
            line.strip()
            for line in page["text"].splitlines()
            if line.strip()
        ]

        i = 0

        while i < len(lines):
            line = lines[i]

            # =================================================
            # CHAPTER
            # =================================================

            chapter_match = CHAPTER_PATTERN.match(line)

            if chapter_match:
                chapter_number = chapter_match.group(1)
                chapter_title = chapter_match.group(2).strip()

                chapter_count += 1

                chapter_id = f"{root_id}-chapter-{chapter_count}" if document_id else f"chapter-{chapter_count}"

                if chapter_title:
                    title = (
                        f"Chapter {chapter_number} - "
                        f"{chapter_title}"
                    )
                else:
                    title = f"Chapter {chapter_number}"

                chapter_node = create_node(
                    node_id=chapter_id,
                    title=title,
                    node_type="chapter",
                    parent_id=root_id,
                )

                document["children"].append(chapter_node)

                current_parent = chapter_node
                current_section_id = None

                i += 1
                continue

            # =================================================
            # SECTION
            #
            # Examples from this PDF:
            #
            # 1. Short title
            # 2. Interpretation -clause
            # 10. What agreements are contracts
            # 19-A. Power to set aside...
            # =================================================

            section_match = SECTION_PATTERN.match(line)

            if section_match:
                section_number = section_match.group(1)
                section_title = section_match.group(2).strip()

                normalized_number = section_number.upper()
                section_id = f"{root_id}-section-{normalized_number}" if document_id else f"section-{normalized_number}"
                section_ids_by_number[normalized_number] = section_id

                section_node = create_node(
                    node_id=section_id,
                    title=(
                        f"Section {section_number} - "
                        f"{section_title}"
                    ),
                    node_type="section",
                    parent_id=current_parent["id"],
                )

                current_parent["children"].append(section_node)

                content_store[section_id] = {
                    "node_id": section_id,
                    "document_id": document_id,
                    "filename": filename,
                    "section_number": section_number,
                    "title": section_title,
                    "text": "",
                    "page_start": page_number,
                    "page_end": page_number,
                }
                content_pages[section_id] = {}

                current_section_id = section_id

                i += 1
                continue

            # =================================================
            # SECTION CONTENT
            # =================================================

            if current_section_id is not None:
                content = content_store[current_section_id]

                if content["text"]:
                    content["text"] += " "

                content["text"] += line
                content["page_end"] = page_number
                content_pages[current_section_id].setdefault(page_number, []).append(line)

            i += 1

    # Resolve explicit section references after all section IDs are known.
    # Each link keeps its supporting sentence and source page.
    known_sections = set(content_store)
    for source_id, page_text in content_pages.items():
        for page_number, lines in page_text.items():
            page_content = " ".join(lines)
            for sentence in re.split(r"(?<=[.!?])\s+", page_content):
                for match in SECTION_REFERENCE_PATTERN.finditer(sentence):
                    for number in REFERENCE_NUMBER_PATTERN.findall(match.group(1)):
                        target_id = section_ids_by_number.get(number.upper())
                        reference_mentions.append({
                            "source_id": source_id,
                            "section_number": number.upper(),
                            "evidence": sentence.strip(),
                            "page": page_number,
                        })
                        if target_id in known_sections and target_id != source_id:
                            relationships.append({
                                "id": f"ref-{source_id}-{target_id}-{len(relationships)}",
                                "source_id": source_id,
                                "target_id": target_id,
                                "type": "explicit_reference",
                                "confidence": 1.0,
                                "evidence": sentence.strip(),
                                "page": page_number,
                            })

    return {
        "tree": document,
        "content_store": content_store,
        "relationships": relationships,
        "reference_mentions": reference_mentions,
    }
