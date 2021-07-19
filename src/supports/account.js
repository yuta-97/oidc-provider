import crypto from "crypto";
import DynamoDB from "../databases/dynamodb";
import MemoryDB from "../databases/memorydb";
import MongoDB from "../databases/mongodb";

var database = null;

// 설정에따라 사용할 DB 선택
const initAccount = target => {
  if (target === "dynamodb") {
    database = new DynamoDB();
  } else if (target === "mongodb") {
    database = new MongoDB();
  } else {
    database = new MemoryDB();
  }
};

const findAccount = async (ctx, id) => {
  console.log("findAccount: ", id);
  const item = await database.getUserById(id);
  if (!item) {
    return undefined;
  }

  // Token정보에 포함될 user 정보 return
  return {
    // accountId: id,
    // << Update Accesstoken's "sub" claim >>
    async claims(use, scope) {
      console.log("claims: ", use, scope);
      return {
        sub: id,
        loginId: item.loginId
      };
    }
  };
};

const checkAccount = async (loginId, password) => {
  try {
    console.log("authenticate: ", loginId, password);
    const item = await database.getUser(loginId);
    // Password 검증 부분. 각자 구현해야 할 부분.
    // DB에서 가져온 password와 전달받은 값의 hash값을 비교하는 logic
    // if (item) {
    //   const key = crypto
    //     .pbkdf2Sync(password, item.loginPasswordSalt, 1026, 64, "sha512")
    //     .toString("hex");
    //   if (key === item.loginPassword) {
    //     return item.id;
    //   }
    // }

    // passWord확인절차없이 바로 return
    if (item) {
      return item.id;
    }
    return undefined;
  } catch (err) {
    console.log(err);
    return undefined;
  }
};

export { initAccount, findAccount, checkAccount };
