// GraphQL write operations (Admin API). Each mutation touches ONLY the fields
// the app explicitly sends — images, variants and positions are never included
// unless the dedicated image flow is used.

// productUpdate handles title, descriptionHtml, handle, tags, vendor, seo.
export const PRODUCT_UPDATE_MUTATION = /* GraphQL */ `
  mutation ProductUpdate($input: ProductInput!) {
    productUpdate(input: $input) {
      product { id handle title }
      userErrors { field message }
    }
  }
`;

// Alt text only — updates a single MediaImage's alt without touching src/position.
export const PRODUCT_UPDATE_MEDIA_MUTATION = /* GraphQL */ `
  mutation ProductUpdateMedia($productId: ID!, $media: [UpdateMediaInput!]!) {
    productUpdateMedia(productId: $productId, media: $media) {
      media { ... on MediaImage { id alt } }
      mediaUserErrors { field message }
    }
  }
`;

export const COLLECTION_UPDATE_MUTATION = /* GraphQL */ `
  mutation CollectionUpdate($input: CollectionInput!) {
    collectionUpdate(input: $input) {
      collection { id handle title }
      userErrors { field message }
    }
  }
`;

export const PRODUCT_CREATE_MUTATION = /* GraphQL */ `
  mutation ProductCreate($input: ProductInput!) {
    productCreate(input: $input) {
      product { id handle title }
      userErrors { field message }
    }
  }
`;
