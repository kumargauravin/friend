# api

The runnable backend entrypoint for the monorepo.

## What was done

- Replaced the hello-world placeholder with a small Node HTTP API.
- Added endpoints for user registration, character creation, RAG ingestion, and chat turns.
- Added a `FRIEND_RUN_MODE=describe` mode so the workflow can be explained and tested without starting a long-lived server.

## Why it exists

This app is where the agent workflow becomes visible end to end. It shows the request flow you would later connect to Vertex AI, OpenAI, or another hosted LLM.

## Endpoints

- `GET /health`
- `GET /learn/json-db`
- `POST /users`
- `POST /characters`
- `POST /rag/documents`
- `POST /chat`

## Run

Use `npm run serve:api`.
