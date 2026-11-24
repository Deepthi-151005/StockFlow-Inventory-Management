import { Router } from "express";
import { z } from "zod";
import db from "../db.js";
import { audit, productForOrg } from "../utils.js";
const router = Router();
const schema = z.object({
  name: z.string().trim().min(1).max(120),
  sku: z.string().trim().min(1).max(60),
  description: z.string().max(1000).optional().default(""),
  category: z.string().trim().max(60).optional().default("General"),
  quantity: z.coerce.number().int().min(0).max(100000000),
  costPrice: z.coerce.number().min(0).max(100000000).optional().default(0),
  sellingPrice: z.coerce.number().min(0).max(100000000).optional().default(0),
  lowStockThreshold: z.coerce.number().int().min(0).nullable().optional()
});
function clean(p) {
  return { name:p.name, sku:p.sku, description:p.description, category:p.category || "General",
    quantity:p.quantity, cost_price:p.costPrice, selling_price:p.sellingPrice,
    low_stock_threshold:p.lowStockThreshold ?? null };
}
router.get("/", (req, res) => {
  const org = req.user.organizationId;
  const search = String(req.query.search || "").trim();
  const category = String(req.query.category || "").trim();
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const where = ["organization_id=?"]; const args = [org];
  if (search) { where.push("(name LIKE ? OR sku LIKE ?)"); args.push(`%${search}%`,`%${search}%`); }
  if (category) { where.push("category=?"); args.push(category); }
  const clause = where.join(" AND ");
  const total = db.prepare(`SELECT COUNT(*) count FROM products WHERE ${clause}`).get(...args).count;
  const rows = db.prepare(`SELECT * FROM products WHERE ${clause} ORDER BY updated_at DESC LIMIT ? OFFSET ?`)
    .all(...args, limit, (page-1)*limit);
  res.json({ products: rows, pagination: { page, limit, total, pages: Math.ceil(total/limit) } });
});
router.get("/:id", (req,res) => {
  const p = productForOrg(Number(req.params.id), req.user.organizationId);
  if (!p) return res.status(404).json({ message:"Product not found." });
  res.json({ product:p });
});
router.post("/", (req,res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message:parsed.error.issues[0].message });
  const p = clean(parsed.data), org = req.user.organizationId;
  try {
    const result = db.prepare(`INSERT INTO products
      (organization_id,name,sku,description,category,quantity,cost_price,selling_price,low_stock_threshold)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(org,p.name,p.sku,p.description,p.category,p.quantity,p.cost_price,p.selling_price,p.low_stock_threshold);
    audit(org,req.user.id,"PRODUCT_CREATED","product",result.lastInsertRowid,`Created ${p.name}`);
    if (p.quantity > 0) db.prepare(`INSERT INTO stock_movements
      (organization_id,product_id,user_id,change_amount,previous_quantity,new_quantity,note)
      VALUES (?,?,?,?,?,?,?)`).run(org,result.lastInsertRowid,req.user.id,p.quantity,0,p.quantity,"Opening stock");
    res.status(201).json({ product:productForOrg(result.lastInsertRowid,org) });
  } catch(e) {
    if (String(e.message).includes("UNIQUE")) return res.status(409).json({message:"That SKU already exists in your organization."});
    throw e;
  }
});
router.put("/:id", (req,res) => {
  const id=Number(req.params.id), org=req.user.organizationId;
  const old=productForOrg(id,org);
  if (!old) return res.status(404).json({message:"Product not found."});
  const parsed=schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({message:parsed.error.issues[0].message});
  const p=clean(parsed.data);
  try {
    const tx=db.transaction(()=>{
      db.prepare(`UPDATE products SET name=?,sku=?,description=?,category=?,quantity=?,cost_price=?,selling_price=?,
        low_stock_threshold=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organization_id=?`)
        .run(p.name,p.sku,p.description,p.category,p.quantity,p.cost_price,p.selling_price,p.low_stock_threshold,id,org);
      if (p.quantity !== old.quantity) db.prepare(`INSERT INTO stock_movements
        (organization_id,product_id,user_id,change_amount,previous_quantity,new_quantity,note)
        VALUES (?,?,?,?,?,?,?)`).run(org,id,req.user.id,p.quantity-old.quantity,old.quantity,p.quantity,"Quantity changed while editing product");
      audit(org,req.user.id,"PRODUCT_UPDATED","product",id,`Updated ${p.name}`);
    }); tx();
    res.json({product:productForOrg(id,org)});
  } catch(e) {
    if (String(e.message).includes("UNIQUE")) return res.status(409).json({message:"That SKU already exists in your organization."});
    throw e;
  }
});
router.delete("/:id",(req,res)=>{
  const id=Number(req.params.id),org=req.user.organizationId,p=productForOrg(id,org);
  if(!p) return res.status(404).json({message:"Product not found."});
  db.prepare("DELETE FROM products WHERE id=? AND organization_id=?").run(id,org);
  audit(org,req.user.id,"PRODUCT_DELETED","product",id,`Deleted ${p.name}`);
  res.json({message:"Product deleted."});
});
router.post("/:id/adjust",(req,res)=>{
  const id=Number(req.params.id),org=req.user.organizationId,p=productForOrg(id,org);
  if(!p) return res.status(404).json({message:"Product not found."});
  const parsed=z.object({change:z.coerce.number().int().refine(n=>n!==0),note:z.string().trim().min(2).max(200)}).safeParse(req.body);
  if(!parsed.success) return res.status(400).json({message:"Enter a non-zero whole-number adjustment and a short reason."});
  const next=p.quantity+parsed.data.change;
  if(next<0) return res.status(400).json({message:"Stock cannot become negative."});
  const tx=db.transaction(()=>{
    db.prepare("UPDATE products SET quantity=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organization_id=?").run(next,id,org);
    db.prepare(`INSERT INTO stock_movements
      (organization_id,product_id,user_id,change_amount,previous_quantity,new_quantity,note) VALUES (?,?,?,?,?,?,?)`)
      .run(org,id,req.user.id,parsed.data.change,p.quantity,next,parsed.data.note);
    audit(org,req.user.id,"STOCK_ADJUSTED","product",id,`${p.sku}: ${p.quantity} → ${next}`);
  }); tx();
  res.json({product:productForOrg(id,org)});
});
export default router;
