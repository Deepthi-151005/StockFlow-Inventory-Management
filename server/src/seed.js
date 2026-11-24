import bcrypt from "bcryptjs";
import db from "./db.js";
const email="demo@stockflow.local";
let user=db.prepare("SELECT id,organization_id FROM users WHERE email=?").get(email);
if(!user){
 const org=db.prepare("INSERT INTO organizations(name) VALUES (?)").run("Demo Store");
 const u=db.prepare("INSERT INTO users(organization_id,name,email,password_hash) VALUES (?,?,?,?)")
  .run(org.lastInsertRowid,"Demo Owner",email,bcrypt.hashSync("StockFlow@123",12));
 user={id:u.lastInsertRowid,organization_id:org.lastInsertRowid};
}
const count=db.prepare("SELECT COUNT(*) count FROM products WHERE organization_id=?").get(user.organization_id).count;
if(!count){
 const products=[
 ["Wireless Mouse","ACC-1001","Ergonomic wireless mouse","Accessories",42,450,799,8],
 ["Mechanical Keyboard","ACC-1002","RGB mechanical keyboard","Accessories",6,1800,2499,10],
 ["USB-C Hub","ACC-1003","7-in-1 USB-C hub","Electronics",3,950,1499,5],
 ["Laptop Stand","OFF-2001","Aluminium adjustable stand","Office",18,650,1099,5],
 ["Webcam HD","ELC-3001","1080p conferencing webcam","Electronics",0,1100,1799,4],
 ["Desk Lamp","OFF-2002","LED adjustable desk lamp","Office",25,380,699,6]
 ];
 const stmt=db.prepare(`INSERT INTO products(organization_id,name,sku,description,category,quantity,cost_price,selling_price,low_stock_threshold)
 VALUES(?,?,?,?,?,?,?,?,?)`);
 const tx=db.transaction(()=>products.forEach(p=>{
  const r=stmt.run(user.organization_id,...p);
  if(p[4]>0) db.prepare(`INSERT INTO stock_movements(organization_id,product_id,user_id,change_amount,previous_quantity,new_quantity,note)
   VALUES(?,?,?,?,?,?,?)`).run(user.organization_id,r.lastInsertRowid,user.id,p[4],0,p[4],"Opening stock");
 }));
 tx();
}
console.log("Demo data ready: demo@stockflow.local / StockFlow@123");
