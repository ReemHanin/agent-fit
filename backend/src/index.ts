import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import OpenAI from 'openai';
import { store } from './store';
import { runAgent } from './agent';
import { Mission } from './types';
import { phoneBridge } from './phone-bridge';
import { contactsStore, StoredContact } from './contacts-store';

const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1'
});

const app = express();
const PORT = parseInt(process.env.PORT ?? '3001', 10);

app.use(cors());
app.use(express.json());

// List all missions
app.get('/api/missions', (_req, res) => {
  res.json(store.getMissions());
});

// Get single mission
app.get('/api/missions/:id', (req, res) => {
  const mission = store.getMission(req.params.id);
  if (!mission) return res.status(404).json({ error: 'Mission not found' });
  res.json(mission);
});

// Create a new mission and start the agent
app.post('/api/missions', (req, res) => {
  const { description, notifyMode } = req.body;

  if (!description?.trim()) {
    return res.status(400).json({ error: 'Description is required' });
  }

  const rawTitle = description.trim();
  const title = rawTitle.length > 60 ? rawTitle.slice(0, 57) + '...' : rawTitle;

  const mission: Mission = {
    id: uuidv4(),
    title,
    description: description.trim(),
    notifyMode: notifyMode === 'completion' ? 'completion' : 'all',
    status: 'pending',
    messages: [],
    createdAt: new Date().toISOString()
  };

  store.createMission(mission);

  // Run agent asynchronously — don't await
  runAgent(mission.id).catch(err =>
    console.error(`Agent error for mission ${mission.id}:`, err)
  );

  res.status(201).json(mission);
});

// SSE stream for real-time mission events
app.get('/api/missions/:id/events', (req, res) => {
  const mission = store.getMission(req.params.id);
  if (!mission) return res.status(404).json({ error: 'Mission not found' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Send current state immediately on connect
  res.write(`data: ${JSON.stringify({ type: 'init', mission })}\n\n`);

  // Register this response as an SSE client
  store.addSSEClient(req.params.id, res);

  // Keep-alive ping every 20 seconds
  const keepAlive = setInterval(() => {
    try { res.write(': ping\n\n'); } catch { clearInterval(keepAlive); }
  }, 20000);

  req.on('close', () => clearInterval(keepAlive));
});

// Suggest a mission from a voice transcript
app.post('/api/suggest', async (req, res) => {
  const { transcript } = req.body as { transcript?: string };
  if (!transcript?.trim()) return res.status(400).json({ error: 'Transcript is required' });

  try {
    const message = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 512,
      messages: [
        {
          role: 'system',
          content: `You are a mission description assistant. The user dictated a voice note describing something they want an AI agent to do.
Your task:
1. Remove filler words (um, uh, like, you know, etc.)
2. Fix grammar/clarity from speech-to-text artifacts
3. Structure as a clear, actionable mission description
4. Generate a short title (max 60 chars) capturing the core goal

Respond ONLY with a raw JSON object (no markdown, no code fences):
{"title": "...", "description": "..."}`
        },
        { role: 'user', content: `Raw voice transcript: ${transcript.trim()}` }
      ],
    });

    const textBlock = message.choices[0].message.content;
    if (!textBlock) {
      return res.status(502).json({ error: 'No text response from model' });
    }

    // Strip markdown code fences in case the model includes them despite instructions
    const raw = textBlock.trim()
      .replace(/^```(?:json)?\n?/, '')
      .replace(/\n?```$/, '');

    const parsed = JSON.parse(raw) as { title: string; description: string };

    if (typeof parsed.title !== 'string' || typeof parsed.description !== 'string') {
      return res.status(502).json({ error: 'Unexpected response shape from model' });
    }

    return res.json({
      title: parsed.title.slice(0, 60),
      description: parsed.description.slice(0, 1000),
    });
  } catch (err) {
    console.error('Suggest endpoint error:', err);
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Internal server error' });
  }
});

// ─── Contacts sync — iPhone app posts contacts on launch ─────────────────────
app.post('/api/contacts', (req, res) => {
  const { contacts } = req.body as { contacts?: StoredContact[] };
  if (!Array.isArray(contacts)) return res.status(400).json({ error: 'contacts array required' });
  contactsStore.setContacts(contacts);
  console.log(`📇 Contacts synced: ${contactsStore.count()} entries`);
  res.json({ ok: true, count: contactsStore.count() });
});

// ─── Phone bridge: iPhone app connects here to receive shortcut commands ───────
app.get('/api/phone/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Confirm connection
  res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

  phoneBridge.addClient(res);
  console.log(`📱 Phone connected (${phoneBridge.clientCount()} total)`);

  // Keep-alive ping every 20 s
  const keepAlive = setInterval(() => {
    try { res.write(': ping\n\n'); } catch { clearInterval(keepAlive); }
  }, 20000);

  req.on('close', () => {
    clearInterval(keepAlive);
    console.log(`📱 Phone disconnected (${phoneBridge.clientCount()} remaining)`);
  });
});

// ─── Phone status: quick check for the UI ────────────────────────────────────
app.get('/api/phone/status', (_req, res) => {
  res.json({ connected: phoneBridge.isConnected(), clients: phoneBridge.clientCount() });
});

app.listen(PORT, () => {
  console.log(`Agent Fit backend running on http://localhost:${PORT}`);
});
