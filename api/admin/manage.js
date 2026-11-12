import { sql, json, method, requireAdmin, audit } from "../_db.js";
export default async function handler(req,res){
 if(!["GET","PATCH"].includes(req.method)){res.setHeader("Allow","GET, PATCH");return json(res,405,{success:false});}
 try{
  const admin=await requireAdmin(req,res);if(!admin)return;
  if(req.method==="GET"){
   const users=await sql`SELECT id,name,email,role,status,created_at FROM users ORDER BY created_at DESC LIMIT 300`;
   const orders=await sql`SELECT id,customer_name,customer_email,items,total,status,created_at FROM orders ORDER BY created_at DESC LIMIT 300`;
   const logs=await sql`SELECT id,action,target_type,target_id,details,created_at FROM audit_logs ORDER BY created_at DESC LIMIT 100`;
   return json(res,200,{success:true,users,orders,logs});
  }
  const {user_id,role,status,order_id,order_status}=req.body||{};
  if(user_id){
   if(Number(user_id)===Number(admin.id))return json(res,400,{success:false,message:"You cannot change your own account here."});
   await sql`UPDATE users SET role=COALESCE(${role??null},role),status=COALESCE(${status??null},status) WHERE id=${user_id}`;
   await audit(admin.id,"user.update","user",user_id,{role,status});
  }
  if(order_id){
   if(!["pending","paid","processing","completed","cancelled"].includes(order_status))return json(res,400,{success:false,message:"Invalid order status."});
   await sql`UPDATE orders SET status=${order_status} WHERE id=${order_id}`;
   await audit(admin.id,"order.update","order",order_id,{status:order_status});
  }
  return json(res,200,{success:true});
 }catch(e){console.error(e);json(res,500,{success:false,message:"Admin operation failed."});}
}
