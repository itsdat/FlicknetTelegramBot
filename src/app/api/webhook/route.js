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
  return await axios.post(`${TELEGRAM_API}/sendMessage`, {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    reply_markup: inline_keyboard.length ? { inline_keyboard } : undefined,
  });
}

async function sendPhoto(chatId, photo, caption, inline_keyboard = []) {
  return await axios.post(`${TELEGRAM_API}/sendPhoto`, {
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
    return await sendMessage(chatId, '❌ Không tìm thấy phim nào phù hợp.');
  }

  for (const item of items) {
    const buttons = [[
      {
        text: `🎬 Xem chi tiết: ${item.name}`,
        switch_inline_query_current_chat: `/details ${item.slug}`,
      },
    ]];
    const caption = `<b>${item.name}</b> (${item.year})\nSlug: <code>${item.slug}</code>`;
    try {
      await sendPhoto(chatId, `${IMG_URL}/${item.thumb_url}`, caption, buttons);
    } catch (e) {
      await sendMessage(chatId, caption, buttons);
    }
  }
}

async function handleDetails(chatId, slug) {
  const { data } = await axios.get(`${PHIM_API}/phim/${slug}`);
  const { movie, episodes } = data;

  if (!movie) {
    return sendMessage(chatId, '❌ Không tìm thấy thông tin phim này.');
  }

  const serverData = episodes?.[0]?.server_data ?? [];
  
  // Tạo Nodes cho Telegraph (chuẩn Node Object)
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
    `✅ Trạng thái: ${movie.episode_current}\n` +
    `⭐ Đánh giá: ${movie.tmdb?.vote_average ?? 'N/A'}/10\n\n` +
    `<i>Nội dung: ${movie.content ? movie.content.replace(/<[^>]*>?/gm, '').substring(0, 150) + '...' : 'Đang cập nhật...'}</i>`;

  const buttons = [[{ text: '📋 Xem danh sách tập phim', url: telegraphUrl }]];

  if (movie.poster_url) {
    return sendPhoto(chatId, `${IMG_URL}/${movie.poster_url}`, caption, buttons);
  }
  return sendMessage(chatId, caption, buttons);
}

// ─── Main Webhook Route ──────────────────────────────────────────
export async function POST(request) {
  try {
    const body = await request.json();
    const message = body.message;

    if (!message?.text) return NextResponse.json({ ok: true });

    const chatId = message.chat.id;
    const text = message.text.trim();

    // 1. Lệnh /start
    if (text === '/start') {
      await sendMessage(chatId, '👋 Chào mừng bạn đến với <b>Flicknet Bot</b>!\n\nHãy nhập tên phim bạn muốn xem vào đây.');
      return NextResponse.json({ ok: true });
    }

    // 2. Lệnh /details (xử lý cả khi có bot username do switch_inline gây ra)
    // Telegram sẽ gửi text kiểu: "/details pham-nhan-tu-tien" 
    // hoặc "@FlicknetBot /details pham-nhan-tu-tien"
    if (text.includes('/details')) {
      const parts = text.split('/details ');
      if (parts.length > 1) {
        const slug = parts[1].trim();
        await handleDetails(chatId, slug);
      }
      return NextResponse.json({ ok: true });
    }

    // 3. Nếu là văn bản thường -> Coi như là từ khóa tìm kiếm
    if (!text.startsWith('/')) {
      await handleSearch(chatId, text);
      return NextResponse.json({ ok: true });
    }

  } catch (error) {
    console.error('Webhook error:', error?.response?.data ?? error.message);
    // Chạy vào đây tương đương với nhánh Error Handler "Ignore" trong Make
  }

  return NextResponse.json({ ok: true });
}