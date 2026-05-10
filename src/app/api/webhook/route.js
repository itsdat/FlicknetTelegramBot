import { NextResponse } from 'next/server';
import axios from 'axios';

const TELEGRAPH_TOKEN = process.env.TELEGRAPH_TOKEN;
const BOT_TOKEN = process.env.BOT_TOKEN;
const PHIM_API = 'https://phimapi.com';
const TELEGRAPH_API = 'https://api.telegra.ph';
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

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
    `${PHIM_API}/v1/api/tim-kiem?keyword=${encodeURIComponent(keyword)}&limit=10`
  );
  const items = data?.data?.items ?? [];

  if (!items.length) {
    return sendMessage(chatId, '❌ Không tìm thấy phim nào.');
  }

  const buttons = items.map((item) => [
    {
      text: `🎬 ${item.name} (${item.year})`,
      switch_inline_query_current_chat: `/details ${item.slug}`,
    },
  ]);

  return sendMessage(chatId, '🔍 <b>Kết quả tìm kiếm:</b>', buttons);
}

async function handleDetails(chatId, slug) {
  const { data } = await axios.get(`${PHIM_API}/phim/${slug}`);
  const { movie, episodes } = data;

  if (!movie) {
    return sendMessage(chatId, '❌ Không tìm thấy phim này.');
  }

  const serverData = episodes?.[0]?.server_data ?? [];

  const nodes = serverData.map((ep) => ({
    tag: 'p',
    children: [
      {
        tag: 'a',
        attrs: { href: ep.link_embed },
        children: [`Tập ${ep.name}`],
      },
    ],
  }));

  const telegraphUrl = await createTelegraphPage(movie.name, nodes);

  const caption =
    `🎬 <b>${movie.name}</b> (${movie.year})\n` +
    `✅ ${movie.episode_current}\n` +
    `⭐ ${movie.tmdb?.vote_average ?? 'N/A'}/10`;

  const buttons = [[{ text: '📋 Xem danh sách tập', url: telegraphUrl }]];

  if (movie.thumb_url) {
    return sendPhoto(
      chatId,
      `https://img.phimapi.com/${movie.thumb_url}`,
      caption,
      buttons
    );
  }

  return sendMessage(chatId, caption, buttons);
}

// ─── Callback query (inline button) ─────────────────────────────
async function handleCallbackQuery(callbackQuery) {
  const chatId = callbackQuery.message.chat.id;
  const data = callbackQuery.data;

  await axios.post(`${TELEGRAM_API}/answerCallbackQuery`, {
    callback_query_id: callbackQuery.id,
  });

  if (data.startsWith('detail:')) {
    const slug = data.replace('detail:', '');
    return handleDetails(chatId, slug);
  }
}

// ─── Main webhook ────────────────────────────────────────────────
export async function POST(request) {
  try {
    const body = await request.json();

    // Callback query từ inline button
    if (body.callback_query) {
      await handleCallbackQuery(body.callback_query);
      return NextResponse.json({ ok: true });
    }

    const message = body.message;
    if (!message?.text) return NextResponse.json({ ok: true });

    const chatId = message.chat.id;
    const text = message.text.trim();

    // /start
    if (text === '/start') {
      await sendMessage(
        chatId,
        '👋 Xin chào! Nhập tên phim để tìm kiếm.'
      );
      return NextResponse.json({ ok: true });
    }

    // /details <slug>
    if (text.startsWith('/details ')) {
      const slug = text.replace('/details ', '').trim();
      await handleDetails(chatId, slug);
      return NextResponse.json({ ok: true });
    }

    // Tìm kiếm theo tên
    if (!text.startsWith('/')) {
      await handleSearch(chatId, text);
      return NextResponse.json({ ok: true });
    }

  } catch (error) {
    console.error('Webhook error:', error?.response?.data ?? error.message);
  }

  return NextResponse.json({ ok: true });
}