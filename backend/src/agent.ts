import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';
import { store } from './store';
import {
  webSearch,
  fetchUrl,
  lookupContact,
  openWhatsApp,
  makeCall,
  sendSms,
  openEmail,
  openMaps,
  openApp,
  openUrl,
} from './tool-handlers';

const client = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',
});

const SYSTEM_PROMPT = `You are an autonomous AI agent that executes missions on behalf of the user. You have REAL tools — use them to actually do things.

You can control the user's iPhone directly (no Shortcuts setup needed):
- lookup_contact — search the user's contacts by name to get their phone number
- open_whatsapp — open WhatsApp with a pre-filled message (user taps Send)
- make_call — initiate a phone call
- send_sms — open Messages with pre-filled SMS
- open_email — open Mail with pre-filled email
- open_maps — open Maps with directions
- open_app — open any app (Spotify, Instagram, YouTube, TikTok, Telegram, etc.)
- open_url — open any URL in Safari

IMPORTANT: When the user says "send to Mom / call John / message Sarah":
1. ALWAYS call lookup_contact first to find their phone number
2. Use the returned phone number for open_whatsapp / make_call / send_sms
3. If multiple matches, pick the best one or ask the user to clarify

You can also search and read the web:
- web_search — search DuckDuckGo for real-time information
- fetch_url — read the full content of any web page

Mission execution rules:
1. Start with notify_user (stage: starting) explaining your plan
2. Use web_search / fetch_url for any information you need
3. Use the phone tools to take real actions on the iPhone
4. Send notify_user updates after each major step
5. End with notify_user (is_complete: true) with a full summary

Important:
- NEVER pretend to do something — always use the real tools
- For WhatsApp/SMS/email: the app opens pre-filled, user taps Send (this is by design for safety)
- For calls: iOS shows a confirmation dialog before dialing
- If the phone is not connected, tell the user to open Agent Fit on their iPhone
- Keep progress updates brief (1-2 sentences); final report can be detailed
- Use emojis: 🔍 researching, 📋 planning, ⚡ executing, ✅ done`;

