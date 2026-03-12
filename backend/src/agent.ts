import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';
import { store } from './store';
import { webSearch, fetchUrl, runIosShortcut } from './tool-handlers';

const client = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',
});

const SYSTEM_PROMPT = `You are an autonomous AI agent executing missions on behalf of the user. You have REAL tools — use them to actually accomplish tasks.

Available tools:
- notify_user: send progress updates to the user (required at every step)
- web_search: search the internet for real, up-to-date information
- fetch_url: read the full content of any web page
- run_ios_shortcut: trigger an iOS Shortcut on the user's iPhone to control apps

iOS Shortcut control — the user has set up Shortcuts on their iPhone:
- "AgentSendWhatsApp" — input: "ContactName: message text"
- "AgentSendSMS"      — input: "ContactName: message text"
- "AgentMakeCall"     — input: phone number or contact name
- "AgentOpenApp"      — input: app name (e.g. "Spotify", "Camera", "Maps")
- "AgentSetAlarm"     — input: time string (e.g. "7:30 AM")
- "AgentSetReminder"  — input: "Task at Time" (e.g. "Buy milk at 3pm")
- "AgentPlayMusic"    — input: song or playlist name
- "AgentSendEmail"    — input: "to@email.com: subject: body"

When given a mission:
1. Immediately notify_user (stage: starting) with what you plan to do
2. Use web_search / fetch_url to gather real information when needed
3. Use run_ios_shortcut to take real actions on the phone
4. Send progress updates (notify_user) after each major step
5. When fully done, call notify_user with is_complete=true and a complete summary

Rules:
- NEVER pretend to do something — use the real tools
- If a shortcut isn't responding, tell the user and explain what they need to do manually
- Keep progress updates concise (1-2 sentences), final report detailed
- Use emojis: 🔍 research, 📋 planning, ⚡ executing, ✅ done`;

const tools: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'notify_user',
      description: 'Send a progress update or final completion report to the user.',
      parameters: {
        type: 'object',
        properties: {
          message: {
            type: 'string',
            description: 'The message to show the user. Be specific and informative.',
          },
          stage: {
            type: 'string',
            enum: ['starting', 'analyzing', 'researching', 'planning', 'executing', 'reviewing', 'completing'],
            description: 'Current phase of the mission.',
          },
          is_complete: {
            type: 'boolean',
            description: 'Set true ONLY when the entire mission is fully finished.',
          },
        },
        required: ['message', 'stage', 'is_complete'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Search the web for real-time information. Returns search snippets.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query.',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'fetch_url',
      description: 'Fetch and read the text content of a web page URL.',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'Full URL to fetch (e.g. https://example.com/article).',
          },
        },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_ios_shortcut',
      description:
        'Run an iOS Shortcut on the user\'s iPhone. This actually controls the phone — sends WhatsApp messages, makes calls, opens apps, sets alarms, etc. The app must be open on the phone.',
      parameters: {
        type: 'object',
        properties: {
          shortcut_name: {
            type: 'string',
            description:
              'Exact name of the iOS Shortcut (e.g. "AgentSendWhatsApp", "AgentOpenApp", "AgentMakeCall").',
          },
          input: {
            type: 'string',
            description:
              'Text input for the Shortcut. Messaging format: "ContactName: message". Calls: phone number. Apps: app name.',
          },
        },
        required: ['shortcut_name', 'input'],
      },
    },
  },
];

// ─── Tool executor ─────────────────────────────────────────────────────────────

async function executeTool(name: string, args: Record<string, string>): Promise<string> {
  switch (name) {
    case 'web_search':
      return await webSearch(args.query ?? '');
    case 'fetch_url':
      return await fetchUrl(args.url ?? '');
    case 'run_ios_shortcut':
      return runIosShortcut(args.shortcut_name ?? '', args.input ?? '');
    default:
      return `Unknown tool: ${name}`;
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

      // Append assistant turn to history
      messages.push(assistantMessage);

      // Process all tool calls in this turn
      if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
        for (const toolCall of assistantMessage.tool_calls) {
          let toolResult: string;

          if (toolCall.function.name === 'notify_user') {
            // notify_user is handled locally — never calls the network
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
            // Real tool execution
            const args = JSON.parse(toolCall.function.arguments) as Record<string, string>;
            toolResult = await executeTool(toolCall.function.name, args);
          }

          // Feed result back into conversation
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: toolResult,
          });
        }
      }

      // Model finished without calling complete — treat last text as result
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
