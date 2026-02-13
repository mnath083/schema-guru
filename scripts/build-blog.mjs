import fs from 'node:fs';
import path from 'node:path';

const root = '/Users/manjunath/Desktop/pegaguru';
const contentDir = path.join(root, 'content/blog');
const blogOutDir = path.join(root, 'blog');
const sitemapPath = path.join(root, 'sitemap.xml');

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function parseFrontmatter(raw) {
  const normalized = raw.replace(/^\uFEFF/, '').replaceAll('\r\n', '\n');
  if (!normalized.startsWith('---\n')) {
    return { data: {}, body: normalized.trim() };
  }
  const endIdx = normalized.indexOf('\n---\n', 4);
  if (endIdx === -1) {
    throw new Error('Frontmatter terminator missing');
  }

  const fmRaw = normalized.slice(4, endIdx);
  const body = normalized.slice(endIdx + 5).trim();
  const lines = fmRaw.split('\n');

  const data = {};
  let currentArrayKey = null;
  for (const line of lines) {
    if (/^\s*-\s+/.test(line) && currentArrayKey) {
      data[currentArrayKey].push(line.replace(/^\s*-\s+/, '').trim());
      continue;
    }

    const keyVal = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!keyVal) continue;

    const key = keyVal[1];
    const val = keyVal[2];
    if (val === '') {
      currentArrayKey = key;
      data[key] = [];
    } else {
      currentArrayKey = null;
      data[key] = val.trim();
    }
  }

  return { data, body };
}

function slugify(value) {
  return value
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '');
}

function deriveTitleFromBody(body, fallbackFileSlug) {
  const firstHeading = body.split('\n').find((line) => line.trim().startsWith('# '));
  if (firstHeading) {
    return firstHeading.trim().slice(2).trim();
  }
  return fallbackFileSlug
    .split('-')
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(' ');
}

function deriveExcerptFromBody(body) {
  const lines = body.split('\n');
  for (const line of lines) {
    const clean = line.trim();
    if (!clean) continue;
    if (clean.startsWith('#')) continue;
    if (clean.startsWith('```')) continue;
    return clean.length > 280 ? `${clean.slice(0, 277)}...` : clean;
  }
  return 'Advanced architecture article.';
}

function normalizePost(rawPost, sourceFile) {
  const fileBase = path.basename(sourceFile, '.md');
  const fileSlug = slugify(fileBase);
  const title = rawPost.title || deriveTitleFromBody(rawPost.content || '', fileSlug);
  const slug = rawPost.slug || fileSlug;
  const excerpt = rawPost.excerpt || deriveExcerptFromBody(rawPost.content || '');
  const publishedAt = rawPost.publishedAt || new Date().toISOString().slice(0, 10);
  const status = rawPost.status || 'draft';
  const tags = Array.isArray(rawPost.tags) && rawPost.tags.length > 0 ? rawPost.tags : ['Architecture'];
  const seoTitle = rawPost.seoTitle || `${title} | PegaGuru Blog`;
  const seoDescription = rawPost.seoDescription || excerpt;

  return {
    ...rawPost,
    title,
    slug,
    excerpt,
    publishedAt,
    status,
    tags,
    seoTitle,
    seoDescription,
    canonicalUrl: rawPost.canonicalUrl || `https://pegaguru.com/blog/${slug}.html`,
    ogImage: rawPost.ogImage || 'https://pegaguru.com/assets/og-blog-default.png',
  };
}

function validatePost(post) {
  const required = ['title', 'slug', 'excerpt', 'publishedAt', 'status', 'seoTitle', 'seoDescription'];
  for (const field of required) {
    if (!post[field] || String(post[field]).trim() === '') {
      throw new Error(`Missing required field: ${field}`);
    }
  }

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(post.slug)) {
    throw new Error(`Invalid slug format: ${post.slug}`);
  }

  if (!Array.isArray(post.tags) || post.tags.length === 0) {
    throw new Error(`Tags must be a non-empty list for slug: ${post.slug}`);
  }

  if (!['draft', 'published'].includes(post.status)) {
    throw new Error(`Invalid status for slug ${post.slug}. Allowed: draft|published`);
  }
}

