# api

The runnable backend entrypoint for the monorepo.

## What was done

- Replaced the hello-world placeholder with a small Node HTTP API.
- Added endpoints for user registration, admin-side friend/teacher character creation and listing, RAG ingestion, and chat turns.
- Added a `FRIEND_RUN_MODE=describe` mode so the workflow can be explained and tested without starting a long-lived server.
- Added a browser playground at `/ui` for admin setup, multi-character management, and chat testing.
- Added a Vertex-ready reply path that activates when Google Cloud environment variables are present.

## Why it exists

This app is where the agent workflow becomes visible end to end. It now runs as one isolated API release unit, uses local demo replies by default so friend-vs-teacher behavior is visible immediately, and switches to Vertex-backed Gemini responses when configured.

## Endpoints

- `GET /health`
- `GET /learn/json-db`
- `GET /ui`
- `POST /users`
- `GET /users/:userId/characters`
- `POST /characters`
- `POST /rag/documents`
- `POST /chat`

## Run

Use `npm run serve:api`.

## Vertex configuration

Set these environment variables to use Vertex-backed responses:

- `GOOGLE_CLOUD_PROJECT`
- `GOOGLE_CLOUD_LOCATION` (optional, defaults to `global`)
- `VERTEX_MODEL` (optional, defaults to `gemini-2.5-flash`)
- `VERTEX_TEMPERATURE` (optional)
- `VERTEX_MAX_OUTPUT_TOKENS` (optional)

The service uses Google application default credentials for authentication.
