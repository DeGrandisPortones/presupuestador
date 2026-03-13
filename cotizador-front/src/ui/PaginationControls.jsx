import Button from "./Button.jsx";

function buildPageItems(currentPage, totalPages) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, idx) => idx + 1);
  }

  const items = [1];
  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);

  if (start > 2) items.push("left-ellipsis");

  for (let page = start; page <= end; page += 1) {
    items.push(page);
  }

  if (end < totalPages - 1) items.push("right-ellipsis");

  items.push(totalPages);
  return items;
}

export default function PaginationControls({
  page,
  totalItems,
  pageSize = 25,
  onPageChange,
}) {
  const totalPages = Math.max(1, Math.ceil(Number(totalItems || 0) / Number(pageSize || 25)));

  if (totalItems <= pageSize) return null;

  const currentPage = Math.min(Math.max(1, Number(page || 1)), totalPages);
  const firstItem = (currentPage - 1) * pageSize + 1;
  const lastItem = Math.min(currentPage * pageSize, totalItems);
  const pageItems = buildPageItems(currentPage, totalPages);

  return (
    <div
      style={{
        marginTop: 12,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      <div className="muted">
        Mostrando {firstItem} - {lastItem} de {totalItems}
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <Button
          variant="ghost"
          disabled={currentPage <= 1}
          onClick={() => onPageChange?.(currentPage - 1)}
        >
          Anterior
        </Button>

        {pageItems.map((item) => {
          if (typeof item !== "number") {
            return <span key={item} className="muted">…</span>;
          }

          return (
            <Button
              key={item}
              variant={item === currentPage ? "primary" : "ghost"}
              onClick={() => onPageChange?.(item)}
            >
              {item}
            </Button>
          );
        })}

        <Button
          variant="ghost"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange?.(currentPage + 1)}
        >
          Siguiente
        </Button>
      </div>
    </div>
  );
}
