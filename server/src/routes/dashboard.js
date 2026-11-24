import { Router } from "express";
import db from "../db.js";
const router=Router();
router.get("/",(req,res)=>{
 const org=req.user.organizationId;
 const summary=db.prepare(`SELECT COUNT(*) totalProducts, COALESCE(SUM(quantity),0) totalUnits,
   COALESCE(SUM(quantity*cost_price),0) costValue, COALESCE(SUM(quantity*selling_price),0) retailValue
   FROM products WHERE organization_id=?`).get(org);
 const threshold=db.prepare("SELECT default_threshold FROM organizations WHERE id=?").get(org).default_threshold;
 const low=db.prepare(`SELECT id,name,sku,quantity,COALESCE(low_stock_threshold,?) threshold,category
   FROM products WHERE organization_id=? AND quantity<=COALESCE(low_stock_threshold,?) ORDER BY quantity ASC LIMIT 8`)
   .all(threshold,org,threshold);
 const categories=db.prepare(`SELECT category,COUNT(*) products,SUM(quantity) units FROM products
   WHERE organization_id=? GROUP BY category ORDER BY products DESC LIMIT 8`).all(org);
 const recent=db.prepare(`SELECT m.*,p.name product_name,p.sku,u.name user_name FROM stock_movements m
   JOIN products p ON p.id=m.product_id LEFT JOIN users u ON u.id=m.user_id
   WHERE m.organization_id=? ORDER BY m.created_at DESC LIMIT 6`).all(org);
 res.json({summary,lowStock:low,categories,recentMovements:recent});
});
export default router;
