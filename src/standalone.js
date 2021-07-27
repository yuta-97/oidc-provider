import * as dotenv from "dotenv";
dotenv.config();

import { Provider } from "oidc-provider";
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import helmet from "helmet";
import path from "path";
import { initAccount, findAccount, checkAccount } from "./supports/account";

import { clients } from "./configs/clients";
import { privatekeys } from "./configs/privatekeys";
const adapter = require("./adapters/" + process.env.ADAPTER || "redis");

// 가장 중요한부분. provider의 설정값들을 세팅하는 부분이다.
// git에도 이 부분에대한 설명이 부실하고 직접 해보지않으면 뭐하는 설정인지 모르는 것들이 많다.
const configs = {
  clients, // clients.js에서 등록한, 인증서버를 사용하게 될 client들의 정보.
  jwks: privatekeys, // key 발급에 사용될 비대칭 암호키
  adapter: adapter, // 사용할 adapter 클래스. 만약 connection이 필요한 DB ( mongo, dynamo ) 등을 사용한다면 conn 초기화 작업이 먼저 이루어져 있어야한다.
  findAccount: findAccount, // 사용자 정보를 조회할 API 구현부
  // Token의 format을 지정하는 설정.
  formats: {
    // 인증방식에따라 각각 포맷을 지정할 수 있다.
    AccessToken: "jwt",
    ClientCredentials: "jwt",
    // Token의 기본 field 이외에 추가로 넣고싶은 값을 지정.
    customizers: {
      async jwt(ctx, token, jwt) {
        // Token에 "issuerId"라는 필드를 추가
        jwt.payload.issuerId = "custom-field";
      }
    }
  },
  // client.js에서 설정될 client들의 기본 설정들을 지정. 만약 해당 값을 client.js에서 다시 지정한다면 덮어써진다.
  clientDefaults: {
    id_token_signed_response_alg: "ES256",
    token_endpoint_auth_method: "client_secret_basic"
  },
  // 발급받은 Token을 통해 요청할 수 있는 정보와 API의 제한 범위를 지정.
  // 설명하기 가장 어려운 부분이다... 자세한 개념은 검색을 하는게 좋을 것 같다. 키워드는 claims, scope.
  claims: {
    openid: ["sub"],
    profile: ["loginId"]
  },
  // Client의 cookie 이름 등을 custom 할 수 있는 설정.
  cookies: {
    names: {
      session: "_custom_auth_session",
      interaction: "_interaction",
      resume: "_interaction_resume"
    },
    long: {
      httpOnly: true,
      overwrite: true,
      sameSite: "none"
    },
    short: {
      httpOnly: true,
      overwrite: true,
      sameSite: "lax"
    },
    keys: []
  },
  // 인증과정 진행 시 routing 될 경로 지정.
  interactions: {
    url(ctx, interaction) {
      return `/interaction/${interaction.uid}`;
    }
  },
  // authCode 인증방식에서 code 교환시 pkce 검증과정을 추가할지 여부. false로 할 시 검증과정을 생략한다.
  // pkce가 무엇인지는 RFC7636 https://datatracker.ietf.org/doc/html/rfc7636 참조.
  pkce: {
    methods: ["S256"],
    required: true
  },
  // TimeToLive. 토큰의 유효 기간을 지정하는 설정. 아래는 기본값으로 필요하다면 늘려서 사용 가능하다.
  ttl: {
    AccessToken: function AccessTokenTTL(ctx, token, client) {
      if (token.resourceServer) {
        return token.resourceServer.accessTokenTTL || 60 * 60;
      }
      return 60 * 60;
    },
    AuthorizationCode: 600,
    ClientCredentials: function ClientCredentialsTTL(ctx, token, client) {
      if (token.resourceServer) {
        return token.resourceServer.accessTokenTTL || 10 * 60;
      }
      return 10 * 60;
    },
    Grant: 1209600,
    IdToken: 3600,
    Interaction: 3600,
    Session: 3600
  },
  // 추가적인 기능들. 각 설정들은 프로토콜상 지원하는 기능들 이다.
  features: {
    devInteractions: { enabled: false },
    encryption: { enabled: true },
    // 토큰 검증기능 on/off
    introspection: {
      enabled: true
    },
    // 동적 Client 생성 기능 ( client.js에 등록된 client이외에 추가로 동적으로 등록이 가능하도록 )
    registration: {
      enabled: true,
      // 허가되지 않은 사용자의 client 등록을 차단하기위한 secret key.
      initialAccessToken: "initial_secret"
    },
    // client 등록에 사용되는 인증 절차에 관한 설정
    registrationManagement: {
      enabled: true,
      rotateRegistrationAccessToken: false
    },
    // 발급한 토큰을 폐지하는 기능 on/off
    revocation: { enabled: true },
    // clientCredential 인증방식 허용 여부. 다른 인증방식에 비해 보안이 취약하기 때문에 별도 설정으로 활성화 시켜야한다.
    clientCredentials: { enabled: true }
  },
  // refreshToken을 발급 하는 case 지정.
  issueRefreshToken: async function issueRefreshToken(ctx, client, code) {
    // client 설정의 auth_type 에 refresh_token 값이 있으면~
    if (!client.grantTypeAllowed("refresh_token")) {
      return false;
    } else {
      return true;
    }
  },
  // accessToken에 필요한 값을 추가하는 기능
  extraAccessTokenClaims: async function extraAccessTokenClaims(ctx, token) {
    // 토큰이 clientCredentials 인증방식이고, 요청의 body에 "custom_token"이라는 필드가 있다면 access_token에 해당값 추가한 뒤 return.
    if (token.kind === "ClientCredentials" && ctx.req.body.custom_token) {
      return {
        custom_access_token: "custom_access_token_test"
      };
    }
  }
};

