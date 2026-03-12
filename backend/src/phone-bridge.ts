import { Response } from 'express';

/**
 * Manages persistent SSE connections from the iPhone app.
 * The agent calls phoneBridge.send() to push commands to the phone.
 */
class PhoneBridge {
  private clients: Response[] = [];

  addClient(res: Response): void {
    this.clients.push(res);
    res.on('close', () => {
      this.clients = this.clients.filter(c => c !== res);
    });
  }

  /** Returns true if at least one phone client received the command */
  send(command: object): boolean {
    if (this.clients.length === 0) return false;
    const payload = `data: ${JSON.stringify(command)}\n\n`;
    let sent = false;
    this.clients.forEach(client => {
      try {
        client.write(payload);
        sent = true;
      } catch { /* client disconnected */ }
    });
    return sent;
  }

  isConnected(): boolean {
    return this.clients.length > 0;
  }

  clientCount(): number {
    return this.clients.length;
  }
}

export const phoneBridge = new PhoneBridge();
