import { Client } from '@notionhq/client';

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const PRODUCT_DB_ID = process.env.PRODUCT_DB_ID || process.env.DATABASE_ID; // A表 (主商品表)
const PRODUCT_DETAIL_DB_ID = process.env.PRODUCT_DETAIL_DB_ID; // C表 (款式細項表)

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const excludedStatuses = ['已結單', '已結束'];

    // 1. 抓取 A 表 (主商品表) - 以 A 表的狀態為主來判斷是否「已結束」或「已結單」
    let aProducts = [];
    const aMapById = {};
    const aMapByName = {};

    if (PRODUCT_DB_ID) {
      try {
        const aResponse = await notion.databases.query({ database_id: PRODUCT_DB_ID });
        aResponse.results.forEach((page) => {
          const p = page.properties;
          
          // 檢查 A 表狀態：如果是已結單或已結束，直接略過不撈取
          const statusProp = p['狀態'] || p['Status'];
          const statusName = statusProp?.status?.name || statusProp?.select?.name || '';
          if (excludedStatuses.includes(statusName)) return;

          const nameProp = p['商品名稱'] || p['名稱'] || p['Name'];
          const name = nameProp?.title?.[0]?.plain_text || nameProp?.rich_text?.[0]?.plain_text || '';
          
          const priceProp = p['單價'] || p['價格'] || p['Price'];
          const price = priceProp?.number || 0;

          if (name) {
            const item = { id: page.id, name, price };
            aProducts.push(item);
            aMapById[page.id] = item;
            aMapByName[name] = item;
          }
        });
      } catch (err) {
        console.log('A表讀取失敗:', err.message);
      }
    }

    // 2. 抓取 C 表 (款式細項表)
    let cDetails = [];
    if (PRODUCT_DETAIL_DB_ID) {
      try {
        const cResponse = await notion.databases.query({ database_id: PRODUCT_DETAIL_DB_ID });
        cResponse.results.forEach((page) => {
          const p = page.properties;

          // 款式名稱
          const titleProp = p['款式名稱'] || p['名稱'] || p['Name'];
          const styleName = titleProp?.title?.[0]?.plain_text || titleProp?.rich_text?.[0]?.plain_text || '標準款式';

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

          // 對應到 A 表的名稱或 ID
          let parentProductName = '';
          let matchedAId = null;

          const prodNameProp = p['商品名稱'] || p['商品'];
          if (prodNameProp && prodNameProp.type === 'relation' && prodNameProp.relation.length > 0) {
            matchedAId = prodNameProp.relation[0].id;
            if (aMapById[matchedAId]) {
              parentProductName = aMapById[matchedAId].name;
            }
          } else if (prodNameProp) {
            if (prodNameProp.type === 'select') parentProductName = prodNameProp.select?.name || '';
            else if (prodNameProp.type === 'rich_text') parentProductName = prodNameProp.rich_text?.[0]?.plain_text || '';
            else if (prodNameProp.type === 'title') parentProductName = prodNameProp.title?.[0]?.plain_text || '';
          }

          // 核心邏輯：「已結束以 A 表為主」
          // 只有當這個 C 表細項對應到的 A 表主商品存在且未被過濾（也就是 A表 是開放狀態），才允許撈進來
          if (parentProductName && (aMapById[matchedAId] || aMapByName[parentProductName])) {
            cDetails.push({
              id: page.id,
              productName: parentProductName,
              matchedAId: matchedAId,
              styleName,
              price: price > 0 ? price : (aMapByName[parentProductName]?.price || 0),
              imageUrl
            });
          }
        });
      } catch (err) {
        console.log('C表讀取失敗:', err.message);
      }
    }

    // 3. 整合 A 表與 C 表
    let finalProducts = [];
    const matchedAIds = new Set(cDetails.map(c => c.matchedAId).filter(Boolean));
    const matchedANames = new Set(cDetails.map(c => c.productName));

    aProducts.forEach(aItem => {
      const hasCDetails = matchedAIds.has(aItem.id) || matchedANames.has(aItem.name);
      if (hasCDetails) {
        const styles = cDetails.filter(c => c.matchedAId === aItem.id || c.productName === aItem.name);
        finalProducts.push(...styles);
      } else {
        finalProducts.push({
          id: aItem.id,
          productName: aItem.name,
          styleName: '標準款式',
          price: aItem.price,
          imageUrl: '' // 無圖片
        });
      }
    });

    return res.status(200).json({ success: true, products: finalProducts });
  } catch (error) {
    console.error('Notion API Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
