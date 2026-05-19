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
  div.textContent = text ?? '';
  return div.innerHTML;
}

function renderInlineMarkdown(text) {
  if (!text) return '';

  return text
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')

    // Bold
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')

    // Italic
    .replace(/\*(.*?)\*/g, '<em>$1</em>')

    // Links
    .replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
    );
}

function splitTableRow(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map(cell => cell.trim());
}

function isTableSeparator(line) {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function renderMarkdownTable(lines, startIndex) {
  const headerLine = lines[startIndex];
  const separatorLine = lines[startIndex + 1];

  if (
    !headerLine ||
    !separatorLine ||
    !headerLine.includes('|') ||
    !isTableSeparator(separatorLine)
  ) {
    return null;
  }

  const headers = splitTableRow(headerLine);
  const separatorCells = splitTableRow(separatorLine);

  if (headers.length < 2 || separatorCells.length !== headers.length) {
    return null;
  }

  let rowIndex = startIndex + 2;
  const rows = [];

  while (
    rowIndex < lines.length &&
    lines[rowIndex].trim() !== '' &&
    lines[rowIndex].includes('|')
  ) {
    rows.push(splitTableRow(lines[rowIndex]));
    rowIndex++;
  }

  const thead = `
    <thead>
      <tr>
        ${headers.map(header => `<th>${renderInlineMarkdown(header)}</th>`).join('')}
      </tr>
    </thead>
  `;

  const tbody = `
    <tbody>
      ${rows
        .map(row => `
          <tr>
            ${headers
              .map((_, index) => `<td>${renderInlineMarkdown(row[index] || '')}</td>`)
              .join('')}
          </tr>
        `)
        .join('')}
    </tbody>
  `;

  return {
    html: `<div class="table-wrapper"><table>${thead}${tbody}</table></div>`,
    nextIndex: rowIndex
  };
}

function renderMarkdown(text) {
  if (!text) return '';

  const codeBlocks = [];

  let safeText = String(text).replace(/\r\n/g, '\n');

  // Store fenced code blocks before escaping and parsing other Markdown
  safeText = safeText.replace(/```(\w*)\n([\s\S]*?)\n```/g, (_, lang, code) => {
    const placeholder = `@@CODE_BLOCK_${codeBlocks.length}@@`;

    codeBlocks.push(
      `<pre><code class="language-${escapeHTML(lang)}">${escapeHTML(code)}</code></pre>`
    );

    return placeholder;
  });

  // Escape remaining content before converting allowed Markdown syntax to HTML
  safeText = escapeHTML(safeText);

  const lines = safeText.split('\n');
  const htmlParts = [];
  let paragraphLines = [];

  function flushParagraph() {
    if (paragraphLines.length === 0) return;

    const paragraph = paragraphLines.join('<br>');
    htmlParts.push(`<p>${renderInlineMarkdown(paragraph)}</p>`);
    paragraphLines = [];
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === '') {
      flushParagraph();
      continue;
    }

    // Fenced code block placeholders
    if (/^@@CODE_BLOCK_\d+@@$/.test(trimmed)) {
      flushParagraph();

      const index = Number(trimmed.match(/\d+/)[0]);
      htmlParts.push(codeBlocks[index]);

      continue;
    }

    // Markdown tables
    const table = renderMarkdownTable(lines, i);
    if (table) {
      flushParagraph();

      htmlParts.push(table.html);
      i = table.nextIndex - 1;

      continue;
    }

    // Headings
    if (/^### /.test(trimmed)) {
      flushParagraph();
      htmlParts.push(`<h3>${renderInlineMarkdown(trimmed.replace(/^### /, ''))}</h3>`);
      continue;
    }

    if (/^## /.test(trimmed)) {
      flushParagraph();
      htmlParts.push(`<h2>${renderInlineMarkdown(trimmed.replace(/^## /, ''))}</h2>`);
      continue;
    }

    if (/^# /.test(trimmed)) {
      flushParagraph();
      htmlParts.push(`<h1>${renderInlineMarkdown(trimmed.replace(/^# /, ''))}</h1>`);
      continue;
    }

    // Blockquotes
    if (/^> /.test(trimmed)) {
      flushParagraph();
      htmlParts.push(
        `<blockquote>${renderInlineMarkdown(trimmed.replace(/^> /, ''))}</blockquote>`
      );
      continue;
    }

    // Unordered lists
    if (/^- /.test(trimmed)) {
      flushParagraph();

      const items = [];

      while (i < lines.length && /^- /.test(lines[i].trim())) {
        items.push(`<li>${renderInlineMarkdown(lines[i].trim().replace(/^- /, ''))}</li>`);
        i++;
      }

      htmlParts.push(`<ul>${items.join('')}</ul>`);
      i--;

      continue;
    }

    // Ordered lists
    if (/^\d+\. /.test(trimmed)) {
      flushParagraph();

      const items = [];

      while (i < lines.length && /^\d+\. /.test(lines[i].trim())) {
        items.push(
          `<li>${renderInlineMarkdown(lines[i].trim().replace(/^\d+\. /, ''))}</li>`
        );
        i++;
      }

      htmlParts.push(`<ol>${items.join('')}</ol>`);
      i--;

      continue;
    }

    paragraphLines.push(trimmed);
  }

  flushParagraph();

  return htmlParts.join('');
}

