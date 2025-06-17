const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();

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

async function run() {
  try {
    await client.connect();
    const database = client.db("volunteerDB");
    const postsCollection = database.collection("volunteerPosts");
    const volunteerRequestsCollection =
      database.collection("volunteerRequests");

    // 📌 Add Volunteer Post
    app.post("/posts", async (req, res) => {
      const postData = req.body;
      const result = await postsCollection.insertOne(postData);
      res.send(result);
    });

    // 📌 Get all posts (sorted by deadline ascending)
    app.get("/posts", async (req, res) => {
      const result = await postsCollection
        .find()
        .sort({ deadline: 1 }) // ascending order
        .toArray();
      res.send(result);
    });

    app.get("/posts/search", async (req, res) => {
      const searchTerm = req.query.title;
      const query = { title: { $regex: searchTerm, $options: "i" } };Add commentMore actions
      const result = await postsCollection.find(query).toArray();
      res.send(result);
    });

    // 📌 Get first 6 posts for home page
    app.get("/posts/home", async (req, res) => {
      const result = await postsCollection
        .find()
        .sort({ deadline: 1 })
        .limit(6)
        .toArray();
      res.send(result);
    });

    // 📌 Get single post by ID
    app.get("/posts/:id", async (req, res) => {
      const id = req.params.id;
      const post = await postsCollection.findOne({ _id: new ObjectId(id) });
      res.send(post);
    });

    app.post("/volunteer_requests", async (req, res) => {
      const requestData = req.body;
      const result = await volunteerRequestsCollection.insertOne(requestData);
      res.send(result);
    });

    app.get("/volunteer_requests", async (req, res) => {
      const email = req.query.email;
      const query = { volunteerEmail: email };
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

     app.get("/my-posts", async (req, res) => {
      const email = req.query.email;
      const result = await postsCollection
        .find({ organizerEmail: email })
        .toArray();
      res.send(result);
    });

    app.get("/my-volunteer-requests", async (req, res) => {
      const email = req.query.email;
      const result = await volunteerRequestsCollection
        .find({ volunteerEmail: email })
        .toArray();
      res.send(result);
    });

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

    app.delete("/my-posts/:id", async (req, res) => {
      const id = req.params.id;
      const result = await postsCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
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
