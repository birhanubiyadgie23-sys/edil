import { sql, json, method, requireAdmin } from "../_db.js";
export default async function handler(req,res){
 if(!method(req,res,["GET"]))return;
 try{
  const admin=await requireAdmin(req,res);if(!admin)return;
  const [users,books,articles,orders,revenue,subscribers]=await Promise.all([
   sql`SELECT COUNT(*)::int AS count FROM users`,
   sql`SELECT COUNT(*)::int AS count FROM books WHERE active=TRUE`,
   sql`SELECT COUNT(*)::int AS count FROM articles`,
   sql`SELECT COUNT(*)::int AS count FROM orders`,
   sql`SELECT COALESCE(SUM(total),0)::numeric AS total FROM orders WHERE status IN ('paid','processing','completed')`,
   sql`SELECT COUNT(*)::int AS count FROM newsletter_subscribers WHERE status='active'`
  ]);
  return json(res,200,{success:true,stats:{users:users[0].count,books:books[0].count,articles:articles[0].count,orders:orders[0].count,revenue:revenue[0].total,subscribers:subscribers[0].count}});
 }catch(e){console.error(e);json(res,500,{success:false,message:"Could not load dashboard."});}
}
