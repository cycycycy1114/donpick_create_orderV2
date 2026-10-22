import { Client } from '@notionhq/client';

const notion = new Client({ auth: process.env.NOTION_TOKEN });

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { nickname, contactType, contactInfo, product, price, quantity, totalPrice, spec, delivery } = req.body || {};
    const dbId = process.env.DATABASE_ID;

    if (!dbId) {
      return res.status(500).json({ success: false, error: "缺少 DATABASE_ID 環境變數" });
    }

    // 🌟 請把左側的引號名稱（例如 "Name", "聯絡方式" 等）改成你 Notion B 表實際建立的欄位名稱！
    const properties = {
      // 1. 第一欄標題 (Title)，通常是買家暱稱或訂單名稱
      "Name": {
        title: [{ text: { content: nickname || '未命名買家' } }]
      },
      // 2. 聯絡管道 (如果是 Select 選單就用 select，若是文字就改 rich_text)
      "聯絡管道": {
        select: { name: contactType || 'Line' }
      },
      // 3. 聯絡資訊
      "聯絡資訊": {
        rich_text: [{ text: { content: contactInfo || '' } }]
      },
      // 4. 商品名稱
      "商品名稱": {
        rich_text: [{ text: { content: product || '' } }]
      },
      // 5. 規格
      "規格": {
        select: { name: spec || '預設規格' }
      },
      // 6. 數量
      "數量": {
        number: Number(quantity) || 1
      },
      // 7. 單價
      "單價": {
        number: Number(price) || 0
      },
      // 8. 總金額
      "總金額": {
        number: Number(totalPrice) || 0
      },
      // 9. 取貨方式
      "取貨方式": {
        select: { name: delivery || '7-11 店到店' }
      },
      // 10. 狀態 (若 Notion 是 status 型態用 status，若是 select 用 select)
      "狀態": {
        status: { name: '待處理' }
      }
    };

    // 寫入 Notion
    await notion.pages.create({
      parent: { database_id: dbId },
      properties: properties
    });

    return res.status(200).json({ success: true, message: 'Success' });

  } catch (error) {
    console.error("Notion 寫入詳細錯誤:", error);
    const errorMsg = error.body ? JSON.stringify(error.body) : (error.message || String(error));
    return res.status(500).json({ success: false, error: errorMsg });
  }
}
