addEventListener('fetch', (event) => {
  event.respondWith(handleRequest(event.request));
});

function buildHeadersWithNotionVersion(baseHeaders) {
  const headers = new Headers(baseHeaders);
  if (!headers.has('Notion-Version')) {
    headers.set('Notion-Version', '2022-06-28');
  }
  return headers;
}





async function handleRequest(request) {
  try {
    const url = new URL(request.url);
    
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Authorization, Content-Type, Notion-Version',
        },
      });
    }

    // Notion Pages APIへのPOSTリクエスト専用の処理
    if (request.method === 'POST' && url.pathname.endsWith('/v1/pages')) {
      // リクエストボディを一度だけ読み取る
      const requestData = await request.json();

      // propertiesAndChildrenStringの処理
      if (requestData.propertiesAndChildrenString) {
        try {
          const parsedData = JSON.parse(requestData.propertiesAndChildrenString);
          
          // プロパティが確実に存在することを確認
          if (!parsedData.properties) {
            return new Response(JSON.stringify({ 
              error: 'Properties are required' 
            }), {
              status: 400,
              headers: { 'Content-Type': 'application/json' }
            });
          }

          const newRequestData = {
            parent: requestData.parent,
            properties: parsedData.properties,
            children: parsedData.children || []
          };

          // ヘッダーを Notion-Version 補完付きで再構築
          const headers = new Headers({
            'Content-Type': 'application/json',
            'Notion-Version': '2022-06-28',
            ...Object.fromEntries(request.headers)
          });

          // 新しいリクエストを作成
          const newRequest = new Request('https://api.notion.com/v1/pages', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(newRequestData)
          });
          
          return await fetch(newRequest);
        } catch (e) {
          return new Response(JSON.stringify({ 
            error: 'Invalid propertiesAndChildrenString', 
            details: e.message 
          }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }
      
      // propertiesAndChildrenStringがない場合の処理
      return await fetch('https://api.notion.com/v1/pages', {
        method: 'POST',
        headers: buildHeadersWithNotionVersion(request.headers),
        body: JSON.stringify(requestData)
      });
    }
  } catch (e) {
    return new Response(e.stack || e.toString(), { status: 500 });
  }
}
