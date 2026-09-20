export type EngineErrorCode =
  | "INVALID_ACTION"
  | "NOT_YOUR_TURN"
  | "GAME_FINISHED"
  | "PENDING_DECISION"
  | "NO_PENDING_DECISION"
  | "INSUFFICIENT_FUNDS"
  | "INVALID_TARGET"
  | "CONTENT_ERROR";

export class EngineError extends Error {
  readonly code: EngineErrorCode;

  constructor(code: EngineErrorCode, message: string) {
    super(message);
    this.name = "EngineError";
    this.code = code;
  }
}
