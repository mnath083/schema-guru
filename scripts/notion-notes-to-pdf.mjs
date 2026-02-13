import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const notesDir = path.join(root, 'content', 'blog');
const tempDir = path.join(root, 'tmp', 'pdfs');
const outDir = path.join(root, 'output', 'pdf');
const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

mkdirSync(tempDir, { recursive: true });
mkdirSync(outDir, { recursive: true });

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatInline(line) {
  let out = escapeHtml(line);
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>');
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  return out;
}

function parseFrontmatter(source) {
  const match = source.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: source };
  }

  const lines = match[1].split(/\r?\n/);
  const frontmatter = {};
  let activeListKey = null;

  for (const raw of lines) {
    if (!raw.trim()) {
      continue;
    }

    const listItem = raw.match(/^\s+-\s+(.*)$/);
    if (listItem && activeListKey) {
      frontmatter[activeListKey].push(listItem[1].trim());
      continue;
    }

    const keyValue = raw.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!keyValue) {
      activeListKey = null;
      continue;
    }

    const [, key, value] = keyValue;
    if (!value) {
      frontmatter[key] = [];
      activeListKey = key;
      continue;
    }

    frontmatter[key] = value.replace(/^['"]|['"]$/g, '').trim();
    activeListKey = null;
  }

  return {
    frontmatter,
    body: match[2].trim()
  };
}

function markdownToHtml(source) {
  const lines = source.split(/\r?\n/);
  const html = [];

  let inCode = false;
  let codeBuffer = [];
  let codeLang = '';
  let paragraphBuffer = [];
  let listType = null;

  const flushParagraph = () => {
    if (!paragraphBuffer.length) {
      return;
    }
    const paragraph = paragraphBuffer.join(' ').trim();
    if (paragraph) {
      html.push(`<p>${formatInline(paragraph)}</p>`);
    }
    paragraphBuffer = [];
  };

  const closeList = () => {
    if (!listType) {
      return;
    }
    html.push(`</${listType}>`);
    listType = null;
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      flushParagraph();
      closeList();
      if (!inCode) {
        inCode = true;
        codeLang = trimmed.slice(3).trim();
        codeBuffer = [];
      } else {
        const code = escapeHtml(codeBuffer.join('\n'));
        const className = codeLang ? ` class="lang-${escapeHtml(codeLang)}"` : '';
        html.push(`<pre><code${className}>${code}</code></pre>`);
        inCode = false;
      }
      continue;
    }

    if (inCode) {
      codeBuffer.push(line);
      continue;
    }

    if (!trimmed) {
      flushParagraph();
      closeList();
      continue;
    }

    if (/^-{3,}$/.test(trimmed)) {
      flushParagraph();
      closeList();
      html.push('<hr />');
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flushParagraph();
      closeList();
      const level = Math.min(heading[1].length, 6);
      html.push(`<h${level}>${formatInline(heading[2].trim())}</h${level}>`);
      continue;
    }

    const ulItem = trimmed.match(/^-\s+(.*)$/);
    if (ulItem) {
      flushParagraph();
      if (listType !== 'ul') {
        closeList();
        listType = 'ul';
        html.push('<ul>');
      }
      html.push(`<li>${formatInline(ulItem[1])}</li>`);
      continue;
    }

    const olItem = trimmed.match(/^\d+\.\s+(.*)$/);
    if (olItem) {
      flushParagraph();
      if (listType !== 'ol') {
        closeList();
        listType = 'ol';
        html.push('<ol>');
      }
      html.push(`<li>${formatInline(olItem[1])}</li>`);
      continue;
    }

    paragraphBuffer.push(trimmed);
  }

  flushParagraph();
  closeList();
  return html.join('\n');
}

