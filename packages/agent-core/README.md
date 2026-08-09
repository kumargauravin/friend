# agent-core

The orchestration layer for the starter agent backend.

## What was done

- Added the user-registration, character-creation, RAG-ingestion, and chat workflow methods.
- Added prompt assembly so persona, recent chat, long-term memory, and retrieved RAG chunks are combined in one place.
- Added deterministic demo replies so the workflow can be tested without an LLM key.
- Added a simple memory-fact extractor and summary refresh hook.

## Why it exists

This package is the heart of the “agentic AI” lesson: it coordinates storage, retrieval, summarization, and the future model call.

## Build

Run `npx nx build agent-core`.
