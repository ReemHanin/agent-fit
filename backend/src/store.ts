import { EventEmitter } from 'events';
import { Response } from 'express';
import { Mission, AgentMessage } from './types';

interface SSEClient {
  missionId: string;
  res: Response;
}

class MissionStore extends EventEmitter {
  private missions: Map<string, Mission> = new Map();
  private clients: SSEClient[] = [];

  getMissions(): Mission[] {
    return Array.from(this.missions.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  getMission(id: string): Mission | undefined {
    return this.missions.get(id);
  }

  createMission(mission: Mission): void {
    this.missions.set(mission.id, mission);
  }

  updateMission(id: string, update: Partial<Mission>): void {
    const mission = this.missions.get(id);
    if (!mission) return;
    Object.assign(mission, update);
    this.broadcast(id, { type: 'mission_updated', mission });
  }

  addMessage(missionId: string, message: AgentMessage): void {
    const mission = this.missions.get(missionId);
    if (!mission) return;
    mission.messages.push(message);
    this.broadcast(missionId, { type: 'message', message });
  }

  addSSEClient(missionId: string, res: Response): void {
    const client: SSEClient = { missionId, res };
    this.clients.push(client);
    res.on('close', () => {
      this.clients = this.clients.filter(c => c.res !== res);
    });
  }

  private broadcast(missionId: string, data: object): void {
    const payload = `data: ${JSON.stringify(data)}\n\n`;
    this.clients
      .filter(c => c.missionId === missionId)
      .forEach(c => {
        try { c.res.write(payload); } catch { /* client disconnected */ }
      });
  }
}

export const store = new MissionStore();