function buildHtmlDoc(frontmatter, contentHtml) {
  const title = frontmatter.title || 'Untitled Note';
  const excerpt = frontmatter.excerpt || '';
  const publishedAt = frontmatter.publishedAt || '';
  const tags = Array.isArray(frontmatter.tags) ? frontmatter.tags : [];

  const tagsHtml = tags.length
    ? `<div class="tags">${tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}</div>`
    : '';

  const publishedLabel = publishedAt ? `<span>Published: ${escapeHtml(publishedAt)}</span>` : '';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: A4; margin: 16mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Avenir Next", "Segoe UI", sans-serif;
      color: #1d2433;
      background: #f2f5fa;
      line-height: 1.6;
      font-size: 11pt;
    }
    .sheet {
      background: linear-gradient(150deg, #ffffff 0%, #f8fbff 100%);
      border: 1px solid #d8e2ef;
      border-radius: 14px;
      padding: 24px 26px;
      box-shadow: 0 8px 32px rgba(30, 55, 90, 0.08);
    }
    .header {
      margin-bottom: 18px;
      border-bottom: 2px solid #dce7f5;
      padding-bottom: 14px;
    }
    h1 {
      margin: 0 0 8px;
      font-size: 25pt;
      line-height: 1.2;
      color: #0f1b33;
    }
    .excerpt {
      margin: 0 0 10px;
      font-size: 12pt;
      color: #3f4d65;
    }
    .meta {
      display: flex;
      gap: 10px;
      color: #55657f;
      font-size: 9.5pt;
      margin-bottom: 10px;
    }
    .tags {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .tag {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 999px;
      background: #e8f0fd;
      border: 1px solid #bfd0ef;
      color: #20457c;
      font-size: 9pt;
      font-weight: 600;
    }
    h2, h3, h4, h5, h6 {
      color: #11284a;
      margin: 20px 0 8px;
      page-break-after: avoid;
    }
    h2 { font-size: 17pt; border-left: 4px solid #2f6ed7; padding-left: 10px; }
    h3 { font-size: 14pt; }
    p { margin: 9px 0; color: #1f2a3d; }
    ul, ol { margin: 8px 0 10px 20px; }
    li { margin: 4px 0; }
    hr {
      border: 0;
      border-top: 1px solid #c8d6ec;
      margin: 18px 0;
    }
    pre {
      background: #0d1a2f;
      color: #d7e5ff;
      border-radius: 10px;
      padding: 12px;
      overflow-x: auto;
      margin: 12px 0;
      white-space: pre-wrap;
      word-break: break-word;
    }
    code {
      font-family: "SF Mono", "Menlo", "Consolas", monospace;
      font-size: 9.5pt;
      background: #edf3ff;
      color: #0f3a79;
      border-radius: 5px;
      padding: 1px 4px;
    }
    pre code {
      background: transparent;
      color: inherit;
      padding: 0;
      font-size: 9pt;
    }
    a {
      color: #174ea6;
      text-decoration: none;
      border-bottom: 1px solid rgba(23, 78, 166, 0.35);
    }
    .content {
      font-size: 11pt;
    }
  </style>
</head>
<body>
  <main class="sheet">
    <section class="header">
      <h1>${escapeHtml(title)}</h1>
      ${excerpt ? `<p class="excerpt">${escapeHtml(excerpt)}</p>` : ''}
      <div class="meta">${publishedLabel}</div>
      ${tagsHtml}
    </section>
    <section class="content">
      ${contentHtml}
    </section>
  </main>
</body>
</html>`;
}

function toSlug(frontmatter, fileName) {
  if (frontmatter.slug && typeof frontmatter.slug === 'string') {
    return frontmatter.slug.trim();
  }
  return fileName.replace(/\.md$/i, '');
}

function renderPdf(htmlPath, pdfPath) {
  const inputUrl = `file://${htmlPath}`;
  execFileSync(
    chromePath,
    [
      '--headless=new',
      '--disable-gpu',
      '--allow-file-access-from-files',
      '--print-to-pdf-no-header',
      `--print-to-pdf=${pdfPath}`,
      inputUrl
    ],
    { stdio: 'inherit' }
  );
}

const markdownFiles = readdirSync(notesDir).filter((file) => file.endsWith('.md'));
if (!markdownFiles.length) {
  console.log(`No markdown files found in ${notesDir}`);
  process.exit(0);
}

const outputs = [];
for (const file of markdownFiles) {
  const source = readFileSync(path.join(notesDir, file), 'utf8');
  const { frontmatter, body } = parseFrontmatter(source);
  const slug = toSlug(frontmatter, file);
  const html = buildHtmlDoc(frontmatter, markdownToHtml(body));
  const htmlPath = path.join(tempDir, `${slug}.html`);
  const pdfPath = path.join(outDir, `${slug}.pdf`);

  writeFileSync(htmlPath, html, 'utf8');
  renderPdf(htmlPath, pdfPath);
  outputs.push(pdfPath);
}

console.log('\nGenerated PDFs:');
for (const out of outputs) {
  console.log(`- ${out}`);
}
