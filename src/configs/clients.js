export const clients = [
    // authCodeCredential Test
    {
      client_id: "auth_test",
      client_secret: "123",
      application_type: "web",
      id_token_signed_response_alg: "ES256",
      redirect_uris: ["http://localhost:3001/auth"],
      response_types: ["code"],
      grant_types: ["refresh_token", "authorization_code"],
      pkceMethods: ["S256"],
      post_logout_redirect_uris: ["http://localhost:3001/"],
      scope: "openid",
      token_endpoint_auth_method: "client_secret_basic"
    },
      // clientCredential Test
    {
      client_id: "test",
      client_secret: "test",
      application_type: "web",
      id_token_signed_response_alg: "ES256",
      redirect_uris: [],
      response_types: [],
      grant_types: ["client_credentials"],
      pkceMethods: [],
      post_logout_redirect_uris: []
    }
  ];