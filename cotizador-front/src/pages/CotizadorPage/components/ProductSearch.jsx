import { useEffect, useState } from "react";
import Button from "../../../ui/Button";
import Input from "../../../ui/Input";
import { useQuoteStore } from "../../../domain/quote/store";

export default function ProductSearch({ onSearch }) {
  const addLine = useQuoteStore((s) => s.addLine);

  const [query, setQuery] = useState("");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await onSearch({ query, limit: 10 });
        setItems(res);
      } catch (e) {
        console.error(e);
        setItems([]);
      } finally {
        setLoading(false);
      }
    }, 350);

    return () => clearTimeout(t);
  }, [query, onSearch]);

  return (
    <div>
      <h3 style={{ marginTop: 0 }}>Productos</h3>
      <Input value={query} onChange={setQuery} placeholder="Buscar por nombre o código..." style={{ width: "100%" }} />

      <div className="spacer" />

      {loading && <div className="muted">Buscando...</div>}

      {!loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map((p) => (
            <div key={p.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, border: "1px solid #eee", padding: 10, borderRadius: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {p.name}
                </div>
                <div className="muted">ID: {p.id} {p.code ? `| ${p.code}` : ""}</div>
              </div>
              <Button onClick={() => addLine(p)}>+</Button>
            </div>
          ))}
          {!items.length && <div className="muted">Sin resultados</div>}
        </div>
      )}
    </div>
  );
}
