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

    // 1. 動態取得 B 資料庫現有的真實結構
    const dbInfo = await notion.databases.retrieve({ database_id: dbId });
    const propsSchema = dbInfo.properties;

    const properties = {};

    // 2. 智慧對應函式：自動尋找相符的欄位名稱與型態
    const setProp = (possibleNames, val, overrideType = null) => {
      const propKey = Object.keys(propsSchema).find(k =>
        possibleNames.some(p => k.trim().toLowerCase() === p.trim().toLowerCase())
      );

      if (!propKey) {
        console.warn(`⚠️ 找不到對應的欄位，可能的名稱為: ${possibleNames.join(', ')}`);
        return;
      }

      const propType = overrideType || propsSchema[propKey].type;
      const strVal = String(val !== undefined && val !== null ? val : '');

      if (propType === 'title') {
        properties[propKey] = { title: [{ text: { content: strVal || '未命名買家' } }] };
      } else if (propType === 'rich_text') {
        properties[propKey] = { rich_text: [{ text: { content: strVal } }] };
      } else if (propType === 'select') {
        if (strVal) properties[propKey] = { select: { name: strVal } };
      } else if (propType === 'status') {
        if (strVal) properties[propKey] = { status: { name: strVal } };
      } else if (propType === 'number') {
        properties[propKey] = { number: Number(val) || 0 };
      }
    };

    // 3. 把你所有可能的中文/英文欄位名稱列在這邊，程式會自動去對應 Notion 裡真實存在的欄位
    setProp(['買家暱稱', '訂單', '訂單名稱', '暱稱', 'LINE社群暱稱', 'Name', 'Title'], nickname || '未命名買家');
    setProp(['聯絡管道', '聯絡方式', '聯絡型態', '管道'], contactType);
    setProp(['聯絡資訊', '聯絡帳號', 'LINE ID/IG', '帳號', '聯絡內容'], contactInfo);
    setProp(['商品名稱', '商品', '品項', '預購商品', 'Product'], product);
    setProp(['規格', '款式', 'Spec'], spec);
    setProp(['數量', '購買數量', 'Quantity'], quantity);
    setProp(['單價', '價格', 'Price'], price);
    setProp(['總金額', '總價', '合計', 'Total Price', '金額'], totalPrice);
    setProp(['取貨方式', '寄送方式', '物流', 'Delivery'], delivery);
    setProp(['狀態', '訂單狀態', 'Status'], '待處理');

    // 🛡️ 安全機制：如果自動對應沒找到 Title 欄位，強制把資料庫第一個 Title 欄位填上
    const titleKey = Object.keys(propsSchema).find(k => propsSchema[k].type === 'title');
    if (titleKey && !properties[titleKey]) {
      properties[titleKey] = { title: [{ text: { content: nickname || '未命名訂單' } }] };
    }

    // 4. 寫入 Notion
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
