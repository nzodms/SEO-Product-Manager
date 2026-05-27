// GraphQL read operations (Admin API).

export const PRODUCTS_QUERY = /* GraphQL */ `
  query Products($first: Int!, $after: String, $query: String) {
    products(first: $first, after: $after, query: $query, sortKey: UPDATED_AT) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        handle
        title
        descriptionHtml
        vendor
        productType
        tags
        status
        seo { title description }
        media(first: 20) {
          nodes {
            ... on MediaImage {
              id
              image { url altText }
            }
          }
        }
      }
    }
  }
`;

export const COLLECTIONS_QUERY = /* GraphQL */ `
  query Collections($first: Int!, $after: String, $query: String) {
    collections(first: $first, after: $after, query: $query, sortKey: UPDATED_AT) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        handle
        title
        descriptionHtml
        seo { title description }
      }
    }
  }
`;

export const SHOP_INFO_QUERY = /* GraphQL */ `
  query ShopInfo {
    shop {
      name
      myshopifyDomain
      primaryDomain { url }
    }
  }
`;