function markdownToHtml(markdown) {
  const lines = markdown.split('\n');
  let html = '';
  let inCode = false;
  let codeLang = '';
  let inList = false;
  let paragraphBuffer = [];

  const flushParagraph = () => {
    if (paragraphBuffer.length === 0) return;
    html += `<p>${escapeHtml(paragraphBuffer.join(' '))}</p>\n`;
    paragraphBuffer = [];
  };

  const closeList = () => {
    if (!inList) return;
    html += '</ul>\n';
    inList = false;
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (line.startsWith('```')) {
      flushParagraph();
      closeList();
      if (!inCode) {
        inCode = true;
        codeLang = line.slice(3).trim();
        html += `<pre><code${codeLang ? ` class="language-${escapeHtml(codeLang)}"` : ''}>`;
      } else {
        inCode = false;
        html += '</code></pre>\n';
        codeLang = '';
      }
      continue;
    }

    if (inCode) {
      html += `${escapeHtml(rawLine)}\n`;
      continue;
    }

    if (line === '') {
      flushParagraph();
      closeList();
      continue;
    }

    if (line.startsWith('### ')) {
      flushParagraph();
      closeList();
      html += `<h3>${escapeHtml(line.slice(4))}</h3>\n`;
      continue;
    }

    if (line.startsWith('## ')) {
      flushParagraph();
      closeList();
      html += `<h2>${escapeHtml(line.slice(3))}</h2>\n`;
      continue;
    }

    if (line.startsWith('# ')) {
      flushParagraph();
      closeList();
      html += `<h1>${escapeHtml(line.slice(2))}</h1>\n`;
      continue;
    }

    if (line.startsWith('- ')) {
      flushParagraph();
      if (!inList) {
        inList = true;
        html += '<ul>\n';
      }
      html += `<li>${escapeHtml(line.slice(2))}</li>\n`;
      continue;
    }

    paragraphBuffer.push(line.trim());
  }

  flushParagraph();
  closeList();

  return html;
}

