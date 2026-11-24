import db from "./db.js";
export function audit(orgId, userId, action, entityType, entityId, details = "") {
  db.prepare(`INSERT INTO audit_logs (organization_id,user_id,action,entity_type,entity_id,details)
    VALUES (?,?,?,?,?,?)`).run(orgId, userId, action, entityType, entityId ?? null, details);
}
export function productForOrg(id, orgId) {
  return db.prepare("SELECT * FROM products WHERE id=? AND organization_id=?").get(id, orgId);
}
export function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, organizationId: user.organization_id, organizationName: user.organization_name };
}
export function csvEscape(value) {
  const s = String(value ?? "");
  return `"${s.replaceAll('"', '""')}"`;
}
