// 🚀 MoFy AI Family MCP Server with OAuth 2.1 & Browser Sign-In
export interface Env {
  OAUTH_KV: KVNamespace;
  MOFY_BACKEND_URL: string;
}

// MCP Tools for AI Family Orchestration
const MCP_TOOLS = [
  {
    name: "orchestrate_ai_family",
    description: "Orchestrate responses from all 7 AI family members (Papa Bear, Mama Bear, ZAI Prime, Claude Code, etc.)",
    inputSchema: {
      type: "object",
      properties: {
        message: { type: "string", description: "Message to send to AI family" },
        agents: { 
          type: "array", 
          items: { type: "string" },
          description: "Which AI agents to include (papa-bear, mama-bear, zai-prime, claude-code, etc.)"
        }
      },
      required: ["message"]
    }
  },
  {
    name: "search_memories",
    description: "Search Mem0 enterprise memory system for context",
    inputSchema: {
      type: "object", 
      properties: {
        query: { type: "string", description: "Memory search query" }
      },
      required: ["query"]
    }
  },
  {
    name: "get_project_status", 
    description: "Get current status of all projects and repositories",
    inputSchema: {
      type: "object",
      properties: {
        include_tests: { type: "boolean", description: "Include test results" }
      }
    }
  }
];

// OAuth state storage
interface OAuthState {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state: string;
  userId?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    
    // Add CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };
    
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }
    
    // OAuth Authorization Server Metadata
    if (url.pathname === '/.well-known/oauth-authorization-server') {
      return Response.json({
        issuer: url.origin,
        authorization_endpoint: `${url.origin}/authorize`,
        token_endpoint: `${url.origin}/token`,
        registration_endpoint: `${url.origin}/register`,
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code", "client_credentials"],
        code_challenge_methods_supported: ["S256"],
        scopes_supported: ["ai:orchestrate", "memory:read", "projects:read", "repos:read"]
      }, { headers: corsHeaders });
    }
    
    // Browser Sign-In Page
    if (url.pathname === '/signin') {
      return new Response(getSignInHTML(), {
        headers: { ...corsHeaders, 'Content-Type': 'text/html' }
      });
    }
    
    // OAuth Authorization Endpoint  
    if (url.pathname === '/authorize') {
      return handleAuthorize(request, env, url);
    }
    
    // OAuth Token Endpoint
    if (url.pathname === '/token') {
      return handleToken(request, env);
    }
    
    // Dynamic Client Registration
    if (url.pathname === '/register') {
      return handleRegister(request, env);
    }
    
    // MCP Server-Sent Events endpoint
    if (url.pathname === '/sse') {
      return handleMCPConnection(request, env);
    }
    
    // Health check
    if (url.pathname === '/health') {
      return Response.json({ 
        status: 'healthy',
        service: '💜 MoFy AI Family MCP Server',
        oauth: 'enabled',
        signin_url: `${url.origin}/signin`,
        family_members: ['papa-bear', 'mama-bear', 'zai-prime', 'claude-code'],
        backend: env.MOFY_BACKEND_URL,
        timestamp: new Date().toISOString()
      }, { headers: corsHeaders });
    }
    
    // Root endpoint - show info
    return new Response(getWelcomeHTML(url.origin), {
      headers: { ...corsHeaders, 'Content-Type': 'text/html' }
    });
  }
};

async function handleAuthorize(request: Request, env: Env, url: URL): Promise<Response> {
  const params = url.searchParams;
  const clientId = params.get('client_id');
  const redirectUri = params.get('redirect_uri');
  const codeChallenge = params.get('code_challenge');
  const state = params.get('state');
  
  if (!clientId || !redirectUri || !codeChallenge) {
    return new Response('Missing required OAuth parameters', { status: 400 });
  }
  
  // Store OAuth state
  const oauthState: OAuthState = {
    clientId,
    redirectUri, 
    codeChallenge,
    state: state || ''
  };
  
  const stateKey = `oauth_state_${Date.now()}_${Math.random()}`;
  await env.OAUTH_KV.put(stateKey, JSON.stringify(oauthState), { expirationTtl: 600 }); // 10 minutes
  
  // Return authorization page
  return new Response(getAuthPageHTML(stateKey, clientId), {
    headers: { 'Content-Type': 'text/html' }
  });
}

