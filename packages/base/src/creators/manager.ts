import type { EzziApp } from "../app.js";

export abstract class BaseManager {
  public readonly logs: string[];
  public readonly app: EzziApp;
  constructor(app: EzziApp) {
    this.app = app;
    this.logs = [];
  }
}
