import { Router } from "express";
import { z } from "zod";
import db from "../db.js";
import { audit, csvEscape } from "../utils.js";
const router=Router();
router.get("/settings",(req,res)=>{
 const org=db.prepare("SELECT name,default_threshold FROM organizations WHERE id=?").get(req.user.organizationId);
 res.json({settings:{organizationName:org.name,defaultThreshold:org.default_threshold}});
});
router.put("/settings",(req,res)=>{
 const parsed=z.object({defaultThreshold:z.coerce.number().int().min(0).max(100000)}).safeParse(req.body);
 if(!parsed.success) return res.status(400).json({message:"Threshold must be a non-negative whole number."});
 db.prepare("UPDATE organizations SET default_threshold=? WHERE id=?").run(parsed.data.defaultThreshold,req.user.organizationId);
 audit(req.user.organizationId,req.user.id,"SETTINGS_UPDATED","organization",req.user.organizationId,"Updated default low-stock threshold");
 res.json({settings:{defaultThreshold:parsed.data.defaultThreshold}});
});
router.get("/movements",(req,res)=>{
 const rows=db.prepare(`SELECT m.*,p.name product_name,p.sku,u.name user_name FROM stock_movements m
 JOIN products p ON p.id=m.product_id LEFT JOIN users u ON u.id=m.user_id
 WHERE m.organization_id=? ORDER BY m.created_at DESC LIMIT 100`).all(req.user.organizationId);
 res.json({movements:rows});
});
router.get("/audit",(req,res)=>{
 const rows=db.prepare(`SELECT a.*,u.name user_name FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id
 WHERE a.organization_id=? ORDER BY a.created_at DESC LIMIT 100`).all(req.user.organizationId);
 res.json({events:rows});
});
router.get("/reports/export",(req,res)=>{
 const rows=db.prepare("SELECT name,sku,description,category,quantity,cost_price,selling_price,low_stock_threshold FROM products WHERE organization_id=? ORDER BY name")
 .all(req.user.organizationId);
 const headers=["name","sku","description","category","quantity","costPrice","sellingPrice","lowStockThreshold"];
 const lines=[headers.join(","),...rows.map(r=>[r.name,r.sku,r.description,r.category,r.quantity,r.cost_price,r.selling_price,r.low_stock_threshold].map(csvEscape).join(","))];
 res.setHeader("Content-Type","text/csv");
 res.setHeader("Content-Disposition",'attachment; filename="stockflow-products.csv"');
 res.send(lines.join("\n"));
});
router.post("/reports/import",(req,res)=>{
 const parsed=z.object({rows:z.array(z.object({
   name:z.string().trim().min(1),sku:z.string().trim().min(1),quantity:z.coerce.number().int().min(0),
   description:z.string().optional().default(""),category:z.string().optional().default("General"),
   costPrice:z.coerce.number().min(0).optional().default(0),sellingPrice:z.coerce.number().min(0).optional().default(0),
   lowStockThreshold:z.coerce.number().int().min(0).nullable().optional()
 })).max(500)}).safeParse(req.body);
 if(!parsed.success) return res.status(400).json({message:"Invalid import data. Check the CSV columns and values."});
 let imported=0,skipped=0;
 const insert=db.prepare(`INSERT INTO products(organization_id,name,sku,description,category,quantity,cost_price,selling_price,low_stock_threshold)
 VALUES(?,?,?,?,?,?,?,?,?)`);
 const tx=db.transaction(rows=>{
   for(const p of rows){
    try{const r=insert.run(req.user.organizationId,p.name,p.sku,p.description,p.category,p.quantity,p.costPrice,p.sellingPrice,p.lowStockThreshold??null);
      imported++;
      if(p.quantity>0) db.prepare(`INSERT INTO stock_movements(organization_id,product_id,user_id,change_amount,previous_quantity,new_quantity,note)
       VALUES(?,?,?,?,?,?,?)`).run(req.user.organizationId,r.lastInsertRowid,req.user.id,p.quantity,0,p.quantity,"CSV import");
    }catch{skipped++;}
   }
   audit(req.user.organizationId,req.user.id,"CSV_IMPORTED","product",null,`Imported ${imported}; skipped ${skipped}`);
 });
 tx(parsed.data.rows);
 res.json({imported,skipped});
});
export default router;
