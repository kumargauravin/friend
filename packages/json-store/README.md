# json-store

Cheap JSON-backed persistence for the starter backend.

## What was done

- Added a repository that stores users, characters, conversations, summaries, memory facts, and RAG documents on disk.
- Stored chat messages in a cost-first layout: `users/<userId>/conversations/<conversationId>/messages/<date>/chat-<time>-<id>.json`.
- Added lightweight JSON index files so recent chat lookup and RAG chunk retrieval stay fast enough for an MVP.

## Why it exists

This package answers the “can I avoid a database at first?” question with a practical yes for low traffic, single-instance, low-concurrency learning projects.

## Build

Run `npx nx build json-store`.
