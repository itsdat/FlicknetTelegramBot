import { NextResponse } from 'next/server';
import axios from 'axios';

export async function POST(request) {
    try {
        const body = await request.json();
        const { message } = body;

        if (!message || !message.text) {
            return NextResponse.json({ ok: true });
        }

        const chatId = message.chat.id;
        const text = message.text.trim();

        // --- LOGIC XỬ LÝ NHƯ FLOW MAKE ---

        // 1. Nếu là lệnh tìm kiếm (Ví dụ người dùng gõ tên phim)
        if (!text.includes('-') && !text.startsWith('/')) {
            const { data: searchData } = await axios.get(`https://phimapi.com/v1/api/tim-kiem?keyword=${encodeURIComponent(text)}&limit=10`);
            const items = searchData.data.items;

            if (items.length === 0) {
                await sendTelegram(chatId, "❌ Không tìm thấy phim này!");
            } else {
                const buttons = items.map(item => ([{
                    text: `🎬 ${item.name} (${item.year})`,
                    callback_data: `detail:${item.slug}` // Hoặc hướng dẫn user nhập slug
                }]));
                await sendTelegram(chatId, "🔍 Kết quả tìm kiếm (Nhấn để xem hoặc nhập slug):", buttons);
            }
            return NextResponse.json({ ok: true });
        }

        // 2. Nếu là Slug (Ví dụ: pham-nhan-tu-tien) -> Lấy Details & Telegra.ph
        const slug = text.replace('/', '');
        const { data: movieData } = await axios.get(`https://phimapi.com/phim/${slug}`);
        
        const { movie, episodes } = movieData;
        const serverData = episodes[0].server_data;

        // Map sang Telegra.ph Node
        const contentNodes = serverData.map(ep => ({
            tag: 'p',
            children: [{
                tag: 'a',
                attrs: { href: ep.link_embed },
                children: [`Tập ${ep.name}`]
            }]
        }));

        // Tạo trang Telegra.ph
        const telegraphRes = await axios.post('https://api.telegra.ph/createPage', {
            access_token: 'f3dbce23883249e8e16697324286b1af7ae1a24febce5ab0edd20c5d103f',
            title: movie.name,
            author_name: 'Flicknet Bot',
            content: JSON.stringify(contentNodes),
            return_content: true
        });

        const telegraphUrl = telegraphRes.data.result.url;

        // Gửi tin nhắn cuối
        await sendTelegram(chatId, `🎬 *${movie.name}*\n✅ ${movie.episode_current}`, [
            [{ text: "🚀 Xem Danh Sách Tập", url: telegraphUrl }]
        ]);

    } catch (error) {
        console.error('Webhook Error:', error);
        // Nhánh này tương đương module Ignore trong Make
        return NextResponse.json({ ok: true }); 
    }

    return NextResponse.json({ ok: true });
}

// Hàm bổ trợ gửi tin Telegram
async function sendTelegram(chatId, text, inline_keyboard = []) {
    const url = `https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`;
    return await axios.post(url, {
        chat_id: chatId,
        text: text,
        parse_mode: 'Markdown',
        reply_markup: inline_keyboard.length > 0 ? { inline_keyboard } : {}
    });
}