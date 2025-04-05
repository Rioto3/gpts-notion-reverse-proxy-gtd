addEventListener('fetch', (event) => {
  event.respondWith(handleRequest(event.request));
});

// Notion APIバージョンを含むヘッダーを構築する関数
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
    const targetUrl = new URL(url.pathname, 'https://api.notion.com');
    
    // CORSプリフライトリクエストの処理
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PATCH, HEAD, OPTIONS',
          'Access-Control-Allow-Headers': 'Authorization, Content-Type, Notion-Version',
        },
      });
    }
    
    // URLにクエリパラメータを追加
    if (url.search) {
      targetUrl.search = url.search;
    }
    
    // PATCH, GET, POSTリクエストの共通処理
    if (['GET', 'POST', 'PATCH'].includes(request.method)) {
      let requestBody;
      let headers = buildHeadersWithNotionVersion(request.headers);
      
      // POSTとPATCHリクエストのボディを処理
      if (['POST', 'PATCH'].includes(request.method)) {
        try {
          const requestData = await request.json();
          
          // propertiesAndChildrenStringの処理（pagesエンドポイント用）
          if ((url.pathname.endsWith('/v1/pages') || url.pathname.match(/\/v1\/pages\/[^\/]+$/)) && 
              requestData.propertiesAndChildrenString) {
            try {
              const parsedData = JSON.parse(requestData.propertiesAndChildrenString);
              
              // 新しいリクエストデータを作成
              const newRequestData = {
                ...(requestData.parent && { parent: requestData.parent }),
                ...(parsedData.properties && { properties: parsedData.properties }),
                ...(parsedData.children && { children: parsedData.children }),
                ...(requestData.archived !== undefined && { archived: requestData.archived })
              };
              
              requestBody = JSON.stringify(newRequestData);
            } catch (e) {
              return new Response(JSON.stringify({ 
                error: 'Invalid propertiesAndChildrenString', 
                details: e.message 
              }), {
                status: 400,
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
              });
            }
          } else {
            // 標準的なリクエスト
            requestBody = JSON.stringify(requestData);
          }
        } catch (e) {
          return new Response(JSON.stringify({ 
            error: 'Invalid request body', 
            details: e.message 
          }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
          });
        }
      }
      
      // 新しいリクエストオプションを作成
      const requestOptions = {
        method: request.method,
        headers: headers
      };
      
      if (requestBody) {
        requestOptions.body = requestBody;
      }
      
      // Notionへリクエストを転送
      const response = await fetch(targetUrl.toString(), requestOptions);
      
      // レスポンスヘッダーを複製
      const responseHeaders = new Headers(response.headers);
      responseHeaders.set('Access-Control-Allow-Origin', '*');
      
      // レスポンスボディを取得
      const responseBody = await response.text();
      
      // 新しいレスポンスを構築
      return new Response(responseBody, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders
      });
    }
    
    // サポートされていないHTTPメソッド
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
    
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message || 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
