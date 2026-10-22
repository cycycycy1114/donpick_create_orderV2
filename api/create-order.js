import { Client } from '@notionhq/client';

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const DATABASE_ID = process.env.DATABASE_ID; // 讀取 B 表 (訂單資料庫)

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
        // 1. 買家暱稱 (請確認 B 表第一欄 Title 欄位的實際名稱)
        "買家暱稱": {
          title: [
            { text: { content: nickname } }
          ]
        },
        // 2. 聯絡方式 (請確認 B 表是否有這個欄位)
        "聯絡方式": {
          rich_text: [
            { text: { content: contactFull } }
          ]
        },
        // 🌟 3. 規格：因為 Notion 規定它是 Select，所以要改用 select 格式傳送
        "規格": {
          select: {
            name: spec || "預設規格" // 請確保傳進去的規格文字，有存在於 Notion 該欄位的選項中！
          }
        },
        // 4. 數量
        "數量": {
          number: Number(quantity) || 1
        },
        // 5. 單價 (請確認 B 表欄位是否叫這個名字)
        "單價": {
          number: Number(price) || 0
        },
        // 6. 總金額
        "總金額": {
          number: Number(totalPrice) || 0
        },
        // 7. 取貨方式
        "取貨方式": {
          select: {
            name: delivery || "7-11 店到店"
          }
        },
        // 8. 狀態 (請確認 B 表欄位是 Status 或 Select 型態)
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
