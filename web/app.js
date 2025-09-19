// Безопасная инициализация SDK
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
  document.body.classList.add('tg-theme');
}

// Данные продуктов
const PRODUCTS = {
  FULL_DEV_LEAD: {
    title: 'Разработка под ключ',
    desc: 'Проектирование, дизайн, разработка Mini App, интеграции. Индивидуальная смета от 50 000₽.',
    type: 'lead' // без оплаты
  },
  ONE_TIME_SERVICE_10K: {
    title: 'Приложение для сферы услуг',
    desc: 'Готовое решение с настройкой под ваш кейс. Разовая покупка: 10 000₽.',
    type: 'buy'
  },
  SCHEDULE_SUB_299: {
    title: 'Расписание',
    desc: 'Трекер клиентов и записей. Подписка 30 дней: 299₽.',
    type: 'sub'
  }
};

// Обновим профиль из TG
const usernameEl = document.getElementById('profile-username');
const user = tg?.initDataUnsafe?.user;
if (usernameEl) {
  usernameEl.textContent = user?.username ? '@' + user.username : 'Гость';
}

// ===== Табы (каталог/корзина/профиль), как у DurgerKing =====
const tabs = {
  catalog: document.getElementById('tab-catalog'),
  cart: document.getElementById('tab-cart'),
  profile: document.getElementById('tab-profile')
};
const tabButtons = Array.from(document.querySelectorAll('.tabbar__btn'));

function openTab(name) {
  Object.values(tabs).forEach(t => t.classList.remove('tab--active'));
  tabs[name].classList.add('tab--active');
  tabButtons.forEach(b => b.classList.toggle('is-active', b.dataset.target === name));
}
tabButtons.forEach(btn => btn.addEventListener('click', () => openTab(btn.dataset.target)));

// ===== Модалка «Подробнее» =====
const modal = document.getElementById('modal');
const modalTitle = document.getElementById('modal-title');
const modalText = document.getElementById('modal-text');
const btnModalClose = document.getElementById('modal-close');
const btnModalContinue = document.getElementById('modal-continue');

let selectedProduct = null;

function openModal(productId){
  selectedProduct = productId;
  const p = PRODUCTS[productId];
  modalTitle.textContent = p.title;
  modalText.textContent = p.desc;
  modal.classList.remove('hidden');
  modal.style.display = 'grid';
}
function closeModal(){
  modal.classList.add('hidden');
  modal.style.display = 'none';
}
btnModalClose.addEventListener('click', closeModal);
modal.addEventListener('click', (e)=>{ if (e.target === modal) closeModal(); });

// Навесим на кнопки «Подробнее» в карточках
Array.from(document.querySelectorAll('.card__more')).forEach(btn=>{
  btn.addEventListener('click', (e)=>{
    const id = e.currentTarget.dataset.modal;
    openModal(id);
  });
});

// ===== Шторка оформления + системная MainButton (как у DurgerKing) =====
const sheet = document.getElementById('sheet');
const sheetTitle = document.getElementById('sheet-title');
const sheetClose = document.getElementById('sheet-close');

const fUsername = document.getElementById('f-username');
const fPhone = document.getElementById('f-phone');
const fComment = document.getElementById('f-comment');

function openSheet(productId){
  const p = PRODUCTS[productId];
  sheetTitle.textContent = 'Оформление — ' + p.title;

  // Предзаполним username из TG
  fUsername.value = user?.username ? '@' + user.username : '';

  sheet.classList.remove('hidden');
  sheet.style.display = 'block';

  if (tg) {
    // В DurgerKing основная CTA — системная кнопка
    const text = p.type === 'lead' ? 'Отправить заявку' : (p.type === 'buy' ? 'Оплатить' : 'Оформить подписку');
    tg.MainButton.setText(text);
    tg.MainButton.show();

    // BackButton полезен для UX
    tg.BackButton?.show();
    tg.onEvent('backButtonClicked', closeSheet);

    tg.onEvent('mainButtonClicked', onMainButtonClicked);
  }
}
function closeSheet(){
  sheet.classList.add('hidden');
  sheet.style.display = 'none';
  if (tg) {
    tg.MainButton.hide();
    tg.offEvent('mainButtonClicked', onMainButtonClicked);
    tg.BackButton?.hide();
    tg.offEvent('backButtonClicked', closeSheet);
  }
}
sheetClose.addEventListener('click', closeSheet);

// Кнопка «Продолжить» в модалке → открыть оформление
btnModalContinue.addEventListener('click', ()=>{
  closeModal();
  if (selectedProduct) openSheet(selectedProduct);
});

async function onMainButtonClicked(){
  const order = {
    productId: selectedProduct,
    username: fUsername.value.trim(),
    phone: fPhone.value.trim(),
    comment: fComment.value.trim()
  };

  // Лид — без оплаты: отправим и закроем
  if (PRODUCTS[selectedProduct].type === 'lead') {
    try {
      await fetch('/api/send-lead', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ initData: tg?.initData, lead: order })
      });
      tg?.showPopup({ title:'Заявка отправлена', message:'Мы свяжемся с вами.' });
    } catch (_) {
      tg?.showAlert('Не удалось отправить заявку. Попробуйте ещё раз.');
    }
    closeSheet();
    return;
  }

  // Для оплаты Stars нужен ваш backend. Если ещё не подключили — покажем подсказку.
  tg?.showPopup({
    title: 'Оплата',
    message: 'Оплата Stars будет доступна после подключения серверного API (/api/create-stars-invoice).',
    buttons: [{ id:'ok', type:'close', text:'Понятно' }]
  });

  // Когда сервер будет готов, раскомментируй:
  /*
  const res = await fetch('/api/create-stars-invoice', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ initData: tg?.initData, order })
  });
  const data = await res.json();
  if (data.invoiceLink) tg?.openLink(data.invoiceLink);
  else tg?.showAlert('Не удалось создать счёт. Попробуйте ещё раз.');
  */
}
