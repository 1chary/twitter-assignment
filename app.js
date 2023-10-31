const express = require("express");
const bcrypt = require("bcrypt");
const app = express();
const path = require("path");

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const jwt = require("jsonwebtoken");

const db = path.join(__dirname, "twitterClone.db");
app.use(express.json());
let database = null;

// initialize the function:
const initializeTheFunction = async () => {
  try {
    database = await open({
      filename: db,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("server running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`${e.message}`);
    process.exit(1);
  }
};

initializeTheFunction();

// middleware function:
const authenticateToken = (request, response, next) => {
  let jwtToken;
  let authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken !== undefined) {
    jwt.verify(jwtToken, "myToken", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        request.userId = payload.userId;
        next();
      }
    });
  } else {
    response.status(401);
    response.send("Invalid JWT Token");
  }
};

// CONNECTING USER_ID
const getFollowingPeopleId = async (username) => {
  const getId = `
    SELECT 
    following_user_id FROM follower
    follower INNER JOIN user on follower.follower_user_id = user.user_id
    `;
  const getDetails = await database.all(getId);
  const ids = getDetails.map((eachUser) => eachUser.following_user_id);
  return ids;
};

//tweetVerification
const tweetVerification = async (request, response, next) => {
  const { userId } = request.body;
  const { tweetId } = request.params;
  const getQueries = `
    SELECT *
    FROM tweet INNER JOIN follower ON tweet.user_id = follower.user_id
    WHERE tweet.user_id = ${tweetId} AND follower.user_id = ${userId}
    `;
  const verify = await database.get(getQueries);
  if (verify === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    next();
  }
};

// API - 1:
app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const getUserName = `
  SELECT *
  FROM user
  WHERE username = '${username}'
  `;
  const checkUserName = await database.get(getUserName);

  // <.............SCENARIO-1.............>

  if (checkUserName !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else {
    // <.............SCENARIO-2.............>
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    }
    // <.............SCENARIO-3.............>
    else {
      const hashPassword = await bcrypt.hash(request.body.password, 10);
      const createNewUser = `
        INSERT INTO user(username , password, name, gender)
        VALUES ('${username}' , '${hashPassword}', '${name}', '${gender}')
        `;
      await database.run(createNewUser);
      response.send("User created successfully");
    }
  }
});

// API-2
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const getUserDetails = `
    SELECT *
    FROM user
    WHERE username = '${username}'
    `;
  const userDetails = await database.get(getUserDetails);
  console.log(userDetails);
  if (userDetails !== undefined) {
    const isMatched = await bcrypt.compare(password, userDetails.password);
    if (isMatched === true) {
      const payload = { username, userId: userDetails.user_id };
      const jwtToken = jwt.sign(payload, "myToken");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  } else {
    response.status(400);
    response.send("Invalid user");
  }
});

// API-3:
app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const { username } = request.body;
  const getIds = await getFollowingPeopleId(username);
  const getDetails = `
  SELECT 
    username,tweet,date_time as dateTime
    FROM user INNER JOIN tweet ON user.user_id = tweet.user_id
    WHERE 
        user.user_id IN (${getIds})
        ORDER BY date_time DESC;
        LIMIT 4
  `;
  const outcome = await database.all(getDetails);
  response.send(outcome);
});

// API-4:
app.get("/user/following/", authenticateToken, async (request, response) => {
  const { username, userId } = request.body;
  const getNames = `
  SELECT name FROM follower 
  follower INNER JOIN user on user.user_id = follower.user_id
  WHERE follower_user_id = ${userId}
  `;
  const names = await database.all(getNames);
  response.send(names);
});

// API-5
app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { username, userId } = request.body;
  const getFollowingNames = `
    SELECT DISTINCT name FROM follower
    follower INNER JOIN user on user.user_id = follower.user_id
    WHERE following_user_id = ${userId}
    `;
  const followers = await database.all(getFollowingNames);
  response.send(followers);
});

// API-6
app.get(
  "/tweets/:tweetId/",
  authenticateToken,
  tweetVerification,
  async (request, response) => {
    const { username, userId } = request.body;
    const { tweetId } = request.params;
    const getTweets = `
    SELECT tweet,
    (SELECT COUNT() FROM like WHERE tweet_id = ${tweetId}) as likes,
    (SELECT COUNT() FROM reply WHERE tweet_id = ${tweetId}) as replies,
    date_time as dateTime
    FROM tweet 
    WHERE tweet_id = ${tweetId}
    `;
    const replies = await database.get(getTweets);
    response.send(replies);
  }
);

// API -7

app.get(
  "/tweets/:tweetId/",
  authenticateToken,
  tweetVerification,
  async (request, response) => {
    const { tweetId } = request.params;
    const getLikes = `
      SELECT username
      FROM user INNER JOIN like ON user.user_id = like.user_id
      WHERE tweet_id = ${tweetId}
      `;
    const likes = await database.all(getLikes);
    const array = likes.map((eachOther) => eachOther.username);
    response.send({ likes: array });
  }
);

// API-8
app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  tweetVerification,
  async (request, response) => {
    const { tweetId } = request.params;
    const getReplies = `
      SELECT name,reply
      FROM user INNER JOIN reply ON user.user_id = reply.user_id
      WHERE tweet_id = ${tweetId}
      `;
    const replies = await database.all(getReplies);
    response.send({ replies: replies });
  }
);

module.exports = app;