function addMessage(role, content, citations = [], isError = false, mode = '') {
  const fragment = template.content.cloneNode(true);
  const card = fragment.querySelector('.message-card');
  const roleEl = fragment.querySelector('.message-role');
  const contentEl = fragment.querySelector('.message-content');
  const citationsEl = fragment.querySelector('.message-citations');
  const actionsEl = fragment.querySelector('.message-actions');

  const modeLabel = mode === 'rag' ? 'Quick Answer' : mode === 'crew' ? 'Travel Planner' : '';

  roleEl.textContent = role === 'User' ? 'User' : `Assistant ${modeLabel ? `(${modeLabel})` : ''}`;

  if (role.toLowerCase() === 'user') {
    card.classList.add('user');
    contentEl.textContent = content;
  } else {
    card.classList.add('assistant');
    contentEl.innerHTML = isError ? escapeHTML(content) : renderMarkdown(content);
  }

  if (isError) card.classList.add('error');

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
  const userQuestion =
    messagesEl.lastElementChild?.previousElementSibling?.querySelector('.message-content')
      ?.textContent || 'Copenhagen Inquiry';

  const modeLabel = mode === 'rag' ? 'Quick Answer' : mode === 'crew' ? 'Travel Planner' : 'Assistant';

  const printWindow = window.open('', '_blank');

  if (!printWindow) {
    alert('The PDF window was blocked by your browser. Please allow pop-ups and try again.');
    return;
  }

  printWindow.document.write(`
    <html>
      <head>
        <title>Copenhagen Travel Assistant Export</title>
        <style>
          body {
            font-family: sans-serif;
            padding: 40px;
            line-height: 1.6;
            color: #0f172a;
          }

          h1 {
            color: #0ea5e9;
            border-bottom: 2px solid #0ea5e9;
            padding-bottom: 10px;
          }

          .section {
            margin-bottom: 20px;
          }

          .label {
            font-weight: bold;
            color: #64748b;
            text-transform: uppercase;
            font-size: 0.8rem;
          }

          .content {
            margin-top: 5px;
          }

          .citation {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            padding: 10px;
            margin-bottom: 10px;
            border-radius: 8px;
            font-size: 0.9rem;
          }

          .table-wrapper {
            width: 100%;
            overflow-x: auto;
            margin: 1rem 0;
          }

          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 0.95rem;
            background: white;
            border: 1px solid #e2e8f0;
          }

          th,
          td {
            border: 1px solid #e2e8f0;
            padding: 0.75rem;
            text-align: left;
            vertical-align: top;
          }

          th {
            background: #f1f5f9;
            font-weight: 700;
          }

          tr:nth-child(even) td {
            background: #f8fafc;
          }

          code {
            background: #f1f5f9;
            padding: 0.2rem 0.4rem;
            border-radius: 4px;
            font-family: monospace;
            font-size: 0.9em;
          }

          pre {
            background: #1e293b;
            color: #f8fafc;
            padding: 1rem;
            border-radius: 8px;
            overflow-x: auto;
          }

          pre code {
            background: transparent;
            color: inherit;
            padding: 0;
          }

          blockquote {
            margin: 0 0 1rem 0;
            padding: 0.5rem 1rem;
            border-left: 4px solid #f59e0b;
            background: #fffbeb;
            font-style: italic;
          }
        </style>
      </head>

      <body>
        <h1>Copenhagen Travel Assistant</h1>

        <div class="section">
          <div class="label">Mode</div>
          <div class="content">${escapeHTML(modeLabel)}</div>
        </div>

        <div class="section">
          <div class="label">Question</div>
          <div class="content">${escapeHTML(userQuestion)}</div>
        </div>

        <div class="section">
          <div class="label">Assistant Answer</div>
          <div class="content">${renderMarkdown(answer)}</div>
        </div>

        ${
          Array.isArray(citations) && citations.length > 0
            ? `
              <div class="section">
                <div class="label">Sources from the tourism guide</div>
                <div class="content">
                  ${citations
                    .map(
                      c => `
                        <div class="citation">
                          <strong>[${escapeHTML(c.index)}] ${escapeHTML(c.source)}</strong><br>
                          ${escapeHTML(c.excerpt)}
                        </div>
                      `
                    )
                    .join('')}
                </div>
              </div>
            `
            : ''
        }
      </body>
    </html>
  `);

  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

async function sendQuestion(question, mode) {
  const endpoint = mode === 'crew' ? '/api/chat/crew' : '/api/chat/rag';

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: modelNameEl.textContent.trim(),
      messages: [{ role: 'user', content: question }]
    })
  });

  if (!response.ok) {
    let message = 'Request failed.';

    try {
      const errorData = await response.json();
      message = errorData.error || message;
    } catch (_) {
      // Keep default error message if response is not JSON
    }

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
    const answer = data.message?.content || data.answer || 'No answer returned.';

    addMessage('Assistant', answer, data.citations || [], false, mode);
  } catch (error) {
    addMessage('Assistant', error.message || 'Something went wrong.', [], true);
  } finally {
    sendButton.disabled = false;
    sendButton.textContent = 'Ask guide';
    questionInput.focus();
  }
}

form.addEventListener('submit', event => {
  event.preventDefault();
  handleQuestionSubmit(questionInput.value.trim());
});

document.querySelectorAll('.suggestion-card').forEach(card => {
  card.addEventListener('click', () => {
    questionInput.value = card.dataset.query;
    handleQuestionSubmit(card.dataset.query);
  });
});