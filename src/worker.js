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

    // パスの取得（/https://api.notion.com/... のようなURLからNotionのパスだけを抽出）
    let notionPath = url.pathname;
    const match = notionPath.match(/\/https:\/\/api\.notion\.com(\/.*)/);
    if (match) {
      notionPath = match[1];
    } else if (notionPath.startsWith('/http')) {
      // URLが二重にエンコードされている可能性がある場合の処理
      const decodedPath = decodeURIComponent(notionPath);
      const matchDecoded = decodedPath.match(/\/https:\/\/api\.notion\.com(\/.*)/);
      if (matchDecoded) {
        notionPath = matchDecoded[1];
      }
    }

    // Notion APIのベースURL
    const targetUrl = new URL(notionPath, 'https://api.notion.com');
    
    // URLにクエリパラメータを追加
    if (url.search) {
      targetUrl.search = url.search;
    }
    
    // リクエストの処理
    if (['GET', 'POST', 'PATCH'].includes(request.method)) {
      let requestBody;
      let headers = buildHeadersWithNotionVersion(request.headers);
      
      // POSTとPATCHリクエストのボディを処理
      if (['POST', 'PATCH'].includes(request.method)) {
        try {
          const requestData = await request.clone().json();
          
          // propertiesAndChildrenStringの処理
          if ((notionPath.endsWith('/v1/pages') || notionPath.match(/\/v1\/pages\/[^\/]+$/)) && 
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
            // リクエストボディをそのまま使用
            requestBody = JSON.stringify(requestData);
          }
        } catch (e) {
          // JSONパースエラーの場合は、リクエストボディをそのまま使用
          const rawBody = await request.text();
          requestBody = rawBody;
        }
      }
      
      console.log(`Forwarding request to: ${targetUrl.toString()}`);
      
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
      
      // デバッグ情報をレスポンスに含める
      let debugInfo = {};
      if (responseBody.includes('invalid_request_url')) {
        debugInfo = {
          debug: {
            original_url: request.url,
            processed_url: targetUrl.toString(),
            notion_path: notionPath
          }
        };
      }
      
      try {
        // JSONレスポンスの場合はデバッグ情報を追加
        const jsonResponse = JSON.parse(responseBody);
        const enhancedResponse = { ...jsonResponse, ...debugInfo };
        
        return new Response(JSON.stringify(enhancedResponse), {
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders
        });
      } catch (e) {
        // JSONでない場合はそのまま返す
        return new Response(responseBody, {
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders
        });
      }
    }
    
    // サポートされていないHTTPメソッド
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
    
  } catch (e) {
    return new Response(JSON.stringify({ 
      error: e.message || 'Internal server error',
      stack: e.stack
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
