# friend

Cost-first agentic AI starter in an Nx monorepo.

## What is in this repo

- `apps/api`: a minimal Node API that demonstrates registration, character creation, RAG ingestion, and chat orchestration.
- `apps/api-e2e`: smoke coverage for the learning-oriented CLI surface.
- `packages/contracts`: shared types and repository interfaces.
- `packages/json-store`: JSON-file persistence with simple indexes instead of a database.
- `packages/rag-memory`: chunking and ranking helpers for RAG.
- `packages/agent-core`: the orchestration layer that assembles persona, memory, summaries, and retrieved knowledge.

## Why JSON instead of a database

For a low-cost MVP or a learning project, JSON files can be enough when:

- traffic is low
- one server instance writes the files
- speed is not the top priority
- you want to understand the workflow before paying for infrastructure

This repo stores messages like:

`data/users/<userId>/conversations/<conversationId>/messages/<YYYY-MM-DD>/chat-<HH-mm-ss-SSS>-<messageId>.json`

and keeps side indexes such as:

- `message-index.json` for quick recent-history lookup
- `summary.json` for long-term memory summaries
- `rag/index.json` for cheap retrieval over saved knowledge chunks

## What “agentic AI” means here

Each chat turn does more than call a model:

1. load the character persona
2. load recent chat
3. load durable memory facts
4. retrieve matching RAG chunks
5. assemble one prompt package
6. save the new conversation state
7. periodically summarize older context

The current starter uses a deterministic local demo reply so you can learn the workflow without paying for an LLM on day one.

## RAG data save model

RAG documents are stored once with:

- raw content
- extracted keywords
- chunks
- per-chunk keywords

At chat time the app searches the JSON index and injects only the top matching chunks into the prompt. That is how you add external memory without retraining.

## Commands

- `npm run build`
- `npm run lint`
- `npm run typecheck`
- `npm run test:e2e`
- `npm run serve:api`

## Deploy

- The API container is built from `apps/api/Dockerfile`.
- CI runs lint, typecheck, build, and the API smoke test on pushes and pull requests to `main`.
- The `Build and Publish API Image` workflow publishes `ghcr.io/<owner>/friend-api` on pushes to `main` and on manual dispatch.
- Runtime defaults are `HOST=0.0.0.0` and `PORT=3000`.
