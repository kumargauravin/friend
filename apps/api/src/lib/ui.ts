export const PLAYGROUND_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>friend api playground</title>
    <style>
      :root {
        color-scheme: light;
        font-family: Arial, sans-serif;
      }
      body {
        margin: 0;
        background: #f4f7fb;
        color: #172033;
      }
      main {
        max-width: 960px;
        margin: 0 auto;
        padding: 24px;
      }
      section {
        background: white;
        border-radius: 12px;
        padding: 20px;
        margin-bottom: 16px;
        box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
      }
      h1, h2 {
        margin-top: 0;
      }
      form {
        display: grid;
        gap: 12px;
      }
      label {
        display: grid;
        gap: 6px;
        font-weight: 600;
      }
      input, textarea, select, button {
        font: inherit;
        padding: 10px 12px;
        border-radius: 8px;
        border: 1px solid #c7d2e4;
      }
      textarea {
        min-height: 110px;
        resize: vertical;
      }
      button {
        cursor: pointer;
        background: #2563eb;
        color: white;
        border: 0;
      }
      button.secondary {
        background: #475569;
      }
      .row {
        display: grid;
        gap: 12px;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      }
      .status, pre {
        background: #0f172a;
        color: #e2e8f0;
        border-radius: 10px;
        padding: 12px;
        overflow: auto;
      }
      .muted {
        color: #475569;
      }
    </style>
  </head>
  <body>
    <main>
      <section>
        <h1>friend api playground</h1>
        <p class="muted">Create a user, seed a character, optionally add RAG content, then run chat turns against the API.</p>
        <div class="status" id="runtime-status">Loading runtime info…</div>
      </section>

      <section>
        <h2>1. Setup demo user and character</h2>
        <form id="setup-form">
          <div class="row">
            <label>Email <input name="email" type="email" value="demo@example.com" required /></label>
            <label>Password <input name="password" type="text" value="demo-pass-123" required /></label>
          </div>
          <div class="row">
            <label>Character name <input name="characterName" type="text" value="Mira" required /></label>
            <label>Character tone <input name="characterTone" type="text" value="Warm, practical, and curious" required /></label>
          </div>
          <label>Character description <textarea name="description" required>Mira is a supportive AI friend who keeps answers grounded in saved memory and retrieved notes.</textarea></label>
          <button type="submit">Create user and character</button>
        </form>
      </section>

      <section>
        <h2>2. Optional RAG note</h2>
        <form id="rag-form">
          <div class="row">
            <label>Document title <input name="title" type="text" value="Favorite topics" /></label>
            <label>Kind
              <select name="kind">
                <option value="note">note</option>
                <option value="faq">faq</option>
                <option value="journal">journal</option>
                <option value="character-lore">character-lore</option>
                <option value="web">web</option>
              </select>
            </label>
          </div>
          <label>Content <textarea name="content">The user likes hiking, TypeScript, and weekend coffee walks. Prefer concise but thoughtful answers.</textarea></label>
          <button type="submit" class="secondary">Save RAG document</button>
        </form>
      </section>

      <section>
        <h2>3. Chat</h2>
        <form id="chat-form">
          <label>Message <textarea name="message" required>Hello! Call me Gav and remember I like TypeScript and hiking.</textarea></label>
          <button type="submit">Send chat turn</button>
        </form>
      </section>

      <section>
        <h2>Session state</h2>
        <pre id="session-state">{}</pre>
      </section>

      <section>
        <h2>Transcript</h2>
        <pre id="transcript">No chat yet.</pre>
      </section>
    </main>

    <script>
      const state = {
        userId: '',
        characterId: '',
        conversationId: '',
      };

      const runtimeStatus = document.getElementById('runtime-status');
      const sessionState = document.getElementById('session-state');
      const transcript = document.getElementById('transcript');
      const setupForm = document.getElementById('setup-form');
      const ragForm = document.getElementById('rag-form');
      const chatForm = document.getElementById('chat-form');

      refreshRuntime().catch(reportError);
      renderState();

      setupForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        try {
          const formData = new FormData(setupForm);
          const user = await requestJson('/users', {
            email: formData.get('email'),
            password: formData.get('password'),
          });
          state.userId = user.id;

          const character = await requestJson('/characters', {
            userId: user.id,
            name: formData.get('characterName'),
            description: formData.get('description'),
            answers: buildAnswers(
              String(formData.get('characterName') || ''),
              String(formData.get('characterTone') || ''),
              String(formData.get('description') || '')
            ),
          });
          state.characterId = character.id;
          state.conversationId = '';
          transcript.textContent = 'User and character created. Ready to chat.';
          renderState();
        } catch (error) {
          reportError(error);
        }
      });

      ragForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        try {
          ensureSetup();
          const formData = new FormData(ragForm);
          await requestJson('/rag/documents', {
            userId: state.userId,
            characterId: state.characterId,
            title: formData.get('title'),
            kind: formData.get('kind'),
            content: formData.get('content'),
          });
          transcript.textContent += '\\n[RAG] Document saved.';
        } catch (error) {
          reportError(error);
        }
      });

      chatForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        try {
          ensureSetup();
          const formData = new FormData(chatForm);
          const result = await requestJson('/chat', {
            userId: state.userId,
            characterId: state.characterId,
            conversationId: state.conversationId || undefined,
            message: formData.get('message'),
          });
          state.conversationId = result.conversation.id;
          transcript.textContent =
            'USER: ' + result.userMessage.content + '\\n\\n' +
            'ASSISTANT: ' + result.assistantMessage.content + '\\n\\n' +
            'SUMMARY UPDATED: ' + result.summaryUpdated + '\\nLLM MODE: ' +
            (result.assistantMessage.content.includes('demo reply') ? 'local demo reply' : 'vertex or configured model');
          renderState();
        } catch (error) {
          reportError(error);
        }
      });

      async function refreshRuntime() {
        const metadata = await fetch('/').then((response) => response.json());
        runtimeStatus.textContent = JSON.stringify(metadata, null, 2);
      }

      function ensureSetup() {
        if (!state.userId || !state.characterId) {
          throw new Error('Create the demo user and character first.');
        }
      }

      function renderState() {
        sessionState.textContent = JSON.stringify(state, null, 2);
      }

      function reportError(error) {
        const message = error instanceof Error ? error.message : String(error);
        transcript.textContent = '[error] ' + message;
      }

      function buildAnswers(name, tone, description) {
        const prompts = [
          'Who are you?',
          'How should you greet the user?',
          'What tone should you keep?',
          'What should you avoid?',
          'How do you use memory?',
          'How do you use retrieved notes?',
          'How concise should you be?',
          'How should you handle uncertainty?',
          'How should you support the user?',
          'What makes this character distinct?',
          'How should you respond to personal preferences?',
          'How should you talk about plans?',
          'How should you refer to the user?',
          'How should you close a response?',
          'What is your core mission?',
        ];

        return prompts.map((question, index) => ({
          questionId: 'q-' + (index + 1),
          question,
          answer:
            index === 0
              ? name + ' is ' + description
              : index === 2
                ? tone
                : name + ' should stay aligned with this guidance: ' + description,
        }));
      }

      async function requestJson(path, body) {
        const response = await fetch(path, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || 'Request failed for ' + path);
        }
        return payload;
      }
    </script>
  </body>
</html>`;
