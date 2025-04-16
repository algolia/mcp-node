import { AppStateManager } from "../appState.ts";

export async function logout(): Promise<void> {
  console.log("Logging out...");
  await AppStateManager.reset();
  console.log("Logged out successfully!");
}
