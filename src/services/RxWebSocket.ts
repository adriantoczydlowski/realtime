import { Subject, Observable, Observer, Subscriber, Subscription  } from '@reactivex/rxjs';

export class RxWebSocket {
  socket: WebSocket;
  messageQueue: string[] = [];
  didOpen: (e: Event) => void;
  willOpen: () => void;
  didClose: (e?: any) => void;

  _out: Observable<any>;
  _in: Observer<any>;

  constructor(private url: string,
              private WebSocketCtor: { new(url:string): WebSocket } = WebSocket) {}
  
  static create(url: string, WebSocketCtor: { new(url:string): WebSocket } = WebSocket): RxWebSocket {
    return new RxWebSocket(url, WebSocketCtor);
  }

  selector(e: MessageEvent) {
    return JSON.parse(e.data);
  }

  get out(): Observable<any> {
    if (!this._out) {
      this._out = Observable.create(subscriber => {
        if (this.willOpen) {
          this.willOpen();
        }

        let socket = this.socket = new this.WebSocketCtor(this.url);

        socket.onopen = (e) => {
          this.flushMessages();
          if (this.didOpen) {
            this.didOpen(e);
          }
        };

        socket.onclose = (e) => {
          if (e.wasClean) {
            subscriber.complete();
            if (this.didClose) {
              this.didClose(e);
            }
          } else {
            subscriber.error(e);
          }
        };

        socket.onerror = (e) => subscriber.error(e);

        socket.onmessage = (e) => {
          subscriber.next(this.selector(e));
        }

        return () => {
          socket.close();
          this.socket = null;
          this._out = null;
        };
      }).share();
    }

    return this._out;
  }

  send(message: any) {
    const data = typeof message === 'string' ? message : JSON.stringify(message);
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(data);
    } else {
      this.messageQueue.push(data);
    }
  }

  get in(): Observer<any> {
    if (!this._in) {
      this._in = {
        next: (message: any) => this.send(message),
        error: (err: any) => {
          this.socket.close(3000, err);
          this.socket = null;
        },
        complete: () => {
          this.socket.close();
          this.socket = null;
        }
      }
    }

    return this._in
  }

  private flushMessages() {
    const messageQueue = this.messageQueue;
    const socket = this.socket;

    while (messageQueue.length > 0 && socket.readyState === WebSocket.OPEN) {
      socket.send(messageQueue.shift());
    }
  }

}