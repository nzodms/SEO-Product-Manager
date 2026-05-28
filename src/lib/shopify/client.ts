// Minimal, dependency-free Shopify Admin GraphQL client.
// REST Admin API is legacy as of 2024-10; this app uses GraphQL exclusively.

export interface ShopCredentials {
  domain: string; // e.g. "lumio.myshopify.com"
  accessToken: string; // custom-app Admin API token (Shopify Admin API access token)
  apiVersion?: string;
}

export interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
  extensions?: {
    cost?: {
      throttleStatus?: {
        currentlyAvailable: number;
        maximumAvailable: number;
        restoreRate: number;
      };
    };
  };
}

export class ShopifyClient {
  private endpoint: string;
  private token: string;

  constructor(creds: ShopCredentials) {
    const version = creds.apiVersion || process.env.SHOPIFY_API_VERSION || "2025-01";
    this.endpoint = `https://${creds.domain}/admin/api/${version}/graphql.json`;
    this.token = creds.accessToken;
  }

  async request<T>(
    query: string,
    variables?: Record<string, unknown>
  ): Promise<T> {
    const res = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": this.token,
      },
      body: JSON.stringify({ query, variables }),
      // Shopify rate-limit friendliness handled by caller batching.
    });

    if (!res.ok) {
      throw new Error(`Shopify HTTP ${res.status}: ${await res.text()}`);
    }

    const json = (await res.json()) as GraphQLResponse<T>;
    if (json.errors?.length) {
      throw new Error(
        `Shopify GraphQL error: ${json.errors.map((e) => e.message).join("; ")}`
      );
    }
    if (!json.data) throw new Error("Shopify returned no data.");
    return json.data;
  }
}
