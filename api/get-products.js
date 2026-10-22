import { Client } from '@notionhq/client';

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const PRODUCT_DB_ID = process.env.PRODUCT_DB_ID || process.env.DATABASE_ID; // A表 (主商品表)
const PRODUCT_DETAIL_DB_ID = process.env.PRODUCT_DETAIL_DB_ID; // C表 (款式細項表)

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    let products = [];

    // 1. 先建立 A 表的對照字典（以防 C 表是用 Relation 關聯）
    const productMap = {};
    if (PRODUCT_DB_ID) {
      try {
        const aResponse = await notion.databases.query({
          database_id: PRODUCT_DB_ID,
        });
        aResponse.results.forEach((page) => {
          const p = page.properties;
          const nameProp = p['商品名稱'] || p['名稱'] || p['Name'];
          const name = nameProp?.title?.[0]?.plain_text || nameProp?.rich_text?.[0]?.plain_text || '';
          if (name) {
            productMap[page.id] = name;
          }
        });
      } catch (err) {
        console.log('A表讀取失敗:', err.message);
      }
    }

    // 2. 嘗試從 C 表 (款式細項表) 抓取資料
    if (PRODUCT_DETAIL_DB_ID) {
      try {
        const cResponse = await notion.databases.query({
          database_id: PRODUCT_DETAIL_DB_ID,
        });

        products = cResponse.results.map((page) => {
          const p = page.properties;

          // 款式名稱
          const titleProp = p['款式名稱'] || p['名稱'] || p['Name'];
          const styleName = titleProp?.title?.[0]?.plain_text || titleProp?.rich_text?.[0]?.plain_text || '標準款式';

          // 商品名稱 (支援 Relation 或一般文字)
          const prodNameProp = p['商品名稱'] || p['商品'];
          let productName = '未分類商品';
          
          if (prodNameProp && prodNameProp.type === 'relation' && prodNameProp.relation.length > 0) {
            const relatedId = prodNameProp.relation[0].id;
            if (productMap[relatedId]) {
              productName = productMap[relatedId];
            }
          } else if (prodNameProp) {
            if (prodNameProp.type === 'select') productName = prodNameProp.select?.name || '未分類商品';
            else if (prodNameProp.type === 'rich_text') productName = prodNameProp.rich_text?.[0]?.plain_text || '未分類商品';
            else if (prodNameProp.type === 'title') productName = prodNameProp.title?.[0]?.plain_text || '未分類商品';
          }

          // 單價
          const priceProp = p['單價'] || p['價格'] || p['Price'];
          const price = priceProp?.number || 0;

          // 款式圖片
          const imageProp = p['款式圖片'] || p['圖片'] || p['Files'];
          let imageUrl = '';
          if (imageProp?.files?.[0]) {
            const fileObj = imageProp.files[0];
            imageUrl = fileObj.file?.url || fileObj.external?.url || '';
          }

          return {
            id: page.id,
            productName: productName,
            styleName: styleName,
            price: price,
            imageUrl: imageUrl,
          };
        });
      } catch (err) {
        console.log('C表讀取失敗，將改抓A表', err.message);
      }
    }

    // 3. 如果 C 表沒有資料，直接改抓 A 表作為備援（無圖片，款式直接使用主商品名或空白）
    if (products.length === 0 && PRODUCT_DB_ID) {
      try {
        const aResponse = await notion.databases.query({
          database_id: PRODUCT_DB_ID,
        });

        products = aResponse.results.map((page) => {
          const p = page.properties;
          const nameProp = p['商品名稱'] || p['名稱'] || p['Name'];
          const name = nameProp?.title?.[0]?.plain_text || nameProp?.rich_text?.[0]?.plain_text || '未命名商品';

          const priceProp = p['單價'] || p['價格'] || p['Price'];
          const price = priceProp?.number || 0;

          return {
            id: page.id,
            productName: name,
            styleName: '標準款式', // 不顯示多餘狀態
            price: price,
            imageUrl: '', // 無圖片
          };
        });
      } catch (err) {
        console.error('A表備援讀取也失敗:', err.message);
      }
    }

    return res.status(200).json({ success: true, products });
  } catch (error) {
    console.error('Notion API Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
