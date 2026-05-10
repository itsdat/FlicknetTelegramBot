import { NextResponse } from 'next/server';
import axios from 'axios';

const TELEGRAPH_TOKEN = process.env.TELEGRAPH_TOKEN;
const BOT_TOKEN = process.env.BOT_TOKEN;
const PHIM_API = 'https://phimapi.com';
const TELEGRAPH_API = 'https://api.telegra.ph';
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const IMG_URL = 'https://img.phimapi.com';

// ─── Telegram helpers ───────────────────────────────────────────
async function sendMessage(chatId, text, inline_keyboard = []) {
  return axios.post(`${TELEGRAM_API}/sendMessage`, {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    reply_markup: inline_keyboard.length ? { inline_keyboard } : undefined,
  });
}

async function sendPhoto(chatId, photo, caption, inline_keyboard = []) {
  return axios.post(`${TELEGRAM_API}/sendPhoto`, {
    chat_id: chatId,
    photo,
    caption,
    parse_mode: 'HTML',
    reply_markup: inline_keyboard.length ? { inline_keyboard } : undefined,
  });
}

// ─── Telegraph ──────────────────────────────────────────────────
async function createTelegraphPage(title, nodes) {
  const { data } = await axios.post(`${TELEGRAPH_API}/createPage`, {
    access_token: TELEGRAPH_TOKEN,
    title,
    author_name: 'Flicknet Bot',
    content: JSON.stringify(nodes),
    return_content: false,
  });
  if (!data.ok) throw new Error(`Telegraph error: ${data.error}`);
  return data.result.url;
}
// ─── Handlers ───────────────────────────────────────────────────
async function handleSearch(chatId, keyword) {
  const { data } = await axios.get(
    `${PHIM_API}/v1/api/tim-kiem?keyword=${encodeURIComponent(keyword)}&limit=5`
  );
  const items = data?.data?.items ?? [];

  if (!items.length) {
    return sendMessage(chatId, '❌ Không tìm thấy phim nào phù hợp.');
  }

  for (const item of items) {
    const buttons = [[
      {
        text: `🎬 Xem chi tiết`,
        callback_data: `details:${item.slug}`,  // ← đổi sang callback_data
      },
    ]];

    const caption = `<b>${item.name}</b> (${item.year})`;
    const photo = `${IMG_URL}/${item.thumb_url}`;

    try {
      await sendPhoto(chatId, photo, caption, buttons);
    } catch {
      await sendMessage(chatId, caption, buttons);
    }
  }
}

// ─── Main Webhook Route ──────────────────────────────────────────
export async function POST(request) {
  try {
    const body = await request.json();

    // ← Thêm xử lý callback_query
    if (body.callback_query) {
      const callbackQuery = body.callback_query;
      const chatId = callbackQuery.message.chat.id;
      const data = callbackQuery.data;

      // Trả lời callback để tắt loading
      await axios.post(`${TELEGRAM_API}/answerCallbackQuery`, {
        callback_query_id: callbackQuery.id,
      });

      if (data.startsWith('details:')) {
        const slug = data.replace('details:', '');
        await handleDetails(chatId, slug);
      }

      return NextResponse.json({ ok: true });
    }

    const message = body.message;
    if (!message?.text) return NextResponse.json({ ok: true });

    const chatId = message.chat.id;
    const text = message.text.trim();

    const detailsMatch = text.match(/\/details\s+([a-zA-Z0-9-]+)/);
    if (detailsMatch) {
      await handleDetails(chatId, detailsMatch[1]);
      return NextResponse.json({ ok: true });
    }

    if (text === '/start') {
      await sendMessage(chatId, '👋 Nhập tên phim để tìm kiếm nhé!');
      return NextResponse.json({ ok: true });
    }

    if (!text.startsWith('/')) {
      await handleSearch(chatId, text);
      return NextResponse.json({ ok: true });
    }

  } catch (error) {
    console.error('Webhook error:', error?.response?.data || error.message);
  }

  return NextResponse.json({ ok: true });
}