async function handleToken(request: Request, env: Env): Promise<Response> {
  const formData = await request.formData();
  const grantType = formData.get('grant_type');
  const code = formData.get('code');
  const clientId = formData.get('client_id');
  
  if (grantType !== 'authorization_code' || !code || !clientId) {
    return Response.json({ error: 'invalid_request' }, { status: 400 });
  }
  
  // Retrieve OAuth state
  const stateData = await env.OAUTH_KV.get(`oauth_code_${code}`);
  if (!stateData) {
    return Response.json({ error: 'invalid_grant' }, { status: 400 });
  }
  
  const state: OAuthState = JSON.parse(stateData);
  
  // Generate access token
  const accessToken = `mofy_${Date.now()}_${Math.random().toString(36)}`;
  
  // Store token
  await env.OAUTH_KV.put(`access_token_${accessToken}`, JSON.stringify({
    clientId,
    userId: state.userId || 'nathan_fyffe',
    scopes: ['ai:orchestrate', 'memory:read', 'projects:read'],
    issued_at: Date.now()
  }), { expirationTtl: 3600 }); // 1 hour
  
  return Response.json({
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: 3600,
    scope: 'ai:orchestrate memory:read projects:read'
  });
}

async function handleRegister(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as any;
  
  // Simple client registration - generate client ID
  const clientId = `mcp_client_${Date.now()}`;
  
  return Response.json({
    client_id: clientId,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    grant_types: ['authorization_code'],
    response_types: ['code'],
    redirect_uris: body.redirect_uris || []
  });
}

async function handleMCPConnection(request: Request, env: Env): Promise<Response> {
  // Check for Authorization header
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response('Unauthorized - Bearer token required', { status: 401 });
  }
  
  const token = authHeader.slice(7);
  
  // Validate token
  const tokenData = await env.OAUTH_KV.get(`access_token_${token}`);
  if (!tokenData) {
    return new Response('Invalid token', { status: 401 });
  }
  
  // Handle MCP protocol
  if (request.headers.get('Accept') === 'text/event-stream') {
    return new Response(
      new ReadableStream({
        start(controller) {
          const initMessage = {
            jsonrpc: "2.0",
            method: "initialize", 
            params: {
              protocolVersion: "2024-11-05",
              capabilities: { tools: {}, prompts: {} },
              serverInfo: {
                name: "MoFy AI Family Orchestrator",
                version: "1.0.0"
              }
            }
          };
          controller.enqueue(`data: ${JSON.stringify(initMessage)}\n\n`);
        }
      }),
      {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*'
        }
      }
    );
  }
  
  // Handle JSON-RPC
  if (request.method === 'POST') {
    const body = await request.json() as any;
    
    switch (body.method) {
      case 'tools/list':
        return Response.json({
          jsonrpc: "2.0",
          id: body.id,
          result: { tools: MCP_TOOLS }
        });
        
      case 'tools/call':
        return handleToolCall(body, env);
        
      default:
        return Response.json({
          jsonrpc: "2.0",
          id: body.id, 
          error: { code: -32601, message: "Method not found" }
        });
    }
  }
  
  return new Response('MCP endpoint ready', { status: 200 });
}