function renderShell({ title, description, canonical, ogTitle, ogDescription, ogType, ogUrl, ogImage, bodyAttrs, cssPath, jsPath, navPrefix, navCurrent, content }) {
  const nav = `
    <header class="site-header">
      <div class="container nav-wrap">
        <a class="brand" href="${navPrefix}index.html">PegaGuru</a>
        <button class="menu-toggle" aria-label="Toggle navigation" aria-expanded="false">Menu</button>
        <nav class="site-nav" aria-label="Main Navigation">
          <a href="${navPrefix}index.html"${navCurrent === 'home' ? ' aria-current="page"' : ''}>Home</a>
          <a href="${navPrefix}lsa-readiness-roadmap.html"${navCurrent === 'lsa' ? ' aria-current="page"' : ''}>LSA Readiness Path</a>
          <a href="${navPrefix}mock-interview.html"${navCurrent === 'mock' ? ' aria-current="page"' : ''}>Mock Interviews</a>
          <a href="${navPrefix}blog/index.html"${navCurrent === 'blog' ? ' aria-current="page"' : ''}>Blog</a>
          <a href="${navPrefix}why-senior-devs-fail-lsa.html"${navCurrent === 'why' ? ' aria-current="page"' : ''}>Why Devs Fail LSA</a>
        </nav>
      </div>
    </header>`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <link rel="canonical" href="${escapeHtml(canonical)}" />
    <meta property="og:title" content="${escapeHtml(ogTitle)}" />
    <meta property="og:description" content="${escapeHtml(ogDescription)}" />
    <meta property="og:type" content="${escapeHtml(ogType)}" />
    <meta property="og:url" content="${escapeHtml(ogUrl)}" />
    <meta property="og:image" content="${escapeHtml(ogImage)}" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Fraunces:opsz,wght@9..144,500;9..144,700&display=swap" rel="stylesheet" />
    <link rel="stylesheet" href="${cssPath}" />
  </head>
  <body ${bodyAttrs}>
    ${nav}
    <main>
${content}
    </main>
    <footer class="site-footer">
      <div class="container footer-wrap">
        <p>© <span id="year"></span> PegaGuru. Architecture-first LSA readiness.</p>
      </div>
    </footer>
    <script src="${jsPath}"></script>
  </body>
</html>`;
}

function formatDate(isoDate) {
  const date = new Date(isoDate);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function renderListing(posts) {
  const listHtml = posts
    .map((post) => {
      const tagHtml = post.tags.map((tag) => `<li>${escapeHtml(tag)}</li>`).join('');
      return `<article class="blog-card">
            <p class="blog-meta"><time datetime="${escapeHtml(post.publishedAt)}">${escapeHtml(formatDate(post.publishedAt))}</time></p>
            <h2><a href="${escapeHtml(post.slug)}.html" data-analytics-event="blog_post_open" data-analytics-label="${escapeHtml(post.slug)}">${escapeHtml(post.title)}</a></h2>
            <p>${escapeHtml(post.excerpt)}</p>
            <ul class="blog-tags">${tagHtml}</ul>
          </article>`;
    })
    .join('\n\n');

  const content = `      <section class="section blog-hero">
        <div class="container narrow">
          <p class="eyebrow">PegaGuru Blog</p>
          <h1>Architecture decisions, not platform trivia.</h1>
          <p class="lead">Advanced articles for senior Pega developers, LSAs, and enterprise delivery leaders.</p>
          <div class="cta-row">
            <a class="btn btn-primary" href="https://calendar.google.com/calendar/render?action=TEMPLATE" data-booking-type="individual" data-analytics-event="blog_cta_individual_click" target="_blank" rel="noopener">Individual Path: LSA Readiness Session</a>
            <a class="btn btn-secondary" href="https://calendar.google.com/calendar/render?action=TEMPLATE" data-booking-type="enterprise" data-analytics-event="blog_cta_enterprise_click" target="_blank" rel="noopener">Enterprise Path: Architecture Advisory</a>
          </div>
        </div>
      </section>

      <section class="section section-panel">
        <div class="container narrow">
          <div class="blog-filter-row">
            <span class="filter-label">Topics</span>
            <a class="filter-chip" href="index.html" data-analytics-event="blog_filter_all">All</a>
            <a class="filter-chip" href="index.html" data-analytics-event="blog_filter_constellation">Constellation</a>
            <a class="filter-chip" href="index.html" data-analytics-event="blog_filter_dx">DX Strategy</a>
            <a class="filter-chip" href="index.html" data-analytics-event="blog_filter_architecture">Architecture Reviews</a>
          </div>
        </div>
      </section>

      <section class="section">
        <div class="container narrow blog-list">
${listHtml}
        </div>
      </section>`;

  return renderShell({
    title: 'PegaGuru Blog | Advanced Pega Architecture',
    description: 'Advanced Pega architecture articles on Constellation, DX strategy, AI integration, cloud-native design, and rescue patterns.',
    canonical: 'https://pegaguru.com/blog/',
    ogTitle: 'PegaGuru Blog | Advanced Pega Architecture',
    ogDescription: 'Advanced Pega architecture articles for senior developers and enterprise teams.',
    ogType: 'website',
    ogUrl: 'https://pegaguru.com/blog/',
    ogImage: 'https://pegaguru.com/assets/og-blog-default.png',
    bodyAttrs: 'data-analytics-page="blog_list"',
    cssPath: '../assets/css/styles.css',
    jsPath: '../assets/js/main.js',
    navPrefix: '../',
    navCurrent: 'blog',
    content,
  });
}

function renderPost(post, bodyHtml) {
  const content = `      <article class="section blog-article">
        <div class="container narrow">
          <p class="eyebrow">${escapeHtml(post.tags.slice(0, 2).join(' | '))}</p>
          <h1>${escapeHtml(post.title)}</h1>
          <p class="blog-meta"><time datetime="${escapeHtml(post.publishedAt)}">${escapeHtml(formatDate(post.publishedAt))}</time></p>

${bodyHtml
  .split('\n')
  .map((line) => (line ? `          ${line}` : ''))
  .join('\n')}

          <div class="cta-row">
            <a class="btn btn-primary" href="https://calendar.google.com/calendar/render?action=TEMPLATE" data-booking-type="enterprise" data-analytics-event="blog_post_enterprise_cta" data-analytics-label="${escapeHtml(post.slug)}" target="_blank" rel="noopener">Discuss this architecture decision</a>
            <a class="btn btn-secondary" href="index.html">Back to Blog</a>
          </div>
        </div>
      </article>`;

  return renderShell({
    title: post.seoTitle,
    description: post.seoDescription,
    canonical: post.canonicalUrl || `https://pegaguru.com/blog/${post.slug}.html`,
    ogTitle: post.seoTitle,
    ogDescription: post.seoDescription,
    ogType: 'article',
    ogUrl: post.canonicalUrl || `https://pegaguru.com/blog/${post.slug}.html`,
    ogImage: post.ogImage || 'https://pegaguru.com/assets/og-blog-default.png',
    bodyAttrs: `data-analytics-page="blog_post" data-analytics-slug="${escapeHtml(post.slug)}"`,
    cssPath: '../assets/css/styles.css',
    jsPath: '../assets/js/main.js',
    navPrefix: '../',
    navCurrent: 'blog',
    content,
  });
}

