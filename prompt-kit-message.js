/**
 * Creates a message with appropriate styling based on the sender type
 * @param {string} sender - 'user' or 'assistant'
 * @param {string} content - Message content 
 * @returns {HTMLDivElement} - Formatted message element
 */
function createMessage(sender, content) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `wally-message wally-${sender}-message`;
  
  if (sender === 'assistant') {
    // Format markdown for assistant messages
    messageDiv.classList.add('wally-markdown');
    messageDiv.innerHTML = formatMarkdown(content);
  } else {
    // Simple text for user messages
    messageDiv.textContent = content;
  }
  
  return messageDiv;
}

/**
 * Creates a placeholder element for streaming responses
 * @returns {HTMLDivElement} - Streaming message element
 */
function createStreamingMessage() {
  const messageDiv = document.createElement('div');
  messageDiv.className = 'wally-message wally-assistant-message wally-markdown';
  messageDiv.dataset.streaming = true;
  return messageDiv;
}

/**
 * Enhanced markdown formatter for chat messages
 * @param {string} content - Raw markdown text
 * @returns {string} - HTML formatted content
 */
function formatMarkdown(content) {
  if (!content) return '';
  
  // First clean up any partial or incomplete text
  // For example complete the **bold** text or `code` if we have partial chunks
  // Since we might receive incomplete chunks during streaming
  
  // Fix incomplete bold text (if it starts with ** but doesn't end with **)
  const hasOpenBold = (content.match(/\*\*/g) || []).length % 2 !== 0;
  if (hasOpenBold) {
    content = content.replace(/(\*\*[^\*]*)$/, '$1');
  }
  
  // Fix incomplete italic text
  const hasOpenItalic = (content.match(/(?<!\*)\*(?!\*)/g) || []).length % 2 !== 0;
  if (hasOpenItalic) {
    content = content.replace(/([^\\]\*[^\*]*)$/, '$1');
  }
  
  // Fix incomplete code blocks
  const codeBlockStarts = (content.match(/```/g) || []).length;
  if (codeBlockStarts % 2 !== 0) {
    content = content.replace(/```(\w*)([\s\S]*)$/, '');
  }
  
  // Fix incomplete inline code
  const hasOpenInlineCode = (content.match(/`/g) || []).length % 2 !== 0;
  if (hasOpenInlineCode) {
    content = content.replace(/`([^`]*)$/, '');
  }
  
  // Process code blocks with syntax highlighting
  content = content.replace(/```(\w*)([\s\S]*?)```/g, function(match, language, code) {
    return `<pre><code class="language-${language}">${escapeHtml(code.trim())}</code></pre>`;
  });
  
  // Process inline code
  content = content.replace(/`([^`]+)`/g, '<code>$1</code>');
  
  // Process headings (h1 to h6)
  content = content.replace(/^######\s+(.*?)$/gm, '<h6>$1</h6>');
  content = content.replace(/^#####\s+(.*?)$/gm, '<h5>$1</h5>');
  content = content.replace(/^####\s+(.*?)$/gm, '<h4>$1</h4>');
  content = content.replace(/^###\s+(.*?)$/gm, '<h3>$1</h3>');
  content = content.replace(/^##\s+(.*?)$/gm, '<h2>$1</h2>');
  content = content.replace(/^#\s+(.*?)$/gm, '<h1>$1</h1>');
  
  // Process bold (both ** and __ syntax)
  content = content.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  content = content.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  
  // Process italic (both * and _ syntax) - simplify the regex for better streaming compatibility
  content = content.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  content = content.replace(/_([^_]+)_/g, '<em>$1</em>');
  
  // Process strikethrough
  content = content.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  
  // Process links
  content = content.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  
  // Process horizontal rule
  content = content.replace(/^---+$/gm, '<hr>');
  
  // Process blockquotes
  content = content.replace(/^>\s+(.*?)$/gm, '<blockquote>$1</blockquote>');
  
  // Process unordered lists (supporting *, +, and - bullets)
  content = content.replace(/^\s*[\*\-\+]\s+(.*?)$/gm, '<li>$1</li>');
  
  // Process ordered lists
  content = content.replace(/^\s*(\d+)\.\s+(.*?)$/gm, '<li>$2</li>');
  
  // Group list items
  let inUl = false;
  let inOl = false;
  const lines = content.split('\n');
  content = lines.map(line => {
    if (line.indexOf('<li>') !== -1) {
      if (!inUl && !inOl) {
        // Start a new list - determine type
        if (line.match(/^\s*<li>\d+\./)) {
          inOl = true;
          return '<ol>' + line;
        } else {
          inUl = true;
          return '<ul>' + line;
        }
      }
      return line;
    } else if ((inUl || inOl) && line.trim() === '') {
      // End the current list
      if (inUl) {
        inUl = false;
        return '</ul>';
      } else {
        inOl = false;
        return '</ol>';
      }
    } else {
      return line;
    }
  }).join('\n');
  
  // Close any open lists
  if (inUl) content += '</ul>';
  if (inOl) content += '</ol>';
  
  // Process simple tables
  const tableRegex = /^\|(.+)\|$/gm;
  const headerRegex = /^\|(:?-+:?\|)+$/gm;
  
  if (content.match(tableRegex) && content.match(headerRegex)) {
    // Convert markdown tables to HTML tables
    const lines = content.split('\n');
    let inTable = false;
    let tableHTML = '';
    
    content = lines.map(line => {
      if (line.match(tableRegex)) {
        if (!inTable) {
          inTable = true;
          tableHTML = '<table class="wally-markdown-table"><tbody>';
        }
        
        const isHeader = line.match(headerRegex);
        if (isHeader) return ''; // Skip the header separator row
        
        const cells = line.split('|').filter(cell => cell !== '');
        const rowHTML = '<tr>' + cells.map(cell => {
          if (inTable && tableHTML.indexOf('</tr>') === -1) {
            // This is the first row, use th instead of td
            return `<th>${cell.trim()}</th>`;
          } else {
            return `<td>${cell.trim()}</td>`;
          }
        }).join('') + '</tr>';
        
        tableHTML += rowHTML;
        return '';
      } else if (inTable) {
        inTable = false;
        const completeTable = tableHTML + '</tbody></table>';
        tableHTML = '';
        return completeTable + '\n' + line;
      } else {
        return line;
      }
    }).join('\n');
    
    if (inTable) {
      content += tableHTML + '</tbody></table>';
    }
  }
  
  // For streaming responses, we don't want to overly process paragraphs
  // as it can lead to text jumping around with each chunk
  // Only apply paragraph formatting if we have complete paragraphs (containing \n\n)
  if (content.includes('\n\n')) {
    // Process paragraphs
    const paragraphs = content.split('\n\n');
    content = paragraphs.map(p => {
      if (
        p.indexOf('<pre>') === -1 &&
        p.indexOf('<ul>') === -1 &&
        p.indexOf('<ol>') === -1 &&
        p.indexOf('<h') === -1 &&
        p.indexOf('<blockquote>') === -1 &&
        p.indexOf('<table') === -1 &&
        p.indexOf('<hr>') === -1 &&
        p.trim() !== ''
      ) {
        return `<p>${p}</p>`;
      }
      return p;
    }).join('');
  }
  
  // Handle single newlines
  content = content.replace(/([^>\n])\n(?!<\/\w+>|<\w+>|<\/li>|<li>|<\/p>|<p>|<br>)([^<])/g, '$1<br>$2');
  
  return content;
}

/**
 * Escape HTML special characters to prevent XSS
 * @param {string} unsafe - Potentially unsafe HTML string
 * @returns {string} - Escaped safe HTML string
 */
function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}