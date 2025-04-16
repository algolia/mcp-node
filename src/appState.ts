import fs, { mkdir } from "node:fs/promises";
import path from "node:path";

export type AppState = {
  accessToken: string;
  refreshToken: string;
  apiKeys: Record<string, string>;
};

const DEFAULT_APP_STATE: AppState = {
  accessToken: "",
  refreshToken: "",
  apiKeys: {},
};

const home = process.env.HOME || process.env.USERPROFILE;

if (!home) {
  throw new Error("Could not find home directory");
}

const STORAGE_PATH = path.join(home, ".algolia-mcp");
const APP_STATE_PATH = path.join(STORAGE_PATH, "state.json");

let SINGLETON: AppStateManager | null = null;

export class AppStateManager {
  #appState: AppState;

  static async load() {
    if (!SINGLETON) {
      await mkdir(STORAGE_PATH, { recursive: true });

      let content: Partial<AppState> = {};

      try {
        content = JSON.parse(await fs.readFile(APP_STATE_PATH, "utf-8")) as Partial<AppState>;
      } catch {
        console.error(`Could not read app state file at ${APP_STATE_PATH}. Using default state.`);
      }

      SINGLETON = new AppStateManager({ ...DEFAULT_APP_STATE, ...content });
    }

    return SINGLETON;
  }

  static async reset(): Promise<void> {
    SINGLETON = null;

    await fs.rmdir(STORAGE_PATH, { recursive: true });
  }

  constructor(initialState: AppState) {
    this.#appState = initialState;
  }

  get<K extends keyof AppState>(key: K): AppState[K] {
    return this.#appState[key];
  }

  async update(update: Partial<AppState>) {
    this.#appState = { ...this.#appState, ...update };
    await fs.writeFile(APP_STATE_PATH, JSON.stringify(this.#appState));
  }
}
