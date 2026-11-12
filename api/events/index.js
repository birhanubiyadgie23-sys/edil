import { sql, json, requireAdmin, audit } from "../_db.js";
export default async function handler(req,res){
 try{
  if(req.method==="GET"){const rows=await sql`SELECT * FROM events WHERE status='published' ORDER BY event_date ASC NULLS LAST`;return json(res,200,{success:true,events:rows});}
  const admin=await requireAdmin(req,res);if(!admin)return;
  if(req.method==="POST"){
   const b=req.body||{};if(!b.title?.trim())return json(res,400,{success:false,message:"Event title required."});
   const rows=await sql`INSERT INTO events(title,description,event_date,location,image_url,status)
    VALUES(${b.title},${b.description||""},${b.event_date||null},${b.location||""},${b.image_url||null},${b.status==="draft"?"draft":"published"}) RETURNING *`;
   await audit(admin.id,"event.create","event",rows[0].id);return json(res,201,{success:true,event:rows[0]});
  }
  if(req.method==="DELETE"){const {id}=req.body||{};await sql`DELETE FROM events WHERE id=${id}`;await audit(admin.id,"event.delete","event",id);return json(res,200,{success:true});}
  res.setHeader("Allow","GET, POST, DELETE");return json(res,405,{success:false});
 }catch(e){console.error(e);json(res,500,{success:false,message:"Event operation failed."});}
}
