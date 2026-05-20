const dns = require("dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const { MongoClient, ServerApiVersion } = require("mongodb");

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;
const uri = process.env.MONGO_URI;


app.use(cors());
app.use(express.json());


const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});


let roomCollection;

async function connectDB() {
  try {
    // Connect the client to the server
    await client.connect();

    const database = client.db("study-nook-db");
    roomCollection = database.collection("rooms");

    // Ping confirmation
    await client.db("admin").command({ ping: 1 });
    console.log("Successfully connected to MongoDB!");
  } catch (error) {
    console.error("Failed to connect to MongoDB:", error);
    process.exit(1); 
  }
}


app.get("/", (req, res) => {
  res.send("Study Nook server is running smoothly!");
});


app.post("/rooms", async (req, res) => {
  try {
    const room = req.body;
    const result = await roomCollection.insertOne(room);
    res.status(201).send(result);
  } catch (error) {
    console.error("Error inserting room:", error);
    res.status(500).send({ error: "Failed to create room" });
  }
});

app.get("/rooms", async (req, res) => {
  const result = await roomCollection.find({}).toArray();
  res.send(result);

})

connectDB().then(() => {
  app.listen(port, () => {
    console.log(`Server is blasting off on port ${port}`);
  });
});