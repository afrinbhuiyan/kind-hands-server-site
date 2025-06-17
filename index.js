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

    app.post("/volunteer-requests", async (req, res) => {
      const request = req.body;

      if (!request.postId) {
        return res.status(400).send({ message: "postId is required." });
      }
      
      const postId = new ObjectId(request.postId);
      const post = await postsCollection.findOne({ _id: postId });

      if (!post) {
        return res.status(404).send({ message: "Post not found." });
      }

      if (post.volunteersNeeded <= 0) {
        return res.status(400).send({ message: "No volunteers needed." });
      }

      // Insert volunteer request
      const result = await volunteerRequestsCollection.insertOne(request);

      // Decrease volunteersNeeded by 1
      await postsCollection.updateOne(
        { _id: postId },
        { $inc: { volunteersNeeded: -1 } }
      );

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
