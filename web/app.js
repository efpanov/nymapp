require('dotenv').config();
const path = require('path');
const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');                    // ← добавили
const { Telegraf } = require('telegraf');
const { verifyInitData } = require('./utils/verifyInitData');

const app = express();
app.use(express.json());
app.use(cors());                                 // ← включили CORS (нужно, т.к. фронт на Vercel)

const BOT_TOKEN = process.env.BOT_TOKEN;
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'hook';
const PORT = process.env.PORT || 3000;
const XTR_RATE_RUB = parseInt(process.env.XTR_RATE_RUB || '10', 10);
const OWNER_ID = process.env.OWNER_ID;

if (!BOT_TOKEN || !PUBLIC_BASE_URL) {
  console.error('Fill BOT_TOKEN and PUBLIC_BASE_URL in .env');
  process.exit(1);
}

const API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// === Healthcheck (важно для проверки) ===
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, now: new Date().toISOString() });
});

// === Bot ===
const bot = new Telegraf(BOT_TOKEN);

bot.start((ctx) => ctx.reply('Привет! Нажми /shop чтобы открыть NymApp.'));

// Команда для выдачи кнопки web_app в клавиатуре
bot.command('shop', (ctx) => {
  ctx.reply('Открыть NymApp', {
    reply_markup: {
      keyboard: [[{ text: 'Открыть NymApp', web_app: { url: `${PUBLIC_BASE_URL}/` } }]],
      resize_keyboard: true,
      one_time_keyboard: false
    }
  });
});

// Успешная оплата — уведомим владельца
bot.on('message', async (ctx, next) => {
  const sp = ctx.message.successful_payment;
  if (sp) {
    try {
      const payload = JSON.parse(sp.invoice_payload || '{}');
      const buyer = ctx.from?.username ? '@' + ctx.from.username : `${ctx.from?.id}`;
      await ctx.reply('Оплата получена. Спасибо!');

      if (OWNER_ID) {
        const text =
          `✅ Оплата успешна\n` +
          `Покупатель: ${buyer}\n` +
          `Сумма: ${sp.total_amount} ${sp.currency}\n` +
          `Товары: ${Array.isArray(payload.items) ? payload.items.map(i=>i.productId).join(', ') : '—'}`;
        await fetch(`${API}/sendMessage`, {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ chat_id: OWNER_ID, text })
        });
      }
    } catch (e) { console.error('sp payload parse error', e); }
  } else {
    await next();
  }
});

// Webhook
async function setupWebhook() {
  const url = `${PUBLIC_BASE_URL}/bot${WEBHOOK_SECRET}`;
  const r = await fetch(`${API}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type':'application/json' },
    body: JSON.stringify({ url })
  }).then(r => r.json());
  if (!r.ok) {
    console.error('setWebhook error:', r);
    process.exit(1);
  }
  console.log('Webhook set to', url);
}

app.use(`/bot${WEBHOOK_SECRET}`, (req, res) => bot.handleUpdate(req.body, res));

// === Prices in XTR (минимальные единицы) ===
const PRICES = {
  TEST_STAR_1: 1,                              // 1 Star
  ONE_TIME_SERVICE_10K: 10000 * XTR_RATE_RUB,  // 10 000₽
  SCHEDULE_SUB_299: 299 * XTR_RATE_RUB         // 299₽
};

// Уведомить владельца о заявке/оформлении без оплаты
app.post('/api/notify-order', async (req, res) => {
  try {
    const { initData, payload } = req.body;
    if (!verifyInitData(initData, BOT_TOKEN)) return res.status(403).json({ error: 'Bad initData' });
    if (!OWNER_ID) return res.status(500).json({ error: 'OWNER_ID missing' });

    const text =
      `🛒 Новый заказ/заявка\n` +
      `От: ${payload.username || 'без @'}\n` +
      `Тел: ${payload.phone || '—'}\n` +
      `Комментарий: ${payload.comment || '—'}\n` +
      `Товары: ${payload.items?.map(i => i.productId).join(', ') || '—'}`;

    await fetch(`${API}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: OWNER_ID, text })
    });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal error' });
  }
});

// Создание инвойса Stars (для первого оплачиваемого товара в корзине)
app.post('/api/create-stars-invoice', async (req, res) => {
  try {
    const { initData, order } = req.body;
    if (!verifyInitData(initData, BOT_TOKEN)) return res.status(403).json({ error: 'Bad initData' });

    const { items, username, phone, comment } = order || {};
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Empty cart' });

    const payable = items.find(i => ['TEST_STAR_1','ONE_TIME_SERVICE_10K','SCHEDULE_SUB_299'].includes(i.productId));
    if (!payable) return res.status(400).json({ error: 'No payable item' });

    let title = '', description = '', prices = [], subscription_period;

    if (payable.productId === 'TEST_STAR_1') {
      title = 'Тестовый товар';
      description = 'Покупка за 1 Star';
      prices = [{ label: 'Price', amount: PRICES.TEST_STAR_1 }];
    } else if (payable.productId === 'ONE_TIME_SERVICE_10K') {
      title = 'Приложение для сферы услуг';
      description = 'Разовая покупка';
      prices = [{ label: 'Price', amount: PRICES.ONE_TIME_SERVICE_10K }];
    } else if (payable.productId === 'SCHEDULE_SUB_299') {
      title = 'Расписание — подписка 30 дней';
      description = 'Доступ на 30 дней';
      prices = [{ label: '30 days', amount: PRICES.SCHEDULE_SUB_299 }];
      subscription_period = 2592000; // 30 дней
    }

    const payload = JSON.stringify({ items, username, phone, comment });

    const resp = await fetch(`${API}/createInvoiceLink`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        title, description, payload,
        currency:'XTR', prices, subscription_period
      })
    }).then(r=>r.json());

    if (!resp.ok) return res.status(500).json({ error: resp.description });
    res.json({ invoiceLink: resp.result });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal error' });
  }
});

// Static (не обязателен на Railway, но оставим)
app.use(express.static(path.join(__dirname, 'web')));
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'web', 'index.html'));
});

app.listen(PORT, async () => {
  console.log('Server on http://localhost:' + PORT);
  try { await setupWebhook(); } catch (e) { console.warn('Webhook setup skipped:', e.message); }
});