async function handleToolCall(body: any, env: Env): Promise<Response> {
  const { name, arguments: args } = body.params;
  
  try {
    let result;
    
    switch (name) {
      case 'orchestrate_ai_family':
        // Forward to MoFy.ai backend
        const response = await fetch(`${env.MOFY_BACKEND_URL}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: args.message,
            agents: args.agents || ['papa-bear', 'mama-bear', 'zai-prime'],
            orchestration: true
          })
        });
        result = await response.json();
        break;
        
      case 'search_memories':
        const memResponse = await fetch(`${env.MOFY_BACKEND_URL}/memory/search`, {
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: args.query })
        });
        result = await memResponse.json();
        break;
        
      case 'get_project_status':
        const statusResponse = await fetch(`${env.MOFY_BACKEND_URL}/status`);
        result = await statusResponse.json();
        break;
        
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
    
    return Response.json({
      jsonrpc: "2.0",
      id: body.id,
      result: { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }
    });
    
  } catch (error) {
    return Response.json({
      jsonrpc: "2.0",
      id: body.id,
      error: { code: -32000, message: error.message }
    });
  }
}

// HTML Templates
function getSignInHTML(): string {
  return `
<!DOCTYPE html>
<html>
<head>
    <title>💜 MoFy AI Family - Sign In</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
               background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
               margin: 0; padding: 20px; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
        .container { background: white; padding: 40px; border-radius: 16px; box-shadow: 0 20px 40px rgba(0,0,0,0.1); max-width: 400px; width: 100%; }
        h1 { color: #764ba2; text-align: center; margin-bottom: 30px; }
        .family { text-align: center; margin: 20px 0; font-size: 14px; color: #666; }
        .btn { background: linear-gradient(45deg, #667eea, #764ba2); color: white; border: none; 
               padding: 12px 24px; border-radius: 8px; cursor: pointer; width: 100%; font-size: 16px; }
        .btn:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.2); }
        input { width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 8px; margin: 10px 0; }
    </style>
</head>
<body>
    <div class="container">
        <h1>💜 MoFy AI Family</h1>
        <div class="family">Papa Bear 🐻 • Mama Bear 💜 • ZAI Prime 🤖 • Claude Code 👨‍💻</div>
        
        <form action="/authorize" method="post">
            <input type="email" name="email" placeholder="Enter your email" required>
            <input type="password" name="password" placeholder="Password" required>
            <button type="submit" class="btn">Sign In & Connect AI Family</button>
        </form>
        
        <div style="text-align: center; margin-top: 20px; font-size: 12px; color: #888;">
            Secure OAuth 2.1 • Mobile AI Orchestration Ready 📱
        </div>
    </div>
</body>
</html>`;
}

function getAuthPageHTML(stateKey: string, clientId: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
    <title>💜 Authorize AI Family Access</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
               background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
               margin: 0; padding: 20px; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
        .container { background: white; padding: 40px; border-radius: 16px; box-shadow: 0 20px 40px rgba(0,0,0,0.1); max-width: 500px; }
        h1 { color: #764ba2; text-align: center; }
        .permissions { background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; }
        .permission { display: flex; align-items: center; margin: 10px 0; }
        .permission input { margin-right: 10px; }
        .buttons { display: flex; gap: 10px; margin-top: 20px; }
        .btn { padding: 12px 24px; border-radius: 8px; border: none; cursor: pointer; flex: 1; }
        .btn-primary { background: #667eea; color: white; }
        .btn-secondary { background: #ddd; color: #333; }
    </style>
</head>
<body>
    <div class="container">
        <h1>💜 Authorize MCP Client</h1>
        <p><strong>Client:</strong> ${clientId}</p>
        <p>This application wants to access your AI family coordination system.</p>
        
        <div class="permissions">
            <h3>Requested Permissions:</h3>
            <div class="permission">
                <input type="checkbox" checked disabled> 
                <span>🤖 Orchestrate AI Family (Papa Bear, Mama Bear, ZAI Prime, Claude Code)</span>
            </div>
            <div class="permission">
                <input type="checkbox" checked disabled>
                <span>🧠 Read Memory System (Mem0 Enterprise)</span>
            </div>
            <div class="permission">
                <input type="checkbox" checked disabled>
                <span>📁 Read Project Status (GitHub repositories, tests)</span>
            </div>
        </div>
        
        <div class="buttons">
            <button class="btn btn-secondary" onclick="deny()">Deny</button>
            <button class="btn btn-primary" onclick="authorize('${stateKey}')">Authorize</button>
        </div>
    </div>
    
    <script>
    async function authorize(stateKey) {
        const code = 'auth_' + Date.now();
        
        // Store authorization code
        await fetch('/api/store-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ stateKey, code })
        });
        
        // Redirect back to client
        window.location.href = '/callback?code=' + code + '&state=${stateKey}';
    }
    
    function deny() {
        window.location.href = '/callback?error=access_denied';
    }
    </script>
</body>
</html>`;
}

function getWelcomeHTML(origin: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
    <title>💜 MoFy AI Family MCP Server</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
               background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
               margin: 0; padding: 20px; color: white; }
        .container { max-width: 800px; margin: 0 auto; text-align: center; }
        h1 { font-size: 3em; margin-bottom: 20px; }
        .features { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin: 40px 0; }
        .feature { background: rgba(255,255,255,0.1); padding: 20px; border-radius: 12px; backdrop-filter: blur(10px); }
        .endpoints { background: rgba(255,255,255,0.1); padding: 20px; border-radius: 12px; margin: 20px 0; text-align: left; }
        code { background: rgba(0,0,0,0.3); padding: 4px 8px; border-radius: 4px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>💜 MoFy AI Family MCP Server</h1>
        <p>OAuth 2.1 Protected • Mobile AI Orchestration • Browser Sign-In Ready</p>
        
        <div class="features">
            <div class="feature">
                <h3>🐻 Papa Bear</h3>
                <p>Problem solving & coordination</p>
            </div>
            <div class="feature">
                <h3>💜 Mama Bear</h3>
                <p>Loving development assistance</p>
            </div>
            <div class="feature">
                <h3>🤖 ZAI Prime</h3>
                <p>Creative AI solutions</p>
            </div>
            <div class="feature">
                <h3>👨‍💻 Claude Code</h3>
                <p>Deep technical work</p>
            </div>
        </div>
        
        <div class="endpoints">
            <h3>🔗 Integration Endpoints:</h3>
            <p><strong>MCP Server:</strong> <code>${origin}/sse</code></p>
            <p><strong>OAuth Discovery:</strong> <code>${origin}/.well-known/oauth-authorization-server</code></p>
            <p><strong>Browser Sign-In:</strong> <code>${origin}/signin</code></p>
            <p><strong>Health Check:</strong> <code>${origin}/health</code></p>
        </div>
        
        <div style="margin-top: 40px;">
            <a href="/signin" style="background: white; color: #764ba2; padding: 15px 30px; border-radius: 8px; text-decoration: none; font-weight: bold;">🚀 Connect Your AI Family</a>
        </div>
    </div>
</body>
</html>`;
}