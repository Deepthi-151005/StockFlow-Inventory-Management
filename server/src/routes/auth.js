import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import db from "../db.js";
import { authenticate } from "../middleware.js";
import { publicUser } from "../utils.js";
const router = Router();
const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(160),
  password: z.string().min(8).max(100),
  organizationName: z.string().trim().min(2).max(100)
});
const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
function tokenFor(user) {
  return jwt.sign({ id: user.id, organizationId: user.organization_id, email: user.email },
    process.env.JWT_SECRET || "development-only-secret", { expiresIn: "8h" });
}
router.post("/register", (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0].message });
  const { name, email, password, organizationName } = parsed.data;
  if (db.prepare("SELECT id FROM users WHERE email=?").get(email))
    return res.status(409).json({ message: "An account with this email already exists." });
  const create = db.transaction(() => {
    const org = db.prepare("INSERT INTO organizations(name) VALUES (?)").run(organizationName);
    const hash = bcrypt.hashSync(password, 12);
    const user = db.prepare("INSERT INTO users(organization_id,name,email,password_hash) VALUES (?,?,?,?)")
      .run(org.lastInsertRowid, name, email.toLowerCase(), hash);
    return db.prepare(`SELECT users.*, organizations.name organization_name FROM users
      JOIN organizations ON organizations.id=users.organization_id WHERE users.id=?`).get(user.lastInsertRowid);
  });
  const user = create();
  res.status(201).json({ token: tokenFor(user), user: publicUser(user) });
});
router.post("/login", (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Enter a valid email and password." });
  const user = db.prepare(`SELECT users.*, organizations.name organization_name FROM users
    JOIN organizations ON organizations.id=users.organization_id WHERE users.email=?`).get(parsed.data.email.toLowerCase());
  if (!user || !bcrypt.compareSync(parsed.data.password, user.password_hash))
    return res.status(401).json({ message: "Incorrect email or password." });
  res.json({ token: tokenFor(user), user: publicUser(user) });
});
router.get("/me", authenticate, (req, res) => {
  const user = db.prepare(`SELECT users.*, organizations.name organization_name FROM users
    JOIN organizations ON organizations.id=users.organization_id WHERE users.id=? AND users.organization_id=?`)
    .get(req.user.id, req.user.organizationId);
  if (!user) return res.status(404).json({ message: "Account not found." });
  res.json({ user: publicUser(user) });
});
export default router;
