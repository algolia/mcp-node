import { AppStateManager } from "../appState.ts";
import { authenticate as authenticateFn } from "../authentication.ts";

export async function authenticate(): Promise<void> {
  console.log("Starting authentication...");
  const appState = await AppStateManager.load();

  const token = await authenticateFn();

  await appState.update({
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
  });
  console.log("Authentication successful!");
}
