const { setServers } = require("node:dns");
setServers(["8.8.8.8", "8.8.4.4"]);

const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const { createRemoteJWKSet, jwtVerify } = require("jose-cjs");

app.use(cors());
app.use(express.json());

const uri = process.env.MONGODB_URI;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// DB & Collections
const db = client.db("Property-Rental");
const userCollection = db.collection("user");
const ownerCollection = db.collection("owner");
const clientCollection = db.collection("client");
const bookingCollection = db.collection("booking");
const favouriteCollection = db.collection("favourite");
const rejectFromAdminCollection = db.collection("reject");

// MongoDB connect
client
  .connect()
  .then(() => console.log("Connected to MongoDB!"))
  .catch(console.error);

// JWKS
const JWKS = createRemoteJWKSet(
  new URL(`${process.env.CLIENT_URL}/api/auth/jwks`),
);

// Middlewares
const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: "Unauthorized" });
  const token = authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ message: "Unauthorized" });
  try {
    const { payload } = await jwtVerify(token, JWKS);
    req.user = payload;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Unauthorized" });
  }
};

const verifyOwner = (req, res, next) => {
  if (req.user.role !== "owner")
    return res.status(401).json({ message: "Unauthorized" });
  next();
};

const verifyTanant = (req, res, next) => {
  if (req.user.role !== "tanant")
    return res.status(401).json({ message: "Unauthorized" });
  next();
};

const verifyAdmin = (req, res, next) => {
  if (req.user.role !== "admin")
    return res.status(401).json({ message: "Unauthorized" });
  next();
};

// ==================== ROUTES ====================

app.get("/", (req, res) => {
  res.send("Hello! I am backend");
});

// --- User ---
app.get("/api/user", verifyToken, async (req, res) => {
  const result = await userCollection.find().toArray();
  res.send(result);
});

app.patch("/api/updateuser/:id", async (req, res) => {
  const { id } = req.params;
  const query = { _id: new ObjectId(id) };
  const update = req.body;
  const result = await userCollection.updateOne(query, { $set: update });
  res.send(result);
});

app.delete("/api/deleteuser/:id", async (req, res) => {
  const { id } = req.params;
  const query = { _id: new ObjectId(id) };
  const result = await userCollection.deleteOne(query);
  res.send(result);
});

app.get("/api/owner", verifyToken, async (req, res) => {
  const query = {};
  if (req.query.role) query.role = req.query.role;
  const result = await userCollection.find(query).toArray();
  res.send(result);
});

// --- Owner Data ---
app.post("/api/ownerpost", verifyToken, async (req, res) => {
  const query = { ...req.body, createdAt: new Date() };
  const result = await ownerCollection.insertOne(query);
  res.send(result);
});

app.get("/api/owneralldata", async (req, res) => {
  const result = await ownerCollection.find().toArray();
  res.send(result);
});

app.get("/api/ownerlimidata", async (req, res) => {
  try {
    let query = {};
    if (req.query.search) {
      query = {
        $or: [
          { location: { $regex: req.query.search, $options: "i" } },
          { propertyType: { $regex: req.query.search, $options: "i" } },
        ],
      };
    }

    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 9;
    const skip = (page - 1) * limit;
    const sortBy = req.query.sortBy || "monthlyRent";
    const order = req.query.order || "desc";
    const sortOrder = order === "desc" ? -1 : 1;

    let result;
    if (sortBy === "monthlyRent") {
      result = await ownerCollection
        .aggregate([
          { $match: query },
          { $addFields: { rentNumber: { $toDouble: "$monthlyRent" } } },
          { $sort: { rentNumber: sortOrder } },
          { $skip: skip },
          { $limit: limit },
        ])
        .toArray();
    } else {
      result = await ownerCollection
        .find(query)
        .sort({ [sortBy]: sortOrder })
        .skip(skip)
        .limit(limit)
        .toArray();
    }

    const totalData = await ownerCollection.countDocuments(query);
    const totalPage = Math.ceil(totalData / limit);
    res.send({ data: result, page, totalPage });
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Something went wrong" });
  }
});

app.get("/api/ownerdata", async (req, res) => {
  const query = {};
  if (req.query.userId) query.userId = req.query.userId;
  const result = await ownerCollection.find(query).toArray();
  res.send(result);
});

app.delete("/api/ownerdata/:id", async (req, res) => {
  const { id } = req.params;
  const query = { _id: new ObjectId(id) };
  const result = await ownerCollection.deleteOne(query);
  res.send(result);
});

app.get("/api/ownerpost/:id", async (req, res) => {
  const { id } = req.params;
  const query = { _id: new ObjectId(id) };
  const result = await ownerCollection.findOne(query);
  res.send(result);
});

app.patch("/api/updateowner/:id", verifyToken, async (req, res) => {
  const { id } = req.params;
  const query = { _id: new ObjectId(id) };
  const update = req.body;
  const result = await ownerCollection.updateOne(query, { $set: update });
  res.send(result);
});

// --- Client Says ---
app.post("/api/clientsays", verifyToken, async (req, res) => {
  const corsor = req.body;
  const result = await clientCollection.insertOne(corsor);
  res.send(result);
});

app.get("/api/clientsays", async (req, res) => {
  const result = await clientCollection.find().toArray();
  res.send(result);
});

// --- Booking ---
app.post("/api/postbooking", verifyToken, async (req, res) => {
  const cursor = req.body;
  const isExistBooking = await bookingCollection.findOne({
    productId: cursor.productId,
    userEmail: cursor.userEmail,
  });
  if (isExistBooking) return res.send(isExistBooking);
  const result = await bookingCollection.insertOne(cursor);
  res.send(result);
});

app.get("/api/postbooking", verifyToken, async (req, res) => {
  const query = {};
  if (req.query.email) query.userEmail = req.query.email;
  if (req.query.ownerId) query.ownerId = req.query.ownerId;
  const result = await bookingCollection.find(query).toArray();
  res.send(result);
});

app.patch("/api/postbooking/:id", async (req, res) => {
  const { id } = req.params;
  const update = req.body;
  const result = await bookingCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: update },
  );
  res.send(result);
});

app.delete("/api/my/booking/:id", verifyToken, async (req, res) => {
  const { id } = req.params;
  const query = { _id: new ObjectId(id) };
  const result = await bookingCollection.deleteOne(query);
  res.send(result);
});

// --- Favourite ---
app.post("/api/favourite", verifyToken, async (req, res) => {
  const corsur = req.body;
  const result = await favouriteCollection.insertOne(corsur);
  res.send(result);
});

app.get("/api/favourite", verifyToken, async (req, res) => {
  const query = {};
  if (req.query.userId) query.userId = req.query.userId;
  const result = await favouriteCollection.find(query).toArray();
  res.send(result);
});

app.delete("/api/my/favourite/:id", verifyToken, async (req, res) => {
  const { id } = req.params;
  const query = { _id: new ObjectId(id) };
  const result = await favouriteCollection.deleteOne(query);
  res.send(result);
});

// --- Reject ---
app.post("/api/rejectowner", async (req, res) => {
  const corsur = req.body;
  const result = await rejectFromAdminCollection.insertOne(corsur);
  res.send(result);
});

app.get("/api/rejectowner", async (req, res) => {
  const title = req.query.title;
  const result = await rejectFromAdminCollection.findOne({ title });
  res.send(result);
});

// ==================== START ====================
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
