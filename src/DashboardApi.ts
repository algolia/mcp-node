import z from "zod";
import { AppStateManager } from "./appState.ts";
import { refreshToken } from "./authentication.ts";

export type DashboardApiOptions = {
  baseUrl: string;
  appState: AppStateManager;
};

const User = z.object({
  data: z.object({
    id: z.string(),
    type: z.string(),
    attributes: z.object({
      full_name: z.string(),
      email: z.string(),
      avatar: z
        .object({
          "64": z.string().url(),
        })
        .partial(),
      updated_at: z.string().datetime(),
    }),
  }),
});
type User = z.infer<typeof User>;

const Application = z.object({
  id: z.string(),
  type: z.string(),
  attributes: z.object({
    name: z.string().nullable(),
    is_owner: z.boolean(),
    permissions: z.array(z.string()),
    log_region: z.string(),
  }),
});

const ApplicationList = z.object({
  data: z.array(Application),
  meta: z.object({
    total_count: z.number(),
    per_page: z.number(),
    current_page: z.number(),
    total_pages: z.number(),
  }),
});
type ApplicationList = z.infer<typeof ApplicationList>;

const CreateApiKeyResponse = z.object({
  data: z.object({
    id: z.string(),
    type: z.string(),
    attributes: z.object({
      // application_id: z.string(),
      value: z.string(),
      // acl: z.array(z.string()),
      // description: z.string(),
      // indexes: z.array(z.string()),
      // max_hits_per_query: z.number().nullable(),
      // max_queries_per_ip_per_hour: z.number().nullable(),
      // query_parameters: z.string().nullable(),
      // referers: z.array(z.string()),
      // validity: z.number().nullable(),
      // owner: z.object({
      //   id: z.string(),
      //   type: z.string(),
      //   name: z.string(),
      // }),
      // rotated_at: z.string().datetime().nullable(),
      // created_at: z.string().datetime(),
      // updated_at: z.string().datetime(),
    }),
  }),
});
type CreateApiKeyResponse = z.infer<typeof CreateApiKeyResponse>;

export class DashboardApi {
  #options: DashboardApiOptions;

  constructor(options: DashboardApiOptions) {
    this.#options = options;
  }

  async getUser(): Promise<User> {
    const response = await this.#makeRequest(`${this.#options.baseUrl}/1/user`);
    return User.parse(await response.json());
  }

  async getApplications(): Promise<ApplicationList> {
    const response = await this.#makeRequest(`${this.#options.baseUrl}/1/applications`);
    return ApplicationList.parse(await response.json());
  }

  async getApiKey(applicationId: string): Promise<string> {
    const apiKeys = this.#options.appState.get("apiKeys");
    let apiKey = apiKeys[applicationId];

    if (!apiKey) {
      apiKey = await this.#createApiKey(applicationId);
      this.#options.appState.update({
        apiKeys: { ...apiKeys, [applicationId]: apiKey },
      });
    }

    return apiKey;
  }

  async #createApiKey(applicationId: string): Promise<string> {
    const response = await this.#makeRequest(
      `${this.#options.baseUrl}/1/applications/${applicationId}/api-keys`,
      {
        method: "POST",
        body: JSON.stringify({
          acl: ["search", "listIndexes", "analytics", "usage", "settings"],
          description: "API Key created by and for the Algolia MCP Server",
        }),
      },
    );

    const result = await CreateApiKeyResponse.parse(await response.json());

    return result.data.attributes.value;
  }

  async #makeRequest(url: string, requestInit: RequestInit = {}): Promise<Response> {
    const response = await fetch(url, {
      ...requestInit,
      headers: {
        ...this.#baseHeaders,
        ...requestInit.headers,
      },
    });

    if (await this.#isTokenExpiredResponse(response)) {
      const refreshResponse = await refreshToken(this.#options.appState.get("refreshToken"));
      await this.#options.appState.update({
        accessToken: refreshResponse.access_token,
        refreshToken: refreshResponse.refresh_token,
      });

      return this.#makeRequest(url, requestInit);
    }

    if (!response.ok) {
      const body = await response.text();

      throw new Error(`Error ${response.status}: ${body}`);
    }

    return response;
  }

  async #isTokenExpiredResponse(response: Response): Promise<boolean> {
    if (response.status !== 401) return false;
    const body = await response.clone().text();
    return body.includes("The access token expired");
  }

  get #baseHeaders() {
    return {
      Authorization: `Bearer ${this.#options.appState.get("accessToken")}`,
      "Content-Type": "application/json",
      Accept: "application/vnd.api+json",
    };
  }
}
