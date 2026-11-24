import jwt from "jsonwebtoken";
export function authenticate(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: "Authentication required." });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || "development-only-secret");
    req.user = { id: payload.id, organizationId: payload.organizationId, email: payload.email };
    next();
  } catch {
    return res.status(401).json({ message: "Session expired or invalid. Please sign in again." });
  }
}
export function asyncRoute(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}
