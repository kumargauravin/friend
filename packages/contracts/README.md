# contracts

Shared contracts for the monorepo.

## What was done

- Added the core types for users, characters, conversations, summaries, memory facts, RAG documents, and prompt assembly.
- Defined the repository interface that lets the agent workflow swap storage implementations later.
- Centralized the default limits that control recent-message windows, summary refreshes, and RAG result counts.

## Why it exists

This package teaches the first agentic AI lesson: keep the workflow shape stable even if the storage or model changes later.

## Build

Run `npx nx build contracts`.
