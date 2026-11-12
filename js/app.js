let authMode = "login";

function openAuthModal(mode) {
  authMode = mode;
  document.getElementById("auth-modal")?.classList.remove("hidden");
  const title=document.getElementById("auth-title"), name=document.getElementById("name-field"), btn=document.getElementById("auth-btn");
  if(mode==="register"){title.textContent="Create an Account";name.classList.remove("hidden");btn.textContent="Sign Up";}
  else{title.textContent="Log In to Your Account";name.classList.add("hidden");btn.textContent="Log In";}
}
function closeAuthModal(){document.getElementById("auth-modal")?.classList.add("hidden");}
async function handleAuthSubmit(e){
 e.preventDefault();
 const email=document.getElementById("auth-email").value.trim(), password=document.getElementById("auth-password").value;
 const name=document.getElementById("auth-name").value.trim();
 try{
  const response=await fetch(authMode==="register"?"/api/auth/register":"/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name,email,password})});
  const data=await response.json();if(!response.ok||!data.success)throw new Error(data.message||"Authentication failed.");
  closeAuthModal();await checkUserSession();alert(authMode==="register"?"Account created successfully!":"Logged in successfully!");
 }catch(err){alert(err.message);}
}
async function checkUserSession(){
 try{
  const r=await fetch("/api/auth/me");const d=await r.json();const user=d.user;
  const auth=document.getElementById("user-auth-area"),profile=document.getElementById("user-profile-area"),username=document.getElementById("logged-username");
  if(user){auth?.classList.add("hidden");profile?.classList.remove("hidden");if(username)username.textContent=user.name;}
  else{auth?.classList.remove("hidden");profile?.classList.add("hidden");}
 }catch(e){console.error("Session check failed",e);}
}
async function logoutUser(){await fetch("/api/auth/logout",{method:"POST"});await checkUserSession();alert("Logged out successfully.");}
function toggleCart(){document.getElementById("cart-drawer")?.classList.toggle("translate-x-full");}
document.addEventListener("DOMContentLoaded",checkUserSession);
