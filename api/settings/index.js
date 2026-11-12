import { sql, json, requireAdmin, audit } from "../_db.js";
export default async function handler(req,res){
 try{
  if(req.method==="GET"){
   const rows=await sql`SELECT key,value FROM site_settings`;
   return json(res,200,{success:true,settings:Object.fromEntries(rows.map(r=>[r.key,r.value]))});
  }
  if(req.method==="PUT"){
   const admin=await requireAdmin(req,res);if(!admin)return;
   const {settings}=req.body||{};if(!settings||typeof settings!=="object"||Array.isArray(settings))return json(res,400,{success:false,message:"Settings object required."});
   for(const [key,value] of Object.entries(settings)){
    if(!/^[a-z0-9_.-]{1,80}$/i.test(key))continue;
    await sql`INSERT INTO site_settings(key,value) VALUES(${key},${JSON.stringify(value)}::jsonb)
      ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW()`;
   }
   await audit(admin.id,"settings.update","settings",null,{keys:Object.keys(settings)});
   return json(res,200,{success:true});
  }
  res.setHeader("Allow","GET, PUT");return json(res,405,{success:false});
 }catch(e){console.error(e);json(res,500,{success:false,message:"Settings operation failed."});}
}
