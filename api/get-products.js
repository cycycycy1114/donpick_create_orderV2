import { Client } from '@notionhq/client';

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const PRODUCT_DB_ID = process.env.PRODUCT_DB_ID || process.env.DATABASE_ID; // A表 (主商品表)
const PRODUCT_DETAIL_DB_ID = process.env.PRODUCT_DETAIL_DB_ID; // C表 (款式細項表)

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const excludedStatuses = ['已結單', '已結束', '結束', '結單'];

    // 1. 抓取 A 表 (主商品表)
    let aProducts = [];
    const aMapById = {};
    const aMapByName = {};

    if (PRODUCT_DB_ID) {
      try {
        const aResponse = await notion.databases.query({ database_id: PRODUCT_DB_ID });
        aResponse.results.forEach((page) => {
          const p = page.properties;
          
          const statusProp = p['狀態'] || p['Status'] || p['訂單狀態'];
          let statusName = '';
          if (statusProp) {
            if (statusProp.type === 'status') statusName = statusProp.status?.name || '';
            else if (statusProp.type === 'select') statusName = statusProp.select?.name || '';
            else if (statusProp.type === 'rich_text') statusName = statusProp.rich_text?.[0]?.plain_text || '';
          }
          statusName = statusName.trim();

          if (excludedStatuses.some(ex => statusName.includes(ex))) return;

          const nameProp = p['商品名稱'] || p['名稱'] || p['Name'];
          const name = nameProp?.title?.[0]?.plain_text || nameProp?.rich_text?.[0]?.plain_text || '';
          
          // 🌟 支援 A 表的 multi_select 規格選項
          let specs = ['標準款式'];
          const specProp = p['規格'] || p['款式'] || p['Spec'];
          if (specProp) {
            if (specProp.type === 'multi_select' && specProp.multi_select?.length > 0) {
              specs = specProp.multi_select.map(s => s.name);
            } else if (specProp.type === 'select' && specProp.select?.name) {
              specs = [specProp.select.name];
            } else if (specProp.type === 'rich_text' && specProp.rich_text[0]?.plain_text) {
              specs = [specProp.rich_text[0].plain_text];
            }
          }

          const priceProp = p['單價'] || p['價格'] || p['Price'];
          const price = priceProp?.number || 0;

          if (name) {
            const item = { id: page.id, name, specs, price };
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

          const statusProp = p['狀態'] || p['Status'];
          let statusName = statusProp?.status?.name || statusProp?.select?.name || '';
          if (excludedStatuses.some(ex => statusName.includes(ex))) return;

          const titleProp = p['款式名稱'] || p['名稱'] || p['Name'];
          const styleName = titleProp?.title?.[0]?.plain_text || titleProp?.rich_text?.[0]?.plain_text || '標準款式';

          const priceProp = p['單價'] || p['價格'] || p['Price'];
          const price = priceProp?.number || 0;

          const imageProp = p['款式圖片'] || p['圖片'] || p['Files'];
          let imageUrl = '';
          if (imageProp?.files?.[0]) {
            const fileObj = imageProp.files[0];
            imageUrl = fileObj.file?.url || fileObj.external?.url || '';
          }

          let parentProductName = '';
          let matchedAId = null;

          const prodNameProp = p['商品名稱'] || p['商品'] || p['Product'] || p['主商品'];
          if (prodNameProp) {
            if (prodNameProp.type === 'relation' && prodNameProp.relation.length > 0) {
              matchedAId = prodNameProp.relation[0].id;
              if (aMapById[matchedAId]) {
                parentProductName = aMapById[matchedAId].name;
              }
            } else if (prodNameProp.type === 'select') {
              parentProductName = prodNameProp.select?.name || '';
            } else if (prodNameProp.type === 'rich_text') {
              parentProductName = prodNameProp.rich_text?.[0]?.plain_text || '';
            } else if (prodNameProp.type === 'title') {
              parentProductName = prodNameProp.title?.[0]?.plain_text || '';
            }
          }

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
        // 🌟 如果 C 表沒有細項，將 A 表的每個 multi_select 規格（如辣、不辣）分別建立一個選項（無圖片）
        aItem.specs.forEach(specName => {
          finalProducts.push({
            id: aItem.id,
            productName: aItem.name,
            styleName: specName,
            price: aItem.price,
            imageUrl: ''
          });
        });
      }
    });

    return res.status(200).json({ success: true, products: finalProducts });
  } catch (error) {
    console.error('Notion API Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
