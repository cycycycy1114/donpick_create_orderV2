import { Client } from '@notionhq/client';

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const PRODUCT_DETAIL_DB_ID = process.env.PRODUCT_DETAIL_DB_ID;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const response = await notion.databases.query({
      database_id: PRODUCT_DETAIL_DB_ID,
    });

    const products = response.results.map((page) => {
      const p = page.properties;

      // 1. 款式名稱
      const titleProp = p['款式名稱'] || p['名稱'] || p['Name'];
      const styleName = titleProp?.title?.[0]?.plain_text || titleProp?.rich_text?.[0]?.plain_text || '標準款式';

      // 2. 商品名稱
      const prodNameProp = p['商品名稱'] || p['商品'];
      let productName = '未分類商品';
      if (prodNameProp) {
        if (prodNameProp.type === 'select') productName = prodNameProp.select?.name || '未分類商品';
        else if (prodNameProp.type === 'rich_text') productName = prodNameProp.rich_text?.[0]?.plain_text || '未分類商品';
        else if (prodNameProp.type === 'title') productName = prodNameProp.title?.[0]?.plain_text || '未分類商品';
      }

      // 3. 單價
      const priceProp = p['單價'] || p['價格'] || p['Price'];
      const price = priceProp?.number || 0;

      // 4. 款式圖片
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
