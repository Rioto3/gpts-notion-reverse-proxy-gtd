addEventListener('fetch', (event) => {
 event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
 try {
   const url = new URL(request.url);
   const ALLOWED_ORIGINS = ['https://chat.openai.com'];

   const origin = request.headers.get('Origin');
   if (origin && !ALLOWED_ORIGINS.includes(origin)) {
     return new Response('Not allowed', { status: 403 });
   }

   if (url.pathname.startsWith('/redirect/')) {
     let targetUrl = url.pathname.slice(10);
     if (url.search) {
       targetUrl += url.search;
     }
     return Response.redirect(targetUrl, 302);
   }

   if (url.pathname === '/') {
     return new Response(`
       Usage:\n
         ${url.origin}/<url>
     `);
   }

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

   // 特別な処理: /v1/pages への POST リクエスト
   if (request.method === 'POST' && url.pathname.endsWith('/v1/pages')) {
     let requestData;
     try {
       requestData = await request.json();
     } catch (e) {
       return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
         status: 400,
         headers: { 'Content-Type': 'application/json' }
       });
     }

     // propertiesString があれば処理
     if (requestData.propertiesString) {
       try {
         // 文字列からJSONオブジェクトにパース
         const properties = JSON.parse(requestData.propertiesString);
         
         // 元のリクエストから新しいリクエストを構築
         const newRequestData = {
           ...requestData,
           properties: properties
         };
         
         // propertiesString は削除
         delete newRequestData.propertiesString;
         
         // 新しいリクエストを作成
         const newRequest = new Request(request.url.slice(url.origin.length + 1), {
           method: 'POST',
           headers: request.headers,
           body: JSON.stringify(newRequestData)
         });
         
         // 以降は通常の処理と同様
         return await fetch(newRequest);
       } catch (e) {
         return new Response(JSON.stringify({ error: 'Invalid propertiesString', details: e.message }), {
           status: 400,
           headers: { 'Content-Type': 'application/json' }
         });
       }
     }
   }

   const headers = new Headers(request.headers);

   if ('api.notion.com' === new URL(request.url.slice(url.origin.length + 1)).hostname && !headers.has('Notion-Version')) {
     const notionVersion = '2022-06-28';
     headers.set('Notion-Version', notionVersion);
   }

   let response = await fetch(request.url.slice(url.origin.length + 1), {
     method: request.method,
     headers: headers,
     redirect: 'follow',
     body: request.body,
   });
   response = new Response(response.body, response);
   response.headers.set('Access-Control-Allow-Origin', '*');
   response.headers.set('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS');
   response.headers.set('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Accept, Authorization, Content-Type, Notion-Version');

   return response;
 } catch (e) {
   return new Response(e.stack || e, { status: 500 });
 }
}
