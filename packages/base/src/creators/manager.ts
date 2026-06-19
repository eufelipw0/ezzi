import type { LithiumApp } from "../app.js";

export abstract class BaseManager {
  public readonly logs: string[];
  public readonly app: LithiumApp;
  constructor(app: LithiumApp) {
    this.app = app;
    this.logs = [];
  }
}
