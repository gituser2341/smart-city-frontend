import { Injectable } from '@angular/core';
import { Client, IMessage } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { Subject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class WebSocketService {

  private client!: Client;
  notification$ = new Subject<string>();  // ← components subscribe to this

  connect(email: string, token: string) {
    this.client = new Client({
      webSocketFactory: () => new SockJS('http://localhost:8080/ws'),
      connectHeaders: { Authorization: `Bearer ${token}` },
      onConnect: () => {
        console.log('✅ WebSocket connected');

        // Subscribe to personal notifications
        this.client.subscribe(
          `/user/${email}/queue/notifications`,
          (msg: IMessage) => {
            console.log('🔔 WebSocket message received:', msg.body);
            this.notification$.next(msg.body);
          }
        );
      },
      onDisconnect: () => console.log('❌ WebSocket disconnected'),
      onStompError: (frame) => console.error('STOMP error', frame)
    });

    this.client.activate();
  }

  disconnect() {
    if (this.client?.active) this.client.deactivate();
  }
}