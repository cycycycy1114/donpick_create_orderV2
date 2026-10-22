import { Client } from '@notionhq/client';

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const DATABASE_ID = process.env.DATABASE_ID; // A 表 (主商品表) ID
const PRODUCT_DETAIL_DB_ID = process.env.PRODUCT_DETAIL_DB_ID; // C 表 (款式細項表) ID

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    // 1. 先去 A 表 (主商品表) 建立一個 ID 對應名稱的字典 (Map)
    const productMap = {};
    if (DATABASE_ID) {
      const aResponse = await notion.databases.query({
        database_id: DATABASE_ID,
      });
      aResponse.results.forEach((page) => {
        const p = page.properties;
        const nameProp = p['商品名稱'] || p['名稱'] || p['Name'];
        const name = nameProp?.title?.[0]?.plain_text || nameProp?.rich_text?.[0]?.plain_text || '';
        if (name) {
          productMap[page.id] = name;
        }
      });
    }

    // 2. 查詢 C 表 (款式細項表)
    const response = await notion.databases.query({
      database_id: PRODUCT_DETAIL_DB_ID,
    });

    const products = response.results.map((page) => {
      const p = page.properties;

      // 款式名稱
      const titleProp = p['款式名稱'] || p['名稱'] || p['Name'];
      const styleName = titleProp?.title?.[0]?.plain_text || titleProp?.rich_text?.[0]?.plain_text || '標準款式';

      // 商品名稱 (透過 Relation 關聯到 A 表)
      const prodNameProp = p['商品名稱'] || p['商品'];
      let productName = '未分類商品';
      
      if (prodNameProp && prodNameProp.type === 'relation' && prodNameProp.relation.length > 0) {
        const relatedId = prodNameProp.relation[0].id;
        if (productMap[relatedId]) {
          productName = productMap[relatedId];
        }
      } else if (prodNameProp) {
        // 備用相容：如果欄位改回文字或選單也能抓到
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

    return res.status(200).json({ success: true, products });
  } catch (error) {
    console.error('Notion API Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
