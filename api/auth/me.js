import { json, method, currentUser } from "../_db.js";
export default async function handler(req,res) {
  if (!method(req,res,["GET"])) return;
  try { const user=await currentUser(req); json(res,200,{success:true,user:user?{id:user.id,name:user.name,email:user.email,role:user.role}:null}); }
  catch(e){ console.error(e); json(res,500,{success:false,message:"Could not verify session."}); }
}
