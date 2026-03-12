export interface Mission {
  id: string;
  title: string;
  description: string;
  notifyMode: 'all' | 'completion';
  status: 'pending' | 'running' | 'completed' | 'failed';
  messages: AgentMessage[];
  createdAt: string;
  completedAt?: string;
}

export interface AgentMessage {
  id: string;
  type: 'status' | 'progress' | 'result' | 'error';
  stage?: string;
  content: string;
  timestamp: string;
}
