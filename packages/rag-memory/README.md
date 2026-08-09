# rag-memory

RAG helpers for the starter backend.

## What was done

- Added a tiny chunker for long documents.
- Added keyword normalization so the JSON-backed index can stay cheap.
- Added document creation helpers and a simple ranker for relevant chunks.

## Why it exists

This package shows how retrieval-augmented generation works before a vector database is needed: save knowledge once, chunk it, and pull back only the relevant pieces during chat.

## Build

Run `npx nx build rag-memory`.
