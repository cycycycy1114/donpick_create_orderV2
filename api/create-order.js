import { Client } from '@notionhq/client';

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const DATABASE_ID = process.env.DATABASE_ID; // 你的 B 表（訂單資料庫）ID

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { nickname, contactType, contactInfo, product, spec, price, quantity, totalPrice, delivery } = req.body;

    // 檢查必要欄位
    if (!nickname || !contactInfo || !product || !spec) {
      return res.status(400).json({ success: false, error: '請填寫完整的訂單資訊！' });
    }

    // 組合聯絡方式字串（例如：LINE ID: user123）
    const contactFull = `${contactType}: ${contactInfo}`;

    // 寫入 Notion B 表（訂單資料庫）
    // 💡 註解：請確認你 B 表的 Notion 欄位名稱是否與這裡的 key 完全一致
    const response = await notion.pages.create({
      parent: { database_id: DATABASE_ID },
      properties: {
        // 買家暱稱 (Title 欄位)
        "買家暱稱": {
          title: [
            { text: { content: nickname } }
          ]
        },
        // 聯絡方式 (Rich Text 欄位)
        "聯絡方式": {
          rich_text: [
            { text: { content: contactFull } }
          ]
        },
        // 商品/規格 (Rich Text 欄位，會記錄如: 韓國帆布袋 - 奶茶色)
        "規格": {
          rich_text: [
            { text: { content: spec } }
          ]
        },
        // 數量 (Number 欄位)
        "數量": {
          number: Number(quantity) || 1
        },
        // 單價 (Number 欄位)
        "單價": {
          number: Number(price) || 0
        },
        // 總金額 (Number 欄位)
        "總金額": {
          number: Number(totalPrice) || 0
        },
        // 取貨方式 (Select 欄位)
        "取貨方式": {
          select: {
            name: delivery || "7-11 店到店"
          }
        },
        // 訂單狀態 (Status 或 Select 欄位)
        "狀態": {
          status: {
            name: "待處理"
          }
        }
      }
    });

    return res.status(200).json({ success: true, message: '訂單建立成功！', data: response });
  } catch (error) {
    console.error('Create Order Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
