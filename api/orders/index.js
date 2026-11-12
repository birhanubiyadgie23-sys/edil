import { sql, json, requireUser, requireAdmin, audit } from "../_db.js";
export default async function handler(req,res){
 try{
  if(req.method==="POST"){
   const user=await requireUser(req,res);if(!user)return;
   const {items}=req.body||{};
   if(!Array.isArray(items)||!items.length)return json(res,400,{success:false,message:"Your cart is empty."});
   const ids=items.map(x=>Number(x.id)).filter(Number.isInteger);
   if(ids.length!==items.length)return json(res,400,{success:false,message:"Invalid cart items."});
   const books=await sql`SELECT id,title,price FROM books WHERE active=TRUE AND id = ANY(${ids})`;
   if(books.length!==ids.length)return json(res,400,{success:false,message:"One or more books are unavailable."});
   const normalized=items.map(i=>{const b=books.find(x=>Number(x.id)===Number(i.id));return {id:b.id,title:b.title,price:Number(b.price),quantity:Math.max(1,Math.min(20,Number(i.quantity)||1))};});
   const total=normalized.reduce((s,i)=>s+i.price*i.quantity,0);
   const rows=await sql`INSERT INTO orders(user_id,customer_name,customer_email,items,total)
    VALUES(${user.id},${user.name},${user.email},${JSON.stringify(normalized)}::jsonb,${total}) RETURNING id,total`;
   const username=process.env.TELEGRAM_USERNAME||"Ychalal2";
   const message=`New DevStackReads order #${rows[0].id}\n${normalized.map(x=>`${x.title} x${x.quantity}: ${(x.price*x.quantity).toFixed(2)} ETB`).join("\n")}\nTotal: ${total.toFixed(2)} ETB\nCustomer: ${user.name} (${user.email})`;
   await audit(user.id,"order.create","order",rows[0].id);
   return json(res,201,{success:true,order:rows[0],telegram_url:`https://t.me/${encodeURIComponent(username)}?text=${encodeURIComponent(message)}`});
  }
  if(req.method==="GET"){
   const admin=await requireAdmin(req,res);if(!admin)return;
   const rows=await sql`SELECT * FROM orders ORDER BY created_at DESC LIMIT 500`;
   return json(res,200,{success:true,orders:rows});
  }
  res.setHeader("Allow","GET, POST");return json(res,405,{success:false});
 }catch(e){console.error(e);json(res,500,{success:false,message:"Order operation failed."});}
}
