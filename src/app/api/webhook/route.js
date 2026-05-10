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

// Sửa lại: Mỗi phim ra 1 tin nhắn riêng có ảnh và nút riêng
async function handleSearch(chatId, keyword) {
  const { data } = await axios.get(
    `${PHIM_API}/v1/api/tim-kiem?keyword=${encodeURIComponent(keyword)}&limit=5`
  );
  const items = data?.data?.items ?? [];

  if (!items.length) {
    return sendMessage(chatId, '❌ Không tìm thấy phim nào phù hợp.');
  }

  // Vòng lặp gửi từng phim
  for (const item of items) {
    const buttons = [[
      {
        text: `🎬 Xem chi tiết: ${item.name}`,
        switch_inline_query_current_chat: `/details ${item.slug}`,
      },
    ]];
    
    const caption = `<b>${item.name}</b> (${item.year})\nSlug: <code>${item.slug}</code>`;
    const photo = `${IMG_URL}/${item.thumb_url}`;

    try {
      await sendPhoto(chatId, photo, caption, buttons);
    } catch (e) {
      // Backup nếu phim không có ảnh hoặc link ảnh lỗi
      await sendMessage(chatId, caption, buttons);
    }
  }
}

async function handleDetails(chatId, slug) {
  const { data } = await axios.get(`${PHIM_API}/phim/${slug}`);
  const { movie, episodes } = data;

  if (!movie) return sendMessage(chatId, '❌ Không tìm thấy thông tin phim.');

  const serverData = episodes?.[0]?.server_data ?? [];
  const nodes = serverData.map((ep) => ({
    tag: 'p',
    children: [{ tag: 'a', attrs: { href: ep.link_embed }, children: [`Tập ${ep.name}`] }],
  }));

  const telegraphUrl = await createTelegraphPage(movie.name, nodes);
  const caption = `🎬 <b>${movie.name}</b> (${movie.year})\n✅ ${movie.episode_current}\n\n📋 Danh sách tập đã sẵn sàng!`;
  const buttons = [[{ text: '📋 Xem danh sách tập phim', url: telegraphUrl }]];

  const photo = `${IMG_URL}/${movie.poster_url || movie.thumb_url}`;
  return sendPhoto(chatId, photo, caption, buttons);
}

// ─── Main Webhook Route ──────────────────────────────────────────
export async function POST(request) {
  try {
    const body = await request.json();
    const message = body.message;
    if (!message?.text) return NextResponse.json({ ok: true });

    const chatId = message.chat.id;
    const text = message.text.trim();

    // 1. Dùng Regex để tìm cụm "/details <slug>"
    // Cách này sẽ bắt được slug kể cả khi text là: "@FlicknetBot /details abc-xyz"
    const detailsMatch = text.match(/\/details\s+([a-zA-Z0-9-]+)/);
    
    if (detailsMatch) {
      const slug = detailsMatch[1]; // Lấy group 1 chính là cái slug
      await handleDetails(chatId, slug);
      return NextResponse.json({ ok: true });
    }

    // 2. Lệnh /start
    if (text === '/start') {
      await sendMessage(chatId, '👋 Nhập tên phim để tìm kiếm nhé!');
      return NextResponse.json({ ok: true });
    }

    // 3. Nếu không chứa lệnh /details và không bắt đầu bằng / thì mới là Search
    // Loại bỏ trường hợp user gõ lệnh lạ bắt đầu bằng /
    if (!text.startsWith('/')) {
      await handleSearch(chatId, text);
      return NextResponse.json({ ok: true });
    }

  } catch (error) {
    // Log lỗi chi tiết để debug trên Vercel
    console.error('Webhook error:', error?.response?.data || error.message);
  }
  return NextResponse.json({ ok: true });
}