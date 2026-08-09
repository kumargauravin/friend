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
        max-width: 1080px;
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
      .pill-row {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .pill {
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        padding: 6px 10px;
        background: #e2e8f0;
        color: #0f172a;
        font-size: 14px;
      }
    </style>
  </head>
  <body>
    <main>
      <section>
        <h1>friend api playground</h1>
        <p class="muted">Set up one admin demo user, add multiple friend or teacher characters, compare their behavior, optionally attach RAG notes, then run chat turns.</p>
        <div class="status" id="runtime-status">Loading runtime info…</div>
      </section>

      <section>
        <h2>1. Setup admin demo user</h2>
        <form id="setup-form">
          <div class="row">
            <label>Email <input name="email" type="email" value="demo@example.com" required /></label>
            <label>Password <input name="password" type="password" value="demo-pass-123" required /></label>
          </div>
          <button type="submit">Create admin demo user</button>
        </form>
      </section>

      <section>
        <h2>2. Admin: add friend or teacher</h2>
        <form id="character-form">
          <div class="row">
            <label>Character type
              <select name="kind" id="character-kind">
                <option value="friend">friend</option>
                <option value="teacher">teacher</option>
              </select>
            </label>
            <label>Character name <input name="characterName" type="text" value="Mira" required /></label>
            <label>Character tone <input name="characterTone" type="text" value="Warm, practical, and curious" required /></label>
          </div>
          <label>Character description <textarea name="description" required>Mira is a supportive AI friend who keeps answers grounded in saved memory and retrieved notes.</textarea></label>
          <button type="submit" id="character-submit">Add friend</button>
        </form>
      </section>

      <section>
        <h2>3. Character roster</h2>
        <div class="row">
          <label>Active character
            <select id="character-picker">
              <option value="">Create a character first</option>
            </select>
          </label>
          <button type="button" class="secondary" id="refresh-characters">Refresh characters</button>
        </div>
        <div class="pill-row" id="character-pills"></div>
        <pre id="character-detail">No active character yet.</pre>
      </section>

      <section>
        <h2>4. Optional RAG note</h2>
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
          <label>Content <textarea name="content">The child likes hiking, TypeScript, and weekend coffee walks. Prefer concise but thoughtful answers.</textarea></label>
          <button type="submit" class="secondary">Save RAG document for active character</button>
        </form>
      </section>

      <section>
        <h2>5. Chat</h2>
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
      const defaultsByKind = {
        friend: {
          name: 'Mira',
          tone: 'Warm, practical, and curious',
          description: 'Mira is a supportive AI friend who keeps answers grounded in saved memory and retrieved notes.'
        },
        teacher: {
          name: 'Ms. Anika',
          tone: 'Calm, encouraging, and step-by-step',
          description: 'Ms. Anika is a patient AI teacher who explains ideas for kids in a clear, age-appropriate way while staying grounded in saved memory and retrieved notes.'
        }
      };

      const state = {
        userId: '',
        characterId: '',
        conversationId: '',
        characters: [],
      };

      const runtimeStatus = document.getElementById('runtime-status');
      const sessionState = document.getElementById('session-state');
      const transcript = document.getElementById('transcript');
      const characterDetail = document.getElementById('character-detail');
      const characterPills = document.getElementById('character-pills');
      const setupForm = document.getElementById('setup-form');
      const characterForm = document.getElementById('character-form');
      const characterKindInput = document.getElementById('character-kind');
      const characterSubmit = document.getElementById('character-submit');
      const characterPicker = document.getElementById('character-picker');
      const refreshCharactersButton = document.getElementById('refresh-characters');
      const ragForm = document.getElementById('rag-form');
      const chatForm = document.getElementById('chat-form');

      refreshRuntime().catch(reportError);
      applyCharacterDefaults('friend', false);
      renderCharacters();
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
          state.characterId = '';
          state.conversationId = '';
          state.characters = [];
          transcript.textContent = 'Admin demo user created. Add a friend or teacher to begin.';
          renderCharacters();
          renderState();
        } catch (error) {
          reportError(error);
        }
      });

      characterKindInput.addEventListener('change', () => {
        applyCharacterDefaults(characterKindInput.value, true);
      });

      characterForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        try {
          ensureUserSetup();
          const formData = new FormData(characterForm);
          const kind = String(formData.get('kind') || 'friend');
          const name = String(formData.get('characterName') || '');
          const tone = String(formData.get('characterTone') || '');
          const description = String(formData.get('description') || '');
          const character = await requestJson('/characters', {
            userId: state.userId,
            kind,
            name,
            description,
            answers: buildAnswers(kind, name, tone, description),
          });
          await refreshCharacters(character.id);
          transcript.textContent = 'Created ' + kind + ' character "' + character.name + '". Ready to compare perspectives.';
        } catch (error) {
          reportError(error);
        }
      });

      refreshCharactersButton.addEventListener('click', async () => {
        try {
          ensureUserSetup();
          await refreshCharacters(state.characterId || undefined);
          transcript.textContent = 'Character roster refreshed.';
        } catch (error) {
          reportError(error);
        }
      });

      characterPicker.addEventListener('change', () => {
        state.characterId = characterPicker.value;
        state.conversationId = '';
        transcript.textContent = activeCharacter()
          ? 'Switched to ' + activeCharacter().kind + ' "' + activeCharacter().name + '".'
          : 'No active character selected.';
        renderCharacters();
        renderState();
      });

      ragForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        try {
          ensureCharacterSetup();
          const formData = new FormData(ragForm);
          await requestJson('/rag/documents', {
            userId: state.userId,
            characterId: state.characterId,
            title: formData.get('title'),
            kind: formData.get('kind'),
            content: formData.get('content'),
          });
          transcript.textContent += '\\n[RAG] Document saved for ' + activeCharacter().name + '.';
        } catch (error) {
          reportError(error);
        }
      });

      chatForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        try {
          ensureCharacterSetup();
          const formData = new FormData(chatForm);
          const result = await requestJson('/chat', {
            userId: state.userId,
            characterId: state.characterId,
            conversationId: state.conversationId || undefined,
            message: formData.get('message'),
          });
          state.conversationId = result.conversation.id;
          const selected = activeCharacter();
          transcript.textContent =
            'ACTIVE CHARACTER: ' + selected.name + ' (' + selected.kind + ')\\n\\n' +
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

      async function refreshCharacters(preferredCharacterId) {
        const query = state.userId ? '/users/' + encodeURIComponent(state.userId) + '/characters' : '';
        const characters = await fetch(query).then((response) => response.json());
        state.characters = Array.isArray(characters) ? characters : [];
        const nextCharacterId =
          preferredCharacterId && state.characters.some((character) => character.id === preferredCharacterId)
            ? preferredCharacterId
            : state.characterId && state.characters.some((character) => character.id === state.characterId)
              ? state.characterId
              : state.characters[0]?.id || '';
        state.characterId = nextCharacterId;
        state.conversationId = '';
        renderCharacters();
        renderState();
      }

      function ensureUserSetup() {
        if (!state.userId) {
          throw new Error('Create the admin demo user first.');
        }
      }

      function ensureCharacterSetup() {
        ensureUserSetup();
        if (!state.characterId) {
          throw new Error('Create or select a friend or teacher first.');
        }
      }

      function renderState() {
        sessionState.textContent = JSON.stringify({
          userId: state.userId,
          characterId: state.characterId,
          conversationId: state.conversationId,
          activeCharacter: activeCharacter(),
          characterCount: state.characters.length,
        }, null, 2);
      }

      function renderCharacters() {
        characterPicker.innerHTML = '';

        if (!state.characters.length) {
          const option = document.createElement('option');
          option.value = '';
          option.textContent = state.userId ? 'No characters yet' : 'Create the admin demo user first';
          characterPicker.appendChild(option);
          characterPills.innerHTML = '';
          characterDetail.textContent = 'No active character yet.';
          return;
        }

        state.characters.forEach((character) => {
          const option = document.createElement('option');
          option.value = character.id;
          option.textContent = character.name + ' (' + character.kind + ')';
          option.selected = character.id === state.characterId;
          characterPicker.appendChild(option);
        });

        characterPills.innerHTML = state.characters
          .map((character) => '<span class="pill">' + escapeHtml(character.kind) + ': ' + escapeHtml(character.name) + '</span>')
          .join('');

        const selected = activeCharacter();
        characterDetail.textContent = selected
          ? JSON.stringify(selected, null, 2)
          : 'No active character yet.';
      }

      function activeCharacter() {
        return state.characters.find((character) => character.id === state.characterId) || null;
      }

      function reportError(error) {
        const message = error instanceof Error ? error.message : String(error);
        transcript.textContent = '[error] ' + message;
      }

      function applyCharacterDefaults(kind, overwriteExistingValues) {
        const defaults = defaultsByKind[kind] || defaultsByKind.friend;
        const nameInput = characterForm.elements.namedItem('characterName');
        const toneInput = characterForm.elements.namedItem('characterTone');
        const descriptionInput = characterForm.elements.namedItem('description');

        if (overwriteExistingValues || !nameInput.value.trim()) {
          nameInput.value = defaults.name;
        }
        if (overwriteExistingValues || !toneInput.value.trim()) {
          toneInput.value = defaults.tone;
        }
        if (overwriteExistingValues || !descriptionInput.value.trim()) {
          descriptionInput.value = defaults.description;
        }

        characterSubmit.textContent = kind === 'teacher' ? 'Add teacher' : 'Add friend';
      }

      function buildAnswers(kind, name, tone, description) {
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
          answer: answerForPrompt(kind, name, tone, description, index),
        }));
      }

      function answerForPrompt(kind, name, tone, description, index) {
        if (index === 0) {
          return kind === 'teacher'
            ? name + ' is a teacher persona. ' + description
            : name + ' is a friend persona. ' + description;
        }
        if (index === 1) {
          return kind === 'teacher'
            ? 'Greet the child warmly, introduce yourself like a teacher, and invite the child to learn together.'
            : 'Greet the child warmly, sound like a supportive friend, and keep the conversation easy to join.';
        }
        if (index === 2) {
          return tone;
        }
        if (index === 3) {
          return kind === 'teacher'
            ? 'Do not shame, overwhelm, or use advanced explanations without breaking them down for a child.'
            : 'Do not sound judgmental, cold, or overly formal.';
        }
        if (index === 9) {
          return kind === 'teacher'
            ? name + ' should teach with clear steps, examples, and gentle encouragement.'
            : name + ' should feel like a caring buddy who remembers what matters to the child.';
        }
        if (index === 14) {
          return kind === 'teacher'
            ? 'Help kids understand answers from a teacher perspective while staying grounded in saved facts and retrieved notes.'
            : 'Help kids feel supported from a friend perspective while staying grounded in saved facts and retrieved notes.';
        }

        return name + ' should stay aligned with this guidance: ' + description;
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

      function escapeHtml(text) {
        return text
          .replaceAll('&', '&amp;')
          .replaceAll('<', '&lt;')
          .replaceAll('>', '&gt;');
      }
    </script>
  </body>
</html>`;
