const form = document.getElementById('chat-form');
const questionInput = document.getElementById('question');
const messagesEl = document.getElementById('messages');
const template = document.getElementById('message-template');
const sendButton = document.getElementById('send-button');
const modelNameEl = document.getElementById('model-name');
const currentModeEl = document.getElementById('current-mode');
const currentRouteEl = document.getElementById('current-route');

function escapeHTML(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function renderMarkdown(text) {
  let html = escapeHTML(text);

  // Fenced code blocks
  html = html.replace(/```(\w*)\n([\s\S]*?)\n```/g, (_, lang, code) => `<pre><code class="language-${lang}">${code}</code></pre>`);
  
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code style="background:#f1f5f9; padding:2px 4px; border-radius:4px">$1</code>');

  // Headings
  html = html.replace(/^# (.*$)/gm, '<h1>$1</h1>');
  html = html.replace(/^## (.*$)/gm, '<h2>$1</h2>');
  html = html.replace(/^### (.*$)/gm, '<h3>$1</h3>');

  // Bold and Italic
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');

  // Blockquotes
  html = html.replace(/^> (.*$)/gm, '<blockquote style="border-left: 4px solid #f59e0b; background: #fffbeb; padding-left: 10px; font-style: italic;">$1</blockquote>');

  // Lists (Unordered)
  html = html.replace(/^\- (.*$)/gm, '<ul><li>$1</li></ul>').replace(/<\/ul>\s*<ul>/g, '');
  
  // Lists (Ordered)
  html = html.replace(/^(\d+\.) (.*$)/gm, '<ol><li>$2</li></ol>').replace(/<\/ol>\s*<ol>/g, '');

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^\)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  // Paragraphs (split by double newline)
  html = html.split('\n\n').map(p => p.trim().startsWith('<') ? p : `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');

  return html;
}

function addMessage(role, content, citations = [], isError = false, mode = '') {
  const fragment = template.content.cloneNode(true);
  const card = fragment.querySelector('.message-card');
  const roleEl = fragment.querySelector('.message-role');
  const contentEl = fragment.querySelector('.message-content');
  const citationsEl = fragment.querySelector('.message-citations');
  const actionsEl = fragment.querySelector('.message-actions');

  roleEl.textContent = role === 'User' ? 'User' : `Assistant ${mode ? `(${mode === 'rag' ? 'Quick Answer' : 'Travel Planner'})` : ''}`;

  if (role.toLowerCase() === 'user') {
    card.classList.add('user');
    contentEl.textContent = content;
  } else {
    card.classList.add('assistant');
    contentEl.innerHTML = isError ? content : renderMarkdown(content);
  }

  if (isError) {
    card.classList.add('error');
  }

  if (Array.isArray(citations) && citations.length > 0) {
    const title = document.createElement('h3');
    title.textContent = 'Sources from the tourism guide';
    citationsEl.appendChild(title);

    const list = document.createElement('ol');
    for (const citation of citations) {
      const item = document.createElement('li');
      item.className = 'citation-item';

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

  if (!isError && role.toLowerCase() === 'assistant') {
    const pdfBtn = document.createElement('button');
    pdfBtn.className = 'btn-pdf';
    pdfBtn.textContent = 'Save as PDF';
    pdfBtn.onclick = () => exportToPDF(content, citations, mode);
    actionsEl.appendChild(pdfBtn);
  }

  messagesEl.appendChild(fragment);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function exportToPDF(answer, citations, mode) {
  const userQuestion = messagesEl.lastElementChild?.previousElementSibling?.querySelector('.message-content')?.textContent || 'Copenhagen Inquiry';
  const modeLabel = mode === 'rag' ? 'Quick Answer' : (mode === 'crew' ? 'Travel Planner' : 'Assistant');
  
  const printWindow = window.open('', '_blank');
  printWindow.document.write(`
    <html>
      <head>
        <title>Copenhagen Travel Assistant Export</title>
        <style>
          body { font-family: sans-serif; padding: 40px; line-height: 1.6; color: #0f172a; }
          h1 { color: #0ea5e9; border-bottom: 2px solid #0ea5e9; padding-bottom: 10px; }
          .section { margin-bottom: 20px; }
          .label { font-weight: bold; color: #64748b; text-transform: uppercase; font-size: 0.8rem; }
          .content { margin-top: 5px; }
          .citation { background: #f8fafc; border: 1px solid #e2e8f0; padding: 10px; margin-bottom: 10px; border-radius: 8px; font-size: 0.9rem; }
        </style>
      </head>
      <body>
        <h1>Copenhagen Travel Assistant</h1>
        <div class="section">
          <div class="label">Mode</div>
          <div class="content">${modeLabel}</div>
        </div>
        <div class="section">
          <div class="label">Question</div>
          <div class="content">${userQuestion}</div>
        </div>
        <div class="section">
          <div class="label">Assistant Answer</div>
          <div class="content">${renderMarkdown(answer)}</div>
        </div>
        ${citations.length > 0 ? `
          <div class="section">
            <div class="label">Sources from the tourism guide</div>
            <div class="content">
              ${citations.map(c => `<div class="citation"><strong>[${c.index}] ${c.source}</strong><br>${c.excerpt}</div>`).join('')}
            </div>
          </div>
        ` : ''}
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.print();
}

async function sendQuestion(question, mode) {
  const endpoint = mode === 'crew' ? '/api/chat/crew' : '/api/chat/rag';
  const response = await fetch(endpoint, {
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
    } catch (_) {}
    throw new Error(message);
  }

  return response.json();
}

async function handleQuestionSubmit(question) {
  if (!question) return;

  const selectedMode = document.querySelector('input[name="chat-mode"]:checked').value;
  const modeLabel = selectedMode === 'rag' ? 'Quick answer' : 'Travel planner';
  const routeLabel = selectedMode === 'rag' ? '/api/chat/rag' : '/api/chat/crew';

  currentModeEl.textContent = modeLabel;
  currentRouteEl.textContent = routeLabel;

  addMessage('User', question);
  questionInput.value = '';
  sendButton.disabled = true;
  sendButton.textContent = 'Consulting guide...';

  try {
    const data = await sendQuestion(question, selectedMode);
    modelNameEl.textContent = data.model || modelNameEl.textContent;
    const mode = data.mode || selectedMode;
    addMessage('Assistant', data.message?.content || data.answer || 'No answer returned.', data.citations || [], false, mode);
  } catch (error) {
    addMessage('Assistant', error.message || 'Something went wrong.', [], true);
  } finally {
    sendButton.disabled = false;
    sendButton.textContent = 'Ask guide';
    questionInput.focus();
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const question = questionInput.value.trim();
  handleQuestionSubmit(question);
});

document.querySelectorAll('.suggestion-card').forEach(card => {
  card.addEventListener('click', () => {
    const query = card.getAttribute('data-query');
    handleQuestionSubmit(query);
  });
});