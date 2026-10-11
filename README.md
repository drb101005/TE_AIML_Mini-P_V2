# Legal RAG workspace

A local legal-document collection explorer with cross-document retrieval, typed clause links, human review, cited passage answers, and edition comparison.

## Run locally

Start the FastAPI backend from the repository root:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r reqs.txt
uvicorn main:app --reload
```

In another terminal, start the frontend:

```bash
cd frontend
npm install
npm run dev
```

Open the Vite URL shown in the terminal. The frontend uses `http://localhost:8000` by default; set `VITE_API_URL` in `frontend/.env.local` to use a different backend URL.

The first indexing request loads the Sentence Transformers embedding model. Add multiple PDF, DOCX, and TXT files at once or add more to the current collection (up to 100 files). Later batches send only the new files; the backend updates the combined index and the page can restore the collection after a browser refresh. The collection is held in backend memory, so it is cleared when the backend restarts.

Scanned PDF pages use PyMuPDF OCR when a page has no extractable text. Install Tesseract OCR and the language data needed for your documents on the backend machine. DOCX and TXT files are indexed as text; their displayed page location is the extracted document page (currently page 1), since pagination depends on the word processor and layout.

## What the interface supports

- Upload PDF, DOCX, or TXT files, then add more to the collection.
- Search every indexed file and select a result to focus its section in the graph.
- Filter the graph by document, chapter, link type, and minimum confidence. Click document or chapter nodes to collapse or expand their contents.
- Inspect section text, source filename, page range, and retrieval score. Answer statements link to the retrieved section and page.
- Follow explicit citations and typed suggested links (amends, defines, exception, obligation, prohibition). Review suggestions as confirmed or rejected; the supporting passage remains attached.
- Compare two document editions by section number, inspect changed text, and open relationships connected to changed clauses.

Typed relations are generated from phrase patterns in linked passage text and need human confirmation. Similarity-only links remain discovery hints. Answers are extractive: each displayed claim is an exact sentence from a retrieved passage, not a model-generated legal interpretation. Version matching uses section numbers and text similarity, so documents with different numbering conventions may need manual review.
