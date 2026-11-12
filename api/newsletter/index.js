import { sql, json } from "../_db.js";
export default async function handler(req,res){
 try{
  if(req.method==="POST"){
   const email=String(req.body?.email||"").trim().toLowerCase();
   if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return json(res,400,{success:false,message:"Enter a valid email."});
   await sql`INSERT INTO newsletter_subscribers(email) VALUES(${email}) ON CONFLICT(email) DO UPDATE SET status='active'`;
   return json(res,201,{success:true,message:"Subscribed successfully."});
  }
  if(req.method==="GET"){
   const {requireAdmin}=await import("../_db.js");const admin=await requireAdmin(req,res);if(!admin)return;
   const rows=await sql`SELECT id,email,status,created_at FROM newsletter_subscribers ORDER BY created_at DESC`;
   return json(res,200,{success:true,subscribers:rows});
  }
  res.setHeader("Allow","GET, POST");return json(res,405,{success:false});
 }catch(e){console.error(e);json(res,500,{success:false,message:"Newsletter request failed."});}
}
