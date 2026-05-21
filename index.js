const dns = require("dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

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
let bookingsCollection;

async function connectDB() {
  try {
    await client.connect();

    const database = client.db("study-nook-db");
    roomCollection = database.collection("rooms");
    bookingsCollection = database.collection("bookings");

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

app.get("/rooms/:id", async (req, res) => {
  const { id } = req.params;
  const result = await roomCollection.findOne({ _id: new ObjectId(id) });
  res.json(result);
});

app.patch("/rooms/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, ...updateFields } = req.body;

    if (!userId) {
      return res
        .status(400)
        .json({ message: "User identity verification required." });
    }

    const room = await roomCollection.findOne({ _id: new ObjectId(id) });
    if (!room) {
      return res.status(404).json({ message: "Room resource not found." });
    }

    if (room.createdBy !== userId) {
      return res
        .status(403)
        .json({ message: "Access Denied: Unauthorized modification." });
    }

    const result = await roomCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updateFields },
    );

    res.json(result);
  } catch (error) {
    console.error("PATCH adjustment failed:", error);
    res
      .status(500)
      .json({ message: "Internal server error during structural update." });
  }
});

app.delete("/rooms/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res
        .status(400)
        .json({ message: "User identity verification required." });
    }

    const room = await roomCollection.findOne({ _id: new ObjectId(id) });
    if (!room) {
      return res.status(404).json({ message: "Room resource not found." });
    }

    if (room.createdBy !== userId) {
      return res
        .status(403)
        .json({ message: "Access Denied: Unauthorized removal request." });
    }

    const result = await roomCollection.deleteOne({ _id: new ObjectId(id) });
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error during deletion." });
  }
});

app.get("/rooms", async (req, res) => {
  const result = await roomCollection.find({}).toArray();
  res.send(result);
});

app.get("/latest-rooms", async (req, res) => {
  const latestRooms = await roomCollection
    .find()
    .sort({ _id: -1 })
    .limit(6)
    .toArray();
  res.send(latestRooms);
});

app.post("/bookings", async (req, res) => {
  try {
    const {
      roomId,
      roomName,
      userId,
      userEmail,
      date,
      startTime,
      endTime,
      seatsReserved,
      totalPaid,
    } = req.body;

    if (
      !roomId ||
      !userId ||
      !date ||
      !startTime ||
      !endTime ||
      !seatsReserved
    ) {
      return res
        .status(400)
        .json({ message: "Missing required booking specifications." });
    }

    const room = await roomCollection.findOne({ _id: new ObjectId(roomId) });
    if (!room) {
      return res
        .status(404)
        .json({ message: "Target workspace room resource not found." });
    }

    const requestedSeatsCount = Number(seatsReserved);
    const maxRoomCapacity = Number(room.capacity);

    if (requestedSeatsCount > maxRoomCapacity) {
      return res.status(400).json({
        message: `Reservation rejected. Requested ${requestedSeatsCount} seats, but room max capacity is ${maxRoomCapacity}.`,
      });
    }

    const activeOverlaps = await bookingsCollection
      .find({
        roomId: roomId,
        date: date,
        status: "confirmed",
        $or: [
          {
            startTime: { $lt: endTime },
            endTime: { $gt: startTime },
          },
        ],
      })
      .toArray();

    const totalSeatsCurrentlyTaken = activeOverlaps.reduce(
      (sum, booking) => sum + Number(booking.seatsReserved || 0),
      0,
    );

    const availableSeatsRemaining = maxRoomCapacity - totalSeatsCurrentlyTaken;

    if (requestedSeatsCount > availableSeatsRemaining) {
      return res.status(409).json({
        message: `Schedule collision: Only ${availableSeatsRemaining} out of ${maxRoomCapacity} seats are remaining for this specific time frame.`,
      });
    }

    const newBooking = {
      roomId,
      roomName,
      userId,
      userEmail,
      date,
      startTime,
      endTime,
      seatsReserved: requestedSeatsCount,
      totalPaid: Number(totalPaid),
      status: "confirmed",
      createdAt: new Date(),
    };

    const result = await bookingsCollection.insertOne(newBooking);
    res.status(201).json(result);
  } catch (error) {
    console.error("Booking structural execution failure:", error);
    res
      .status(500)
      .json({ message: "Internal server error processing reservation." });
  }
});

app.get("/bookings/user/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await bookingsCollection
      .find({ userId: userId })
      .sort({ date: 1, startTime: 1 })
      .toArray();
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed fetching user itineraries." });
  }
});

app.patch("/bookings/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, date, startTime, endTime } = req.body;

    const currentBooking = await bookingsCollection.findOne({
      _id: new ObjectId(id),
    });
    if (!currentBooking) {
      return res.status(404).json({ message: "Booking record not found." });
    }

    if (currentBooking.userId !== userId) {
      return res
        .status(403)
        .json({ message: "Unauthorized adjustment request." });
    }

    const room = await roomCollection.findOne({
      _id: new ObjectId(currentBooking.roomId),
    });
    if (!room) {
      return res
        .status(404)
        .json({ message: "Associated workspace room resource missing." });
    }

    const maxRoomCapacity = Number(room.capacity);
    const dynamicSeatsRequested = Number(currentBooking.seatsReserved);

    const activeOverlaps = await bookingsCollection
      .find({
        _id: { $ne: new ObjectId(id) },
        roomId: currentBooking.roomId,
        date: date,
        status: "confirmed",
        $or: [
          {
            startTime: { $lt: endTime },
            endTime: { $gt: startTime },
          },
        ],
      })
      .toArray();

    const totalSeatsCurrentlyTaken = activeOverlaps.reduce(
      (sum, b) => sum + Number(b.seatsReserved || 0),
      0,
    );

    const availableSeatsRemaining = maxRoomCapacity - totalSeatsCurrentlyTaken;

    if (dynamicSeatsRequested > availableSeatsRemaining) {
      return res.status(409).json({
        message: `Reschedule failed: The requested time window only has ${availableSeatsRemaining} open seats available.`,
      });
    }

    const result = await bookingsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { date, startTime, endTime } },
    );

    res.json(result);
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ message: "Internal server error updating booking." });
  }
});

app.delete("/bookings/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;

    const booking = await bookingsCollection.findOne({ _id: new ObjectId(id) });
    if (!booking) {
      return res.status(404).json({ message: "Booking record not found." });
    }

    if (booking.userId !== userId) {
      return res
        .status(403)
        .json({ message: "Unauthorized cancellation request." });
    }

    const result = await bookingsCollection.deleteOne({
      _id: new ObjectId(id),
    });
    res.json(result);
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ message: "Internal server error deleting booking." });
  }
});

connectDB().then(() => {
  app.listen(port, () => {
    console.log(`Server is blasting off on port ${port}`);
  });
});
