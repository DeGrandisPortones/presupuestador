import jwt from "jsonwebtoken";

export function signToken(user) {
  const payload = {
    user_id: user.id,
    username: user.username,

    is_distribuidor: !!user.is_distribuidor,
    is_vendedor: !!user.is_vendedor,
    is_enc_comercial: !!user.is_enc_comercial,
    is_rev_tecnica: !!user.is_rev_tecnica,

    odoo_partner_id: user.odoo_partner_id ?? null,
  };

  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
}


export function requireAuth(req, res, next) {
  const h = req.headers.authorization || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) return res.status(401).json({ ok: false, error: "Falta Authorization: Bearer <token>" });

  try {
    const decoded = jwt.verify(m[1], process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ ok: false, error: "Token inválido/expirado" });
  }
}
