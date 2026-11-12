import { sql, json, method, getCookie, hashToken, clearSessionCookie } from "../_db.js";
export default async function handler(req,res) {
  if (!method(req,res,["POST"])) return;
  const token=getCookie(req,"dsr_session");
  if(token) { try { await sql`DELETE FROM sessions WHERE token_hash=${hashToken(token)}`; } catch(e){ console.error(e); } }
  clearSessionCookie(res); json(res,200,{success:true});
}