function writeSitemap(posts) {
  const staticUrls = [
    'https://pegaguru.com/',
    'https://pegaguru.com/lsa-readiness-roadmap.html',
    'https://pegaguru.com/mock-interview.html',
    'https://pegaguru.com/why-senior-devs-fail-lsa.html',
    'https://pegaguru.com/blog/',
  ];

  const postUrls = posts.map((post) => `https://pegaguru.com/blog/${post.slug}.html`);
  const all = [...staticUrls, ...postUrls];

  const body = all.map((url) => `  <url>\n    <loc>${url}</loc>\n  </url>`).join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
  fs.writeFileSync(sitemapPath, xml, 'utf8');
}

function run() {
  if (!fs.existsSync(contentDir)) {
    throw new Error(`Missing content dir: ${contentDir}`);
  }
  fs.mkdirSync(blogOutDir, { recursive: true });

  const files = fs.readdirSync(contentDir).filter((name) => name.endsWith('.md')).sort();
  const posts = files.map((file) => {
    const raw = fs.readFileSync(path.join(contentDir, file), 'utf8');
    const parsed = parseFrontmatter(raw);
    const post = normalizePost({ ...parsed.data, content: parsed.body }, file);
    validatePost(post);
    return post;
  });

  const publishedPosts = posts
    .filter((post) => post.status === 'published')
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  const draftPosts = posts.filter((post) => post.status !== 'published');

  const listingHtml = renderListing(publishedPosts);
  fs.writeFileSync(path.join(blogOutDir, 'index.html'), listingHtml, 'utf8');

  for (const post of publishedPosts) {
    const html = renderPost(post, markdownToHtml(post.content));
    fs.writeFileSync(path.join(blogOutDir, `${post.slug}.html`), html, 'utf8');
  }

  writeSitemap(publishedPosts);
  console.log(`Built ${publishedPosts.length} published blog posts`);
  if (draftPosts.length > 0) {
    console.log(`Skipped ${draftPosts.length} draft posts: ${draftPosts.map((post) => post.slug).join(', ')}`);
  }
}

run();
