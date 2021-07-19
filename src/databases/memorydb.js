const low = require("lowdb");
const Memory = require("lowdb/adapters/Memory");

class MemoryDB {
  constructor() {
    this.name = "memorydb";

    this.db = low(new Memory());

    // DB에 저장 될 기본 계정
    this.db
      .defaults({
        users: [
          {
            id: "23121d3c-84df-44ac-b458-3d63a9a05497",
            loginId: "test",
            loginPassword: "test"
          }
        ]
      })
      .write();
  }

  getUser(loginId) {
    return new Promise((resolve, reject) => {
      const item = this.db.get("users").find({ loginId: loginId }).value();

      resolve(item);
    });
  }

  getUserById(id) {
    return new Promise((resolve, reject) => {
      const item = this.db.get("users").find({ id: id }).value();

      resolve(item);
    });
  }
}

module.exports = MemoryDB;
