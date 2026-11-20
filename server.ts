import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';
import { TradingEngine } from './server/engine.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

async function bootstrap() {
  const app = express();
  app.use(express.json());

  const engine = new TradingEngine();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  // WebSocket real-time market streaming & order execution events
  wss.on('connection', (socket) => {
    socket.send(
      JSON.stringify({
        type: 'state:init',
        payload: engine.getSnapshot(),
      })
    );

    socket.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg?.type === 'ping') {
          socket.send(JSON.stringify({ type: 'pong', serverTime: Date.now() }));
        } else if (msg?.type === 'state:request') {
          socket.send(JSON.stringify({ type: 'state:init', payload: engine.getSnapshot() }));
        }
      } catch {
        // Ignore malformed client frames
      }
    });
  });

  engine.subscribe((event) => {
    const serialized = JSON.stringify(event);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(serialized);
      }
    }
  });

  // RESTful API endpoints (SRS Section 3.4 & 4.x)
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'operational', uptimeSeconds: Math.round(process.uptime()), serverTime: Date.now() });
  });

  app.get('/api/state', (_req, res) => {
    res.json(engine.getSnapshot());
  });

  app.get('/api/market/:symbol', (req, res) => {
    const inst = engine.getInstrument(req.params.symbol.toUpperCase());
    if (!inst) {
      res.status(404).json({ error: 'Instrument not found' });
      return;
    }
    res.json({
      symbol: inst.symbol,
      name: inst.name,
      price: inst.price,
      bid: inst.bid,
      ask: inst.ask,
      spreadBps: inst.spreadBps,
      changePct: inst.changePct,
      high24h: inst.high24h,
      low24h: inst.low24h,
      volume24h: inst.volume24h,
      updatedAt: inst.updatedAt,
    });
  });

  app.post('/api/orders', (req, res) => {
    const { userId, symbol, side, type, quantity, limitPrice, stopPrice } = req.body ?? {};
    const result = engine.placeOrder({
      userId,
      symbol,
      side,
      type,
      quantity: Number(quantity),
      limitPrice: limitPrice !== undefined ? Number(limitPrice) : undefined,
      stopPrice: stopPrice !== undefined ? Number(stopPrice) : undefined,
    });
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.status(201).json(result);
  });

  app.delete('/api/orders/:id', (req, res) => {
    const actorId = String(req.query.actorId || req.body?.actorId || 'usr_retail_01');
    const result = engine.cancelOrder(req.params.id, actorId);
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json(result);
  });

  app.post('/api/wallet/transfer', (req, res) => {
    const { userId, action, currency, amount, rail } = req.body ?? {};
    const result = engine.depositOrWithdraw({
      userId,
      action,
      currency,
      amount: Number(amount),
      rail: String(rail || 'Plaid Instant ACH'),
    });
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.status(201).json(result);
  });

  app.post('/api/wallet/convert', (req, res) => {
    const { userId, fromCurrency, toCurrency, amount } = req.body ?? {};
    const result = engine.convertCurrency({
      userId,
      fromCurrency,
      toCurrency,
      amount: Number(amount),
    });
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json(result);
  });

  app.post('/api/auth/mfa', (req, res) => {
    const { userId, method } = req.body ?? {};
    const result = engine.verifyMfa(String(userId || ''), String(method || 'Biometric Passkey'));
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json(result);
  });

  app.post('/api/kyc/submit', (req, res) => {
    const { userId, applicantName, email, documentType, jurisdiction, sourceOfFunds } = req.body ?? {};
    if (!userId || !applicantName || !documentType) {
      res.status(400).json({ error: 'Missing required KYC dossier fields.' });
      return;
    }
    const application = engine.submitKyc({
      userId,
      applicantName,
      email: email || '',
      documentType,
      jurisdiction: jurisdiction || 'Global Clearing',
      sourceOfFunds: sourceOfFunds || 'Trading Capital',
    });
    res.status(201).json({ application });
  });

  app.post('/api/kyc/review', (req, res) => {
    const { kycId, decision, reviewerId, notes } = req.body ?? {};
    const result = engine.reviewKyc({ kycId, decision, reviewerId, notes: notes || '' });
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json(result);
  });

  app.post('/api/keys', (req, res) => {
    const { userId, label, permissions } = req.body ?? {};
    const result = engine.createApiKey({
      userId,
      label: String(label || 'Execution Key'),
      permissions: Array.isArray(permissions) ? permissions : ['read:market'],
    });
    if (!result.ok) {
      res.status(403).json({ error: result.error });
      return;
    }
    res.status(201).json(result);
  });

  app.delete('/api/keys/:id', (req, res) => {
    const actorId = String(req.query.actorId || 'usr_inst_01');
    const result = engine.revokeApiKey(req.params.id, actorId);
    if (!result.ok) {
      res.status(404).json({ error: result.error });
      return;
    }
    res.json(result);
  });

  app.post('/api/safety/circuit-breaker', (req, res) => {
    const { actorId, active } = req.body ?? {};
    const result = engine.toggleCircuitBreaker(String(actorId || 'usr_comp_01'), Boolean(active));
    res.json(result);
  });

  app.get('/api/openapi.json', (_req, res) => {
    res.json({
      openapi: '3.1.0',
      info: {
        title: 'Meridian Trade — Fintech & Trading Platform API',
        version: '1.0.0',
        description: 'External REST & WebSocket execution specification per SRS Section 2.6 & 3.4.',
      },
      paths: {
        '/api/market/{symbol}': {
          get: { summary: 'Fetch live Level 1 quote and 24h market statistics' },
        },
        '/api/orders': {
          post: { summary: 'Submit Market, Limit, or Stop-Loss order with balance pre-check (REQ-3, REQ-4)' },
        },
        '/api/orders/{id}': {
          delete: { summary: 'Cancel resting open order and release reserved funds' },
        },
        '/api/wallet/transfer': {
          post: { summary: 'Process Plaid ACH / Stripe / SEPA deposit or withdrawal' },
        },
        '/api/wallet/convert': {
          post: { summary: 'Execute cross-border multi-currency FX conversion' },
        },
        '/api/kyc/review': {
          post: { summary: 'Compliance Officer KYC/AML verification decision' },
        },
      },
    });
  });

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Meridian Trade server listening on http://0.0.0.0:${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
