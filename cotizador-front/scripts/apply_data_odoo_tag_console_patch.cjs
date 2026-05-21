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

function ensureImport(content) {
  if (!content.includes('import { http } from "../../api/http.js";')) {
    content = content.replace(
      'import Input from "../../ui/Input.jsx";',
      'import Input from "../../ui/Input.jsx";\nimport { http } from "../../api/http.js";',
    );
  }
  return content;
}

function patch() {
  let content = ensureImport(read());
  const block = findFunctionBlock(content, 'DataTab');
  if (!block) {
    console.warn('[data-odoo-tag-console] No se encontro DataTab.');
    write(content);
    return;
  }

  let fn = content.slice(block.start, block.end);
  const marker = '[DATA ODOO DEBUG]';
  if (!fn.includes(marker)) {
    const insertion = `
  const __dataOdooDebugProps = arguments[0] || {};
  const __dataOdooDebugProducts = Array.isArray(__dataOdooDebugProps.products)
    ? __dataOdooDebugProps.products
    : Array.isArray(__dataOdooDebugProps.filteredProductsForData)
      ? __dataOdooDebugProps.filteredProductsForData
      : [];
  const __dataOdooDebugTags = Array.isArray(__dataOdooDebugProps.tags) ? __dataOdooDebugProps.tags : [];
  const __dataOdooDebugTagFilter = __dataOdooDebugProps.tagFilter;

  useEffect(() => {
    function normalizeDebugTagName(value) {
      return String(value || "")
        .normalize("NFD")
        .replace(/[\\u0300-\\u036f]/g, "")
        .trim()
        .toLowerCase();
    }

    const selectedTagId = Number(__dataOdooDebugTagFilter || 0) || null;
    const selectedTag = selectedTagId
      ? __dataOdooDebugTags.find((tag) => Number(tag?.id || 0) === selectedTagId)
      : null;
    const puertaTag = __dataOdooDebugTags.find((tag) => normalizeDebugTagName(tag?.name) === "puerta") || null;
    const tagToDebug = selectedTag || puertaTag || { name: "Puerta", id: null };
    const tagName = String(tagToDebug?.name || "Puerta").trim() || "Puerta";
    const productQuery = "SIN PUERTA";
    const templateId = 3006;
    const matchingVisibleProducts = __dataOdooDebugProducts.filter((product) => {
      const tagNames = [
        ...(Array.isArray(product?.tags) ? product.tags : []),
        ...(Array.isArray(product?.tag_debug) ? product.tag_debug.map((item) => item?.name).filter(Boolean) : []),
      ];
      return tagNames.some((name) => normalizeDebugTagName(name) === normalizeDebugTagName(tagName));
    });
    const signature = [
      "data-odoo-tag-debug",
      tagName,
      __dataOdooDebugTagFilter || "all",
      __dataOdooDebugProducts.length,
      __dataOdooDebugTags.length,
    ].join("|");

    if (typeof window !== "undefined") {
      if (window.__presupuestadorDataOdooTagDebugSignature === signature) return;
      window.__presupuestadorDataOdooTagDebugSignature = signature;
    }

    let cancelled = false;
    (async () => {
      console.group("[DATA ODOO DEBUG] Tag/Puerta y producto");
      console.log("Props Data", {
        tagFilter: __dataOdooDebugTagFilter,
        selectedTag,
        puertaTag,
        tagToDebug,
        productsVisibleCount: __dataOdooDebugProducts.length,
        tagsVisibleCount: __dataOdooDebugTags.length,
      });
      console.log("Productos visibles que matchean el tag por nombre", matchingVisibleProducts);
      try {
        const tagResponse = await http.get("/api/catalog/odoo-tag-debug", {
          params: {
            tag_name: tagName,
            q: productQuery,
            template_id: templateId,
          },
        });
        if (!cancelled) console.log("GET /api/catalog/odoo-tag-debug", tagResponse.data);
      } catch (err) {
        if (!cancelled) console.error("GET /api/catalog/odoo-tag-debug ERROR", err);
      }
      try {
        const productResponse = await http.get("/api/catalog/odoo-product-debug", {
          params: {
            q: productQuery,
            template_id: templateId,
          },
        });
        if (!cancelled) console.log("GET /api/catalog/odoo-product-debug", productResponse.data);
      } catch (err) {
        if (!cancelled) console.error("GET /api/catalog/odoo-product-debug ERROR", err);
      }
      if (!cancelled) console.groupEnd();
    })();

    return () => {
      cancelled = true;
    };
  }, [__dataOdooDebugTagFilter, __dataOdooDebugProducts, __dataOdooDebugTags]);
`;
    fn = fn.slice(0, block.bodyStart - block.start + 1) + insertion + fn.slice(block.bodyStart - block.start + 1);
  }

  content = content.slice(0, block.start) + fn + content.slice(block.end);
  write(content);
  console.log('[data-odoo-tag-console] Patch aplicado.');
}

try {
  patch();
} catch (err) {
  console.error('[data-odoo-tag-console] Error:', err);
  process.exit(1);
}