const tools: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'notify_user',
      description: 'Send a progress update or final completion report to the user.',
      parameters: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'Message to show the user.' },
          stage: {
            type: 'string',
            enum: ['starting', 'analyzing', 'researching', 'planning', 'executing', 'reviewing', 'completing'],
          },
          is_complete: { type: 'boolean', description: 'True only when the whole mission is done.' },
        },
        required: ['message', 'stage', 'is_complete'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'lookup_contact',
      description: 'Search the user\'s iPhone contacts by name to get their phone number. Always call this FIRST when the user refers to a person by name (e.g. "Mom", "John", "Sarah") before sending a message or making a call.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'The contact name to search for, e.g. "Mom", "John Smith".' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Search the web for real-time information.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'fetch_url',
      description: 'Fetch and read the text content of a web page.',
      parameters: {
        type: 'object',
        properties: { url: { type: 'string', description: 'Full URL to fetch.' } },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'open_whatsapp',
      description: 'Open WhatsApp on the iPhone with a message pre-filled. Works without any Shortcuts setup. User just taps Send.',
      parameters: {
        type: 'object',
        properties: {
          phone_number: { type: 'string', description: 'Phone number in international format, e.g. +972501234567' },
          message: { type: 'string', description: 'The message to pre-fill.' },
        },
        required: ['phone_number', 'message'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'make_call',
      description: 'Initiate a phone call on the iPhone.',
      parameters: {
        type: 'object',
        properties: {
          phone_number: { type: 'string', description: 'Phone number to call.' },
        },
        required: ['phone_number'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_sms',
      description: 'Open the Messages app on the iPhone with an SMS/iMessage pre-filled.',
      parameters: {
        type: 'object',
        properties: {
          phone_number: { type: 'string', description: 'Phone number.' },
          message: { type: 'string', description: 'Message text.' },
        },
        required: ['phone_number', 'message'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'open_email',
      description: 'Open the Mail app on the iPhone with an email pre-filled.',
      parameters: {
        type: 'object',
        properties: {
          to: { type: 'string', description: 'Recipient email address.' },
          subject: { type: 'string', description: 'Email subject.' },
          body: { type: 'string', description: 'Email body text.' },
        },
        required: ['to', 'subject', 'body'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'open_maps',
      description: 'Open Apple Maps on the iPhone with directions to a destination.',
      parameters: {
        type: 'object',
        properties: {
          destination: { type: 'string', description: 'Destination address or place name.' },
        },
        required: ['destination'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'open_app',
      description: 'Open any installed app on the iPhone by name. Works for Spotify, YouTube, Instagram, TikTok, Twitter/X, Telegram, WhatsApp, FaceTime, Netflix, Uber, Snapchat, Gmail, and many more.',
      parameters: {
        type: 'object',
        properties: {
          app_name: { type: 'string', description: 'Name of the app, e.g. "Spotify", "Instagram", "YouTube".' },
        },
        required: ['app_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'open_url',
      description: 'Open any URL in Safari on the iPhone.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'Full URL to open.' },
        },
        required: ['url'],
      },
    },
  },
];

// ─── Tool executor ─────────────────────────────────────────────────────────────

async function executeTool(name: string, args: Record<string, string>): Promise<string> {
  switch (name) {
    case 'lookup_contact': return lookupContact(args.name ?? '');
    case 'web_search':    return await webSearch(args.query ?? '');
    case 'fetch_url':     return await fetchUrl(args.url ?? '');
    case 'open_whatsapp': return openWhatsApp(args.phone_number ?? '', args.message ?? '');
    case 'make_call':     return makeCall(args.phone_number ?? '');
    case 'send_sms':      return sendSms(args.phone_number ?? '', args.message ?? '');
    case 'open_email':    return openEmail(args.to ?? '', args.subject ?? '', args.body ?? '');
    case 'open_maps':     return openMaps(args.destination ?? '');
    case 'open_app':      return openApp(args.app_name ?? '');
    case 'open_url':      return openUrl(args.url ?? '');
    default:              return `Unknown tool: ${name}`;
  }
}

// ─── Agent runner ──────────────────────────────────────────────────────────────

export async function runAgent(missionId: string): Promise<void> {
  const mission = store.getMission(missionId);
  if (!mission) return;

  store.updateMission(missionId, { status: 'running' });

  const addMsg = (
    type: 'status' | 'progress' | 'result' | 'error',
    content: string,
    stage?: string,
  ) => {
    store.addMessage(missionId, {
      id: uuidv4(),
      type,
      stage,
      content,
      timestamp: new Date().toISOString(),
    });
  };

  addMsg('status', 'Agent is initializing...');

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `Execute this mission: ${mission.description}` },
  ];

  let isComplete = false;
  let iterations = 0;
  const maxIterations = 40;

  try {
    while (!isComplete && iterations < maxIterations) {
      iterations++;

      const response = await client.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 8192,
        tools,
        tool_choice: 'auto',
        messages,
      });

      const assistantMessage = response.choices[0].message;
      messages.push(assistantMessage);

      if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
        for (const toolCall of assistantMessage.tool_calls) {
          let toolResult: string;

          if (toolCall.function.name === 'notify_user') {
            const input = JSON.parse(toolCall.function.arguments) as {
              message: string;
              stage: string;
              is_complete: boolean;
            };
            if (input.is_complete) {
              addMsg('result', input.message, input.stage);
              isComplete = true;
            } else {
              addMsg('progress', input.message, input.stage);
            }
            toolResult = 'Notification delivered.';
          } else {
            const args = JSON.parse(toolCall.function.arguments) as Record<string, string>;
            toolResult = await executeTool(toolCall.function.name, args);
          }

          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: toolResult,
          });
        }
      }

      if (response.choices[0].finish_reason === 'stop' && !isComplete) {
        const text = assistantMessage.content?.trim() ?? '';
        addMsg('result', text || 'Mission completed.', 'completing');
        isComplete = true;
      }
    }

    if (!isComplete) {
      addMsg('result', 'Mission reached maximum steps. See progress above.', 'completing');
    }

    store.updateMission(missionId, {
      status: 'completed',
      completedAt: new Date().toISOString(),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error occurred';
    addMsg('error', `Mission failed: ${msg}`);
    store.updateMission(missionId, { status: 'failed' });
  }
}
