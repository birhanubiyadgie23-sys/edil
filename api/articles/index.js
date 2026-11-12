import { sql, json, requireAdmin, audit } from "../_db.js";
const slugify=s=>String(s||"article").toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g,"").trim().replace(/\s+/g,"-").slice(0,90)||"article";
export default async function handler(req,res) {
 try {
  if(req.method==="GET"){
   const rows=await sql`SELECT id,title,slug,author,category,excerpt,content,image_url,published_at,created_at
     FROM articles WHERE status='published' ORDER BY published_at DESC NULLS LAST`;
   return json(res,200,{success:true,articles:rows});
  }
  const admin=await requireAdmin(req,res); if(!admin)return;
  if(req.method==="POST"){
   const b=req.body||{}; if(!b.title?.trim()||!b.content?.trim())return json(res,400,{success:false,message:"Title and article content are required."});
   const slug=slugify(b.slug||b.title)+"-"+Date.now().toString(36);
   const status=b.status==="published"?"published":"draft";
   const rows=await sql`INSERT INTO articles(title,slug,author,category,excerpt,content,image_url,status,published_at)
    VALUES(${b.title.trim()},${slug},${b.author||admin.name},${b.category||"General"},${b.excerpt||""},${b.content},${b.image_url||null},${status},${status==="published"?new Date():null}) RETURNING *`;
   await audit(admin.id,"article.create","article",rows[0].id); return json(res,201,{success:true,article:rows[0]});
  }
  if(req.method==="PUT"||req.method==="PATCH"){
   const b=req.body||{}; if(!b.id)return json(res,400,{success:false,message:"Article id is required."});
   const status=b.status==="published"?"published":b.status==="draft"?"draft":null;
   const rows=await sql`UPDATE articles SET title=COALESCE(${b.title??null},title),author=COALESCE(${b.author??null},author),
    category=COALESCE(${b.category??null},category),excerpt=COALESCE(${b.excerpt??null},excerpt),
    content=COALESCE(${b.content??null},content),image_url=${b.image_url===undefined?null:b.image_url},
    status=COALESCE(${status},status),published_at=CASE WHEN ${status}='published' AND published_at IS NULL THEN NOW() WHEN ${status}='draft' THEN NULL ELSE published_at END,
    updated_at=NOW() WHERE id=${b.id} RETURNING *`;
   if(!rows.length)return json(res,404,{success:false,message:"Article not found."});
   await audit(admin.id,"article.update","article",b.id); return json(res,200,{success:true,article:rows[0]});
  }
  if(req.method==="DELETE"){
   const {id}=req.body||{}; if(!id)return json(res,400,{success:false,message:"Article id is required."});
   await sql`DELETE FROM articles WHERE id=${id}`; await audit(admin.id,"article.delete","article",id); return json(res,200,{success:true});
  }
  res.setHeader("Allow","GET, POST, PUT, PATCH, DELETE"); return json(res,405,{success:false,message:"Method not allowed."});
 }catch(e){console.error(e);json(res,500,{success:false,message:"Article operation failed."});}
}
