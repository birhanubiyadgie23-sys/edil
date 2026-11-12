import { sql, json, requireAdmin, audit } from "../_db.js";
export default async function handler(req,res){
 try{
  if(req.method==="GET"){const rows=await sql`SELECT * FROM memberships WHERE active=TRUE ORDER BY price`;return json(res,200,{success:true,memberships:rows});}
  const admin=await requireAdmin(req,res);if(!admin)return;
  if(req.method==="POST"){
   const b=req.body||{};if(!b.title?.trim())return json(res,400,{success:false,message:"Membership title required."});
   const rows=await sql`INSERT INTO memberships(title,description,price,duration) VALUES(${b.title},${b.description||""},${Number(b.price)||0},${b.duration||""}) RETURNING *`;
   await audit(admin.id,"membership.create","membership",rows[0].id);return json(res,201,{success:true,membership:rows[0]});
  }
  if(req.method==="DELETE"){const {id}=req.body||{};await sql`UPDATE memberships SET active=FALSE WHERE id=${id}`;await audit(admin.id,"membership.archive","membership",id);return json(res,200,{success:true});}
  res.setHeader("Allow","GET, POST, DELETE");return json(res,405,{success:false});
 }catch(e){console.error(e);json(res,500,{success:false,message:"Membership operation failed."});}
}
