import { sql, json, method, requireAdmin, audit } from "../_db.js";
export default async function handler(req,res) {
  try {
    if(req.method==="GET") {
      const rows=await sql`SELECT id,title,author,price,image_url,description,stock FROM books WHERE active=TRUE ORDER BY created_at DESC`;
      return json(res,200,{success:true,books:rows});
    }
    if(req.method==="POST") {
      const admin=await requireAdmin(req,res); if(!admin)return;
      const {title,author,price,image_url,description,stock}=req.body||{};
      if(!title?.trim()||!author?.trim()||!Number.isFinite(Number(price))||Number(price)<0)
        return json(res,400,{success:false,message:"Title, author, and a valid non-negative price are required."});
      const rows=await sql`INSERT INTO books(title,author,price,image_url,description,stock)
        VALUES(${title.trim()},${author.trim()},${Number(price)},${image_url||null},${description||""},${Math.max(0,Number(stock)||0)})
        RETURNING *`;
      await audit(admin.id,"book.create","book",rows[0].id);
      return json(res,201,{success:true,book:rows[0]});
    }
    if(req.method==="PUT"||req.method==="PATCH") {
      const admin=await requireAdmin(req,res); if(!admin)return;
      const {id,title,author,price,image_url,description,stock,active}=req.body||{};
      if(!id) return json(res,400,{success:false,message:"Book id is required."});
      const rows=await sql`UPDATE books SET title=COALESCE(${title??null},title),author=COALESCE(${author??null},author),
        price=COALESCE(${price===undefined?null:Number(price)},price),image_url=${image_url===undefined?null:image_url},
        description=COALESCE(${description??null},description),stock=COALESCE(${stock===undefined?null:Number(stock)},stock),
        active=COALESCE(${active??null},active),updated_at=NOW() WHERE id=${id} RETURNING *`;
      if(!rows.length)return json(res,404,{success:false,message:"Book not found."});
      await audit(admin.id,"book.update","book",id); return json(res,200,{success:true,book:rows[0]});
    }
    if(req.method==="DELETE") {
      const admin=await requireAdmin(req,res); if(!admin)return;
      const {id}=req.body||{}; if(!id)return json(res,400,{success:false,message:"Book id is required."});
      await sql`UPDATE books SET active=FALSE,updated_at=NOW() WHERE id=${id}`;
      await audit(admin.id,"book.archive","book",id); return json(res,200,{success:true});
    }
    res.setHeader("Allow","GET, POST, PUT, PATCH, DELETE"); return json(res,405,{success:false,message:"Method not allowed."});
  } catch(e){console.error(e);json(res,500,{success:false,message:"Book operation failed."});}
}
