const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();

const admin = require("firebase-admin");
const decoded = Buffer.from(process.env.FB_SERVICE_KEY, "base64").toString(
  "utf8"
);
const serviceAccount = JSON.parse(decoded);

const app = express();
const port = process.env.PORT || 5000;

// Middlewares
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.cb9e028.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const verifyFirebaseToken = async (req, res, next) => {
  const authHeader = req.headers?.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).send({ message: "Unauthorized" });
  }
  const token = authHeader.split(" ")[1];

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.decoded = decoded;
    next();
  } catch (error) {
    res.status(401).send({ error: "Invalid Firebase token" });
  }
};

const verifyTokenEmail = (req, res, next) => {
  if (req.query.email !== req.decoded.email) {
    return res.status(403).massage({ message: "Forbidden Access" });
  }
  next();
};

async function run() {
  try {
    // await client.connect();

    const database = client.db("volunteerDB");
    const postsCollection = database.collection("volunteerPosts");
    const volunteerRequestsCollection =
      database.collection("volunteerRequests");

    app.post("/posts", async (req, res) => {
      const postData = req.body;
      const result = await postsCollection.insertOne(postData);
      res.send(result);
    });

    app.get("/posts", async (req, res) => {
      const result = await postsCollection.find().toArray();
      res.send(result);
    });

    app.get("/posts/search", async (req, res) => {
      const searchTerm = req.query.title;
      const query = { title: { $regex: searchTerm, $options: "i" } };
      const result = await postsCollection.find(query).toArray();
      res.send(result);
    });

    app.get("/posts/home", async (req, res) => {
      const result = await postsCollection
        .find()
        .sort({ deadline: 1 })
        .limit(6)
        .toArray();
      res.send(result);
    });

    app.get("/posts/:id", async (req, res) => {
      const id = req.params.id;
      const post = await postsCollection.findOne({ _id: new ObjectId(id) });
      res.send(post);
    });

    app.post(
      "/volunteer_requests",
      verifyFirebaseToken,
      verifyTokenEmail,
      async (req, res) => {
        const requestData = req.body;
        const result = await volunteerRequestsCollection.insertOne(requestData);
        res.send(result);
      }
    );

    app.get("/volunteer_requests", async (req, res) => {
      const email = req.query.email;

      const query = {
        volunteerEmail: email,
      };

      const result = await volunteerRequestsCollection.find(query).toArray();

      for (const volunteer_requests of result) {
        const requestId = volunteer_requests.postId;
        const requestQuery = { _id: new ObjectId(requestId) };
        const request = await postsCollection.findOne(requestQuery);
        volunteer_requests.title = request.title;
        volunteer_requests.category = request.category;
        volunteer_requests.deadline = request.deadline;
      }

      res.send(result);
    });

    app.patch("/posts/:id/decrement-volunteers", async (req, res) => {
      const id = req.params.id;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({ error: "Invalid post ID" });
      }

      const post = await postsCollection.findOne({ _id: new ObjectId(id) });

      let volunteersNeeded = post.volunteersNeeded;
      if (typeof volunteersNeeded === "string") {
        volunteersNeeded = parseInt(volunteersNeeded, 10);
      }

      const result = await postsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { volunteersNeeded: volunteersNeeded - 1 } }
      );

      if (result.modifiedCount === 0) {
        return res
          .status(404)
          .json({ error: "Post not found or no change made" });
      }

      res.json(result);
    });

    app.get(
      "/my-posts",
      verifyFirebaseToken,
      verifyTokenEmail,
      async (req, res) => {
        const email = req.query.email;
        const result = await postsCollection
          .find({ organizerEmail: email })
          .toArray();
        res.send(result);
      }
    );

    app.put("/my-posts/:id", verifyFirebaseToken, async (req, res) => {
      const id = req.params.id;
      const updatedTask = req.body;

      const post = await postsCollection.findOne({ _id: new ObjectId(id) });

      if (!post) {
        return res.status(404).send({ message: "Post not found" });
      }

      if (post.organizerEmail !== req.decoded.email) {
        return res
          .status(403)
          .send({ message: "Forbidden: You are not the organizer" });
      }

      const result = await postsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updatedTask }
      );

      res.send(result);
    });

    app.delete("/my-posts/:id", verifyFirebaseToken, async (req, res) => {
      const id = req.params.id;
      const post = await postsCollection.findOne({ _id: new ObjectId(id) });

      if (!post) {
        return res.status(404).send({ message: "Post not found" });
      }

      if (post.organizerEmail !== req.decoded.email) {
        return res
          .status(403)
          .send({ message: "Forbidden: You are not the organizer" });
      }

      const result = await postsCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    app.get(
      "/my-volunteer-requests",
      verifyFirebaseToken,
      verifyTokenEmail,
      async (req, res) => {
        const email = req.query.email;
        const result = await volunteerRequestsCollection
          .find({ volunteerEmail: email })
          .toArray();
        res.send(result);
      }
    );

    // Delete a volunteer request
    app.delete(
      "/volunteer-requests/:id",
      verifyFirebaseToken,
      async (req, res) => {
        const id = req.params.id;

        const request = await volunteerRequestsCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!request) {
          return res.status(404).send({ message: "Request not found" });
        }

        if (request.volunteerEmail !== req.decoded.email) {
          return res.status(403).send({
            message: "Forbidden: You can only delete your own request",
          });
        }

        const result = await volunteerRequestsCollection.deleteOne({
          _id: new ObjectId(id),
        });
        res.send(result);
      }
    );

    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );
  } finally {
    // await client.close();
  }
}
run().catch(console.dir);

// Root Route
app.get("/", (req, res) => {
  res.send("Volunteer Post Server is running");
});

// Start Server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
