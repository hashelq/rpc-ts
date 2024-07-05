export default abstract class AbstractSocket {
  // FIXME: better error handling
  abstract on(name: "open", callback: () => void): void;
  abstract on(name: "message", callback: (data: string) => void): void;
  abstract on(name: "error", callback: (error: any) => void): void;
  abstract on(name: "close", callback: () => void): void;
  abstract send(data: string): void;

  abstract close(): void;
}
