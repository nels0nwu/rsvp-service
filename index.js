require("dotenv").config();
const express = require("express");
const cors = require("cors");
const monk = require("monk");
const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const mongoUrl = process.env.MONGO_URL || "localhost:27017/helloworld";
const db = monk(mongoUrl);
db.then(() => {
  console.log("Connected correctly to server");
});
const messages = db.get("messages");

app.get("/", (req, res) => {
  res.json({
    message: "Hello world 😆 wouldn't you like to know mongo mongo",
    mongo: process.env.MONGO_URL,
  });
});

app.get("/messages", (req, res) => {
  messages.find().then((messages) => res.json(messages));
});

function isValidMessage(message) {
  return (
    message.name &&
    message.name.toString().trim() !== "" &&
    message.content &&
    message.content.toString().trim() !== ""
  );
}

app.post("/messages", (req, res) => {
  if (isValidMessage(req.body)) {
    const message = {
      name: req.body.name.toString(),
      content: req.body.content.toString(),
      created: new Date(),
    };
    console.log(req.body);
    messages.insert(message).then((createdMessage) => res.json(createdMessage));
  } else {
    res.status(422);
    res.json({
      message: "Name and content are required",
    });
  }
});

app.listen(port, () => {
  console.log(`Listening on http://localhost:${port}`);
  console.log(`Connecting to mongo db: ${mongoUrl}`);
});
