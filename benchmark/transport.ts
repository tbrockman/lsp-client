import { JSONRPCMessage } from "../src/jsonclient.js";


export class Transport {
    handlers: Set<(message: any) => void>;

    constructor(public worker: SharedWorker) {
        this.worker = worker;
        this.handlers = new Set();
        this.worker.port.onmessage = (event) => {
            for (const handler of this.handlers) {
                handler(JSON.stringify(event.data));
            }
        };
    }

    send(message: string) {
        this.worker.port.postMessage(JSON.parse(message));
    }

    subscribe(handler: (message: string) => void) {
        this.handlers.add(handler);
    }

    unsubscribe(handler: (message: string) => void) {
        this.handlers.delete(handler);
    }
}

// JSON Transport for the JSON client
export class JSONTransport {
    handlers: Set<(message: any) => void>;

    constructor(public worker: SharedWorker) {
        this.worker = worker;
        this.handlers = new Set();
        this.worker.port.onmessage = (event) => {
            for (const handler of this.handlers) {
                handler(event.data);
            }
        };
        this.worker.port.start();
    }

    send(message: JSONRPCMessage) {
        this.worker.port.postMessage(message);
    }

    subscribe(handler: (message: JSONRPCMessage) => void) {
        this.handlers.add(handler);
    }

    unsubscribe(handler: (message: JSONRPCMessage) => void) {
        this.handlers.delete(handler);
    }
}