const app = express();

app.set("trust proxy", true);
app.set("view engine", "ejs");
app.set("views", path.resolve(__dirname, "views"));

app.use(cors());
app.use(helmet());
app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.json());
const parse = bodyParser.urlencoded({ extended: false });

const setNoCache = (req, res, next) => {
  res.set("Pragma", "no-cache");
  res.set("Cache-Control", "no-cache, no-store");
  next();
};

app.get("/interaction/:uid", setNoCache, async (req, res, next) => {
  console.log("[/interaction/:uid]");

  try {
    const details = await oidc.interactionDetails(req, res);
    console.log(
      "see what else is available to you for interaction views",
      details
    );
    const { uid, prompt, params, session } = details;

    const client = await oidc.Client.find(params.client_id);

    if (prompt.name === "select_account") {
      if (!session) {
        return provider.interactionFinished(
          req,
          res,
          { select_account: {} },
          { mergeWithLastSubmission: false }
        );
      }

      const account = await provider.Account.findAccount(
        { database: database },
        session.accountId
      );
      const { email } = await account.claims("prompt", "email");

      return res.render("select_account", {
        client,
        uid,
        email,
        details: prompt.details,
        params,
        title: "Sign-in",
        session: session,
        dbg: {
          params: params,
          prompt: prompt
        }
      });
    } else if (prompt.name === "login") {
      return res.render("login", {
        client,
        uid,
        details: prompt.details,
        params,
        title: "Sign-in",
        flash: undefined
      });
    }

    return res.render("interaction", {
      client,
      uid,
      details: prompt.details,
      params,
      title: "Authorize"
    });
  } catch (err) {
    return next(err);
  }
});

app.post(
  "/interaction/:uid/login",
  setNoCache,
  parse,
  async (req, res, next) => {
    console.log("[/interaction/:uid/login]");

    try {
      const { uid, prompt, params } = await oidc.interactionDetails(req, res);
      const client = await oidc.Client.find(params.client_id);

      const accountId = await checkAccount(req.body.loginId, req.body.password);

      if (!accountId) {
        res.render("login", {
          client,
          uid,
          details: prompt.details,
          params: {
            ...params,
            login_hint: req.body.loginId
          },
          title: "Sign-in",
          flash: "Invalid loginId or password."
        });
        return;
      }

      const result = {
        login: {
          account: accountId
        }
      };

      await oidc.interactionFinished(req, res, result, {
        mergeWithLastSubmission: false
      });
    } catch (err) {
      next(err);
    }
  }
);

app.post(
  "/interaction/:uid/confirm",
  setNoCache,
  parse,
  async (req, res, next) => {
    console.log("[/interaction/:uid/confirm]");

    try {
      const result = {
        consent: {}
      };
      await oidc.interactionFinished(req, res, result, {
        mergeWithLastSubmission: true
      });
    } catch (err) {
      next(err);
    }
  }
);

app.get("/interaction/:uid/abort", setNoCache, async (req, res, next) => {
  console.log("[/interaction/:uid/abort]");

  try {
    const result = {
      error: "access_denied",
      error_description: "End-User aborted interaction"
    };
    await oidc.interactionFinished(req, res, result, {
      mergeWithLastSubmission: false
    });
  } catch (err) {
    next(err);
  }
});

const oidc = new Provider(process.env.AUTH_URL, configs);
console.log(process.env.AUTH_URL);
app.use(oidc.callback);

app.listen(process.env.AUTH_PORT || 8888, () => {
  initAccount(process.env.DATABASE);

  console.log(`server is listening to ${process.env.AUTH_PORT || 8888} port`);
});
