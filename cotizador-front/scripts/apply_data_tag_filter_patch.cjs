const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const file = path.join(root, 'src/pages/DashboardPage/index.jsx');

function read() { return fs.readFileSync(file, 'utf8'); }
function write(content) { fs.writeFileSync(file, content, 'utf8'); }

function findFunctionBlock(content, functionName) {
  const start = content.indexOf(`function ${functionName}(`);
  if (start < 0) return null;
  const bodyStart = content.indexOf('{', start);
  if (bodyStart < 0) return null;
  let depth = 0;
  for (let i = bodyStart; i < content.length; i += 1) {
    const ch = content[i];
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return { start, bodyStart, end: i + 1 };
    }
  }
  return null;
}

function patch() {
  let content = read();
  const block = findFunctionBlock(content, 'DataTab');
  if (!block) {
    console.warn('[data-tag-filter] No se encontro DataTab.');
    write(content);
    return;
  }

  let fn = content.slice(block.start, block.end);

  const marker = 'const dataVisibleTags = useMemo(() => {';
  if (!fn.includes(marker)) {
    const insertion = `\n  const dataVisibleTags = useMemo(() => {\n    const props = arguments[0] || {};\n    const productSource = Array.isArray(props.products)\n      ? props.products\n      : Array.isArray(props.filteredProductsForData)\n        ? props.filteredProductsForData\n        : [];\n    const ids = new Set();\n    for (const product of productSource) {\n      const tagIds = Array.isArray(product?.tag_ids) ? product.tag_ids : [];\n      for (const tagId of tagIds) {\n        const numeric = Number(tagId);\n        if (Number.isFinite(numeric) && numeric > 0) ids.add(numeric);\n      }\n    }\n    return (Array.isArray(tags) ? tags : []).filter((tag) => {\n      const tagId = Number(tag?.id || 0);\n      return ids.has(tagId) || Number(tag?.catalog_product_count || 0) > 0;\n    });\n  }, [tags, arguments[0]?.products, arguments[0]?.filteredProductsForData]);\n`;
    const firstBrace = fn.indexOf('{');
    fn = fn.slice(0, firstBrace + 1) + insertion + fn.slice(firstBrace + 1);
  }

  // Solo dentro de DataTab: el filtro de Data debe listar tags presentes en los productos visibles del catalogo.
  fn = fn.replace(/\{\s*tags\.map\(\((tag|t)\) =>/g, '{dataVisibleTags.map(($1) =>');
  fn = fn.replace(/\{\s*\(Array\.isArray\(tags\) \? tags : \[\]\)\.map\(\((tag|t)\) =>/g, '{dataVisibleTags.map(($1) =>');

  content = content.slice(0, block.start) + fn + content.slice(block.end);
  write(content);
  console.log('[data-tag-filter] Patch aplicado.');
}

try {
  patch();
} catch (err) {
  console.error('[data-tag-filter] Error:', err);
  process.exit(1);
}
