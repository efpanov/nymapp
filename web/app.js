const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); document.body.classList.add('tg-theme'); }

const PRODUCTS = {
  FULL_DEV_LEAD: { title:'Разработка под ключ', type:'lead' },
  ONE_TIME_SERVICE_10K: { title:'Приложение для сферы услуг', type:'buy' },
  SCHEDULE_SUB_299: { title:'Расписание', type:'sub' },
  TEST_STAR_1: { title:'Тестовый товар (1 Star)', type:'buy' }
};

// Профиль
const user = tg?.initDataUnsafe?.user;
const usernameEl = document.getElementById('profile-username');
if (usernameEl) usernameEl.textContent = user?.username ? '@'+user.username : 'Гость';

// Табы
const tabs = {
  catalog: document.getElementById('tab-catalog'),
  cart: document.getElementById('tab-cart'),
  profile: document.getElementById('tab-profile'),
};
const tabButtons = Array.from(document.querySelectorAll('.tabbar__btn'));
function openTab(name){
  Object.values(tabs).forEach(t=>t.classList.remove('tab--active'));
  tabs[name].classList.add('tab--active');
  tabButtons.forEach(b=>b.classList.toggle('is-active', b.dataset.target===name));
}
tabButtons.forEach(btn=>btn.addEventListener('click',()=>openTab(btn.dataset.target)));

// Корзина (RAM)
let cart = []; // [{productId, qty}]
const cartList = document.getElementById('cart-list');

function renderCart(){
  if (!cart.length){
    cartList.className = 'empty';
    cartList.textContent = 'Корзина пуста. Вернитесь в каталог и нажмите «Оформить».';
    if (tg){ tg.MainButton.hide(); tg.BackButton?.hide(); }
    return;
  }
  cartList.className = '';
  cartList.innerHTML = cart.map((i,idx)=>`
    <div class="card" style="margin:8px 12px;">
      <div class="card__body">
        <div class="card__row">
          <strong>${PRODUCTS[i.productId].title}</strong>
          <button data-remove="${idx}" class="btn btn--ghost">Удалить</button>
        </div>
        <div class="muted">Кол-во: ${i.qty}</div>
      </div>
    </div>
  `).join('');

  cartList.querySelectorAll('[data-remove]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const idx = parseInt(btn.dataset.remove,10);
      cart.splice(idx,1);
      renderCart();
    });
  });

  if (tg){
    tg.MainButton.setText('Перейти к оплате/заявке');
    tg.MainButton.show();
    tg.offEvent('mainButtonClicked', onCartMainClick);
    tg.onEvent('mainButtonClicked', onCartMainClick);

    tg.BackButton?.show();
    tg.offEvent('backButtonClicked', onBackFromCart);
    tg.onEvent('backButtonClicked', onBackFromCart);
  }
}
function onBackFromCart(){ openTab('catalog'); if (tg){ tg.MainButton.hide(); tg.BackButton?.hide(); }}

// «Оформить» на карточках → в корзину → открыть Корзину
Array.from(document.querySelectorAll('.card__more')).forEach(btn=>{
  btn.addEventListener('click', (e)=>{
    const id = e.currentTarget.dataset.modal;
    const found = cart.find(i=>i.productId===id);
    if (found) found.qty += 1; else cart.push({ productId:id, qty:1 });
    openTab('cart');
    renderCart();
    // подставим username
    const $u = document.getElementById('f-username');
    if ($u && !$u.value) $u.value = user?.username ? `@${user.username}` : '';
  });
});

// Поля оформления
const $u = document.getElementById('f-username');
const $p = document.getElementById('f-phone');
const $c = document.getElementById('f-comment');
if ($u && !$u.value) $u.value = user?.username ? `@${user.username}` : '';

// Нажатие системной кнопки в корзине
async function onCartMainClick(){
  const username = $u?.value.trim() || '';
  const phone = $p?.value.trim() || '';
  const comment = $c?.value.trim() || '';

  // есть ли оплачиваемые товары?
  const hasPayable = cart.some(i => ['TEST_STAR_1','ONE_TIME_SERVICE_10K','SCHEDULE_SUB_299'].includes(i.productId));
  if (!hasPayable){
    // только лиды → уведомить владельца
    await fetch('/api/notify-order', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ initData: tg?.initData, payload: { items: cart, username, phone, comment } })
    }).catch(()=>{});
    tg?.showPopup({ title:'Заявка отправлена', message:'Мы свяжемся с вами.' });
    cart = []; renderCart(); openTab('catalog'); return;
  }

  // создаём инвойс Stars
  const res = await fetch('/api/create-stars-invoice', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ initData: tg?.initData, order: { items: cart, username, phone, comment } })
  });
  const data = await res.json();
  if (data.invoiceLink) tg?.openLink(data.invoiceLink);
  else tg?.showAlert('Не удалось создать счёт. Попробуйте ещё раз.');
}
