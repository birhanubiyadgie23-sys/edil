let cart = [];

document.addEventListener("DOMContentLoaded",()=>{fetchStoreBooks();loadPublicContent();});
async function fetchStoreBooks(){
 const grid=document.getElementById("product-grid");if(!grid)return;
 try{
  const r=await fetch("/api/books"),d=await r.json();grid.innerHTML="";
  if(!d.success||!d.books.length){grid.textContent="ምንም መጽሐፍ አልተገኘም።";return;}
  d.books.forEach(book=>{
   const row=document.createElement("div");row.className="flex items-center justify-between border-b border-gray-100 pb-3 gap-3";
   const info=document.createElement("div");const title=document.createElement("h4");title.className="font-bold text-xs text-gray-900";title.textContent=book.title;
   const meta=document.createElement("p");meta.className="text-[11px] text-gray-500";meta.textContent=`${book.author} — ${book.price} ETB`;
   info.append(title,meta);const btn=document.createElement("button");btn.className="bg-[#d9381e] hover:bg-red-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold";btn.textContent="Buy";btn.addEventListener("click",()=>addToCart(book));row.append(info,btn);grid.append(row);
  });
 }catch(e){console.error(e);grid.textContent="መጽሐፍትን መጫን አልተቻለም።";}
}
function addToCart(book){const found=cart.find(x=>x.id===book.id);if(found)found.quantity++;else cart.push({id:book.id,title:book.title,price:Number(book.price),quantity:1});updateCartUI();alert(`"${book.title}" ወደ ጋሪዎ ገብቷል!`);}
function updateCartUI(){
 const badge=document.getElementById("cart-badge"),mobile=document.getElementById("cart-badge-mobile"),container=document.getElementById("cart-items"),totalEl=document.getElementById("cart-total");
 const count=cart.reduce((s,x)=>s+x.quantity,0),total=cart.reduce((s,x)=>s+x.price*x.quantity,0);
 if(badge)badge.textContent=count;if(mobile)mobile.textContent=count;if(totalEl)totalEl.textContent=`${total.toFixed(2)} ETB`;
 if(container){container.replaceChildren();cart.forEach((item,index)=>{const row=document.createElement("div");row.className="flex justify-between items-center border-b pb-2 text-xs";
 const info=document.createElement("div"),name=document.createElement("p"),price=document.createElement("p");name.className="font-bold";name.textContent=`${item.title} × ${item.quantity}`;price.textContent=`${(item.price*item.quantity).toFixed(2)} ETB`;info.append(name,price);
 const remove=document.createElement("button");remove.className="text-red-500 hover:underline";remove.textContent="Remove";remove.onclick=()=>{cart.splice(index,1);updateCartUI();};row.append(info,remove);container.append(row);});}
}
async function openCheckout(){
 if(!cart.length){alert("ጋሪዎ ባዶ ነው!");return;}
 const me=await fetch("/api/auth/me").then(r=>r.json());if(!me.user){alert("Please log in before checkout.");toggleCart();openAuthModal("login");return;}
 try{
  const r=await fetch("/api/orders",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({items:cart.map(x=>({id:x.id,quantity:x.quantity}))})});
  const d=await r.json();if(!r.ok||!d.success)throw new Error(d.message||"Could not create order.");
  window.open(d.telegram_url,"_blank","noopener");cart=[];updateCartUI();toggleCart();alert(`Order #${d.order.id} created.`);
 }catch(e){alert(e.message);}
}
async function loadPublicContent(){
 try{
  const [articles,events,settings,memberships]=await Promise.all([
   fetch("/api/articles").then(r=>r.json()),fetch("/api/events").then(r=>r.json()),
   fetch("/api/settings").then(r=>r.json()),fetch("/api/membership").then(r=>r.json())
  ]);
  const articleRoot=document.getElementById("articles");
  if(articleRoot&&articles.success&&articles.articles.length){
   const cards=articles.articles.map(a=>`<article class="space-y-4 bg-white p-8 rounded-2xl border border-gray-200 shadow-xs">
    ${a.image_url?`<img src="${escapeAttr(a.image_url)}" alt="" class="w-full max-h-64 object-cover rounded-xl">`:""}
    <div class="text-xs text-[#d9381e] font-bold">${escapeHtml(a.author)} · ${escapeHtml(a.category)}</div>
    <h2 class="font-serif-custom text-3xl font-bold text-gray-900">${escapeHtml(a.title)}</h2>
    <p class="text-gray-700 text-sm leading-relaxed">${escapeHtml(a.excerpt||"")}</p>
    <details><summary class="cursor-pointer text-[#d9381e] font-bold text-sm">Read article</summary><div class="mt-4 text-sm leading-7 whitespace-pre-wrap">${escapeHtml(a.content)}</div></details>
   </article>`).join("");
   const existing=articleRoot.querySelectorAll(":scope > article");if(existing.length===0){const more=articleRoot.querySelector(".grid");articleRoot.insertAdjacentHTML("afterbegin",cards);}
  }
  const eventSection=document.getElementById("events");if(eventSection&&events.success)eventSection.innerHTML=events.events.map(x=>`<div class="bg-white p-5 rounded-xl border"><h3 class="font-bold">${escapeHtml(x.title)}</h3><p>${escapeHtml(x.description||"")}</p></div>`).join("");
  if(settings.success){const s=settings.settings;if(s.site_title)document.title=String(s.site_title);}
 }catch(e){console.warn("Optional public content not loaded",e);}
}
function escapeHtml(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function escapeAttr(v){return escapeHtml(v);}
