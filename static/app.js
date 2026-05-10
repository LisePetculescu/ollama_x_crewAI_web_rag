const form = document.getElementById('chat-form');
const questionInput = document.getElementById('question');
const messagesEl = document.getElementById('messages');
const template = document.getElementById('message-template');
const sendButton = document.getElementById('send-button');
const modelNameEl = document.getElementById('model-name');

function addMessage(role, content, citations = [], isError = false) {
  const fragment = template.content.cloneNode(true);
  const card = fragment.querySelector('.message-card');
  const roleEl = fragment.querySelector('.message-role');
  const contentEl = fragment.querySelector('.message-content');
  const citationsEl = fragment.querySelector('.message-citations');

  roleEl.textContent = role;
  contentEl.textContent = content;

  if (role.toLowerCase() === 'user') {
    card.classList.add('user');
  } else {
    card.classList.add('assistant');
  }

  if (isError) {
    card.classList.add('error');
  }

  if (Array.isArray(citations) && citations.length > 0) {
    const title = document.createElement('h3');
    title.textContent = 'Retrieved chunks';
    citationsEl.appendChild(title);

    const list = document.createElement('ol');
    for (const citation of citations) {
      const item = document.createElement('li');
      const meta = document.createElement('div');
      const excerpt = document.createElement('p');

      const chunkLabel = citation.chunk_index ? `chunk ${citation.chunk_index}` : 'chunk ?';
      meta.className = 'citation-meta';
      meta.textContent = `[${citation.index}] ${citation.source} · ${chunkLabel}`;

      excerpt.className = 'citation-excerpt';
      excerpt.textContent = citation.excerpt;

      item.appendChild(meta);
      item.appendChild(excerpt);
      list.appendChild(item);
    }

    citationsEl.appendChild(list);
  }

  messagesEl.appendChild(fragment);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

async function sendQuestion(question) {
  const response = await fetch('/api/chat/crew', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: modelNameEl.textContent.trim(),
      stream: false,
      messages: [
        { role: 'user', content: question }
      ]
    })
  });

  if (!response.ok) {
    let message = 'Request failed.';
    try {
      const errorData = await response.json();
      message = errorData.error || message;
    } catch (_) {
      // Keep generic message when no JSON error body is available.
    }
    throw new Error(message);
  }

  return response.json();
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const question = questionInput.value.trim();
  if (!question) {
    return;
  }

  addMessage('User', question);
  questionInput.value = '';
  sendButton.disabled = true;
  sendButton.textContent = 'Sending...';

  try {
    const data = await sendQuestion(question);
    modelNameEl.textContent = data.model || modelNameEl.textContent;
    addMessage('Assistant', data.message?.content || 'No answer returned.', data.citations || []);
  } catch (error) {
    addMessage('Assistant', error.message || 'Something went wrong.', [], true);
  } finally {
    sendButton.disabled = false;
    sendButton.textContent = 'Send';
    questionInput.focus();
  }
});
