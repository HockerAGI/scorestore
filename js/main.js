(function(){
  "use strict";

  const CART_KEY = "score_cart_v2026_prod";
  const API = "/.netlify/functions";

  let cart = [];
  let catalog = { products: [] };
  let shipping = { mode:"pickup", cost:0, quoting:false };

  const $ = id => document.getElementById(id);
  const money = n => new Intl.NumberFormat("es-MX",{style:"currency",currency:"MXN"}).format(n);

  async function init(){
    await loadCatalog();
    loadCart();
    bindUI();
    updateCartUI();
    setTimeout(()=>$("#splash-screen")?.classList.add("hidden"),4000);
  }

  async function loadCatalog(){
    const r = await fetch("/data/catalog.json");
    catalog = await r.json();
  }

  function bindUI(){
    document.querySelectorAll('input[name="shipMode"]').forEach(r=>{
      r.addEventListener("change",e=>{
        shipping.mode = e.target.value;
        $("shipForm").classList.toggle("active", shipping.mode!=="pickup");
        shipping.cost = shipping.mode==="pickup"?0:null;
        if($("cp").value.length===5 && shipping.mode!=="pickup") quoteShipping();
        updateCartUI();
      });
    });

    $("cp").addEventListener("input",e=>{
      if(e.target.value.length===5) quoteShipping();
    });
  }

  async function quoteShipping(){
    if(shipping.mode==="pickup") return;
    shipping.quoting = true;
    updateCartUI();

    try{
      const r = await fetch(`${API}/quote_shipping`,{
        method:"POST",
        body:JSON.stringify({
          zip:$("cp").value,
          country: shipping.mode==="us"?"US":"MX",
          items:cart
        })
      });
      const d = await r.json();
      const floor = shipping.mode==="mx"?250:800;
      shipping.cost = d.ok ? Math.max(d.cost,floor) : floor;
    }catch{
      shipping.cost = shipping.mode==="mx"?250:800;
    }
    shipping.quoting=false;
    updateCartUI();
  }

  function updateCartUI(){
    $("cartCount").innerText = cart.reduce((a,b)=>a+b.qty,0);

    if(!cart.length){
      $("cartItems").innerHTML="";
      $("cartEmpty").style.display="block";
      $("cartFooter").style.display="none";
      return;
    }

    $("cartEmpty").style.display="none";
    $("cartFooter").style.display="block";

    $("cartItems").innerHTML = cart.map((p,i)=>`
      <div class="cartItem">
        <img src="${p.img}" class="cartThumb">
        <div>
          <div class="cName">${p.name}</div>
          <div class="cMeta">${p.size}</div>
          <div class="qtyControl">
            <button class="qtyBtn" onclick="changeQty(${i},-1)">-</button>
            <div class="qtyVal">${p.qty}</div>
            <button class="qtyBtn" onclick="changeQty(${i},1)">+</button>
          </div>
        </div>
        <div class="cRight">
          <div class="cPrice">${money(p.price*p.qty)}</div>
          <div class="cart-remove" onclick="changeQty(${i},-99)">Eliminar</div>
        </div>
      </div>
    `).join("");

    const sub = cart.reduce((a,b)=>a+b.price*b.qty,0);
    $("subTotal").innerText = money(sub);

    if(shipping.mode==="pickup"){
      $("shipTotal").innerText="GRATIS";
      $("grandTotal").innerText=money(sub);
    }else if(shipping.quoting){
      $("shipTotal").innerText="Cotizando…";
    }else{
      $("shipTotal").innerText=money(shipping.cost);
      $("grandTotal").innerText=money(sub+shipping.cost);
    }
  }

  window.changeQty = (i,d)=>{
    cart[i].qty+=d;
    if(cart[i].qty<1) cart.splice(i,1);
    saveCart();
    updateCartUI();
    if(shipping.mode!=="pickup") quoteShipping();
  };

  window.addToCart = id=>{
    const p = catalog.products.find(x=>x.id===id);
    if(!p) return;
    const size = document.querySelector(`[data-id="${id}"] .size-pill.active`)?.dataset.size || "Unitalla";
    const e = cart.find(x=>x.id===id && x.size===size);
    e?e.qty++:cart.push({...p,size,qty:1});
    saveCart(); updateCartUI(); openDrawer();
  };

  window.checkout = async ()=>{
    const r = await fetch(`${API}/create_checkout`,{
      method:"POST",
      body:JSON.stringify({items:cart, shipping})
    });
    const d = await r.json();
    if(d.url) location.href=d.url;
  };

  const saveCart=()=>localStorage.setItem(CART_KEY,JSON.stringify(cart));
  const loadCart=()=>cart=JSON.parse(localStorage.getItem(CART_KEY)||"[]");
  window.openDrawer=()=>{$("drawer").classList.add("active");$("overlay").classList.add("active");};
  window.closeAll=()=>{document.querySelectorAll(".active").forEach(e=>e.classList.remove("active"));};

  document.addEventListener("DOMContentLoaded",init);
})();