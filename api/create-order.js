const { Client } = require('@notionhq/client');
const notion = new Client({ auth: process.env.NOTION_TOKEN });

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { nickname, contactType, contactInfo, product, price, quantity, totalPrice, spec, delivery } = req.body;
    const dbId = process.env.DATABASE_ID;

    if (!dbId) {
      throw new Error("缺少 DATABASE_ID 環境變數");
    }

    // 1. 取得 B 資料庫結構
    const dbInfo = await notion.databases.retrieve({ database_id: dbId });
    const propsSchema = dbInfo.properties;

    // 在 Vercel 後端日誌印出目前 Notion 資料庫裡有的真實欄位名稱與型態，方便我們對照
    console.log("Notion 資料庫現有欄位結構：", JSON.stringify(Object.keys(propsSchema).map(k => ({ name: k, type: propsSchema[k].type }))));

    const properties = {};

    const setProp = (possibleNames, val) => {
      const propKey = Object.keys(propsSchema).find(k =>
        possibleNames.some(p => k.trim().toLowerCase() === p.trim().toLowerCase())
      );

      if (!propKey) {
        console.warn(`⚠️ 找不到對應的欄位，可能的名稱為: ${possibleNames.join(', ')}`);
        return;
      }

      const propType = propsSchema[propKey].type;
      const strVal = String(val !== undefined && val !== null ? val : '');

      if (propType === 'title') {
        properties[propKey] = { title: [{ text: { content: strVal } }] };
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

    // 2. 對應欄位
    setProp(['訂單', '訂單名稱', '暱稱', 'LINE社群暱稱', 'Name', 'Title'], nickname);
    setProp(['聯絡管道', '聯絡方式', '聯絡型態', '管道'], contactType);
    setProp(['聯絡資訊', '聯絡帳號', 'LINE ID/IG', '帳號', '聯絡內容'], contactInfo);
    setProp(['商品名稱', '商品', '品項', '預購商品', 'Product'], product);
    setProp(['規格', '款式', 'Spec'], spec);
    setProp(['數量', '購買數量', 'Quantity'], quantity);
    setProp(['單價', '價格', 'Price'], price);
    setProp(['總金額', '總價', '合計', 'Total Price', '金額'], totalPrice);
    setProp(['取貨方式', '寄送方式', '物流', 'Delivery'], delivery);
    setProp(['狀態', '訂單狀態', 'Status'], '待處理');

    // 3. 寫入 Notion
    await notion.pages.create({
      parent: { database_id: dbId },
      properties: properties
    });

    res.status(200).json({ message: 'Success' });
  } catch (error) {
    console.error("Notion 寫入詳細錯誤:", error.body || error.message);
    res.status(500).json({ error: error.body ? JSON.stringify(error.body) : error.message });
  }
};
