import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';
import { store } from './store';

const client = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1'
});

const SYSTEM_PROMPT = `You are an autonomous AI agent executing missions assigned by users.

When given a mission, you must:
1. Break it into clear phases (analyze, research, plan, execute, review)
2. Use the "notify_user" tool to send progress updates at EVERY major step
3. Work through the mission thoroughly and methodically
4. Be specific in your updates — tell the user exactly what you're doing and what you found
5. When done, call notify_user with is_complete=true and a detailed final report

Guidelines for notifications:
- Send an update when starting each new phase
- Share interesting findings or decisions as you work
- Keep individual progress updates concise (1-2 sentences)
- The final completion message should be comprehensive and well-structured
- Use emojis sparingly to indicate stages (🔍 research, 📋 planning, ⚡ executing, ✅ done)

You have full autonomy to decide how to approach the mission. Think creatively and work through it step by step.`;

const tools: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'notify_user',
      description: 'Send a progress update or completion notification to the user about the mission',
      parameters: {
        type: 'object',
        properties: {
          message: {
            type: 'string',
            description: 'The message to send to the user — be specific and informative'
          },
          stage: {
            type: 'string',
            enum: ['starting', 'analyzing', 'researching', 'planning', 'executing', 'reviewing', 'completing'],
            description: 'The current stage of the mission'
          },
          is_complete: {
            type: 'boolean',
            description: 'Set to true ONLY when the entire mission is fully complete'
          }
        },
        required: ['message', 'stage', 'is_complete']
      }
    }
  }
];

export async function runAgent(missionId: string): Promise<void> {
  const mission = store.getMission(missionId);
  if (!mission) return;

  store.updateMission(missionId, { status: 'running' });

  const addMsg = (
    type: 'status' | 'progress' | 'result' | 'error',
    content: string,
    stage?: string
  ) => {
    store.addMessage(missionId, {
      id: uuidv4(),
      type,
      stage,
      content,
      timestamp: new Date().toISOString()
    });
  };

  addMsg('status', 'Agent is initializing...');

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `Execute this mission: ${mission.description}` }
  ];

  let isComplete = false;
  let iterations = 0;
  const maxIterations = 30;

  try {
    while (!isComplete && iterations < maxIterations) {
      iterations++;

      const response = await client.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 8192,
        tools,
        messages
      });

      const assistantMessage = response.choices[0].message;

      // Append assistant response to conversation history
      messages.push(assistantMessage);

      // Process tool calls
      if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
        for (const toolCall of assistantMessage.tool_calls) {
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

            // Feed result back so the model can continue
            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: 'Notification delivered to user successfully.'
            });
          }
        }
      }

      // If model finished without calling complete, treat last text as result
      if (response.choices[0].finish_reason === 'stop' && !isComplete) {
        const text = assistantMessage.content?.trim() ?? '';
        addMsg('result', text || 'Mission completed successfully.', 'completing');
        isComplete = true;
      }
    }

    if (!isComplete) {
      addMsg('result', 'Mission reached maximum steps. Here is the progress so far.', 'completing');
    }

    store.updateMission(missionId, {
      status: 'completed',
      completedAt: new Date().toISOString()
    });

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error occurred';
    addMsg('error', `Mission failed: ${errorMsg}`);
    store.updateMission(missionId, { status: 'failed' });
  }
}
