require("dotenv").config(); // <-- Add this line at the very top
const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();
const port = process.env.PORT || 3000;

const admin = require("firebase-admin");

const serviceAccount = require("./smart-deals-firebase-admin-key.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});


//middleware
app.use(cors());
app.use(express.json());

const verifyFireBaseToken = async (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).send({ message: 'unauthorized access' })
  }
  const token = authorization.split(' ')[1];

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    console.log('inside token', decoded)
    req.token_email = decoded.email;
    next();
  }
  catch (error) {
    return res.status(401).send({ message: 'unauthorized access' })
  }
}

const uri = process.env.MONGODB_URI;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

app.get("/", (req, res) => {
  res.send("smart server is running");
});

async function run() {
  try {
    await client.connect();

    const db = client.db("smart_db");
    const productsCollection = db.collection("products");
    const bidsCollection = db.collection("bids");
    const usersCollection = db.collection("users");

    // user create API
    app.post("/users", async (req, res) => {
      const newUser = req.body;

      const email = req.body.email;
      const query = { email: email };
      const existingUser = await usersCollection.findOne(query);
      if (existingUser) {
        res.send({ message: "user already exist, do not need to add" });
      } else {
        const result = await usersCollection.insertOne(newUser);
        res.send(result);
      }
    });

    // product realted api
    // get api all
    app.get("/products", async (req, res) => {
      // const projectFields = {title:1, price_min:1, price_max: 1, image:1};
      // const cursor = productsCollection.find().sort({ price_min: 1 }).skip(2).limit(2).project(projectFields);
      //
      console.log(req.query);
      const email = req.query.email;
      const query = {};
      if (email) {
        query.email = email;
      }

      const cursor = productsCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    // product latest get API
    app.get("/latest-products", async (req, res) => {
      const cursor = productsCollection
        .find()
        .sort({ created_at: -1 })
        .limit(6);
      const result = await cursor.toArray();
      res.send(result);
    });

    // get api single
    app.get("/products/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await productsCollection.findOne(query);
      console.log(result);

      res.send(result);
    });

    // post api
    app.post("/products", verifyFireBaseToken, async (req, res) => {
      console.log('headers in the post', req.headers);
      const newProduct = req.body;
      const result = await productsCollection.insertOne(newProduct);
      res.send(result);
    });

    // patch api
    app.patch("/products/:id", async (req, res) => {
      const id = req.params.id;
      const updatedProduct = req.body;
      const query = { _id: new ObjectId(id) };
      const update = {
        $set: {
          name: updatedProduct.name,
          price: updatedProduct.price,
        },
      };

      const result = await productsCollection.updateOne(query, update);
      res.send(result);
    });

    // delete api
    app.delete("/products/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await productsCollection.deleteOne(query);
      res.send(result);
    });

    //bids related API
    // bids by email
    // app.get("/bids", verifyFireBaseToken, async (req, res) => {
      //   const email = req.query.email;
      //   const query = {};
    //    if (email) {
    //     query.buyer_email = email;
    //     if (email !== req.token.email) {
    //       return res.status(403).send({ message: 'forbidden access' })
    //     }
    //   }
    //   const cursor = bidsCollection.find(query);
    //   const result = await cursor.toArray();
    //   res.send(result);
    // });

    // bids related apis
    app.get('/bids', verifyFireBaseToken, async (req, res) => {
      const email = req.query.email;
      const query = {};
      if (email) {
        query.buyer_email = email;
        if (email !== req.token_email) {
          return res.status(403).send({ message: 'forbidden access' })
        }
      }

      const cursor = bidsCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    })



    // bid by products by id
    app.get("/products/bids/:productId", async (req, res) => {
      const productId = req.params.productId;
      const query = { product: productId };
      console.log(productId, query);

      const cursor = bidsCollection.find(query).sort({ bid_price: -1 });
      const result = await cursor.toArray();
      res.send(result);
    });

    //bid my account
    // app.get('/bids', async (req, res) => {

    //   const query = {};
    //   if (query.email) {
    //     query.buyer_email = email
    //   }
    //   const cursor = bidsCollection.find(query);
    //   const result = await cursor.toArray();
    //   res.send(result)
    // })

    // bid post API
    app.post("/bids", async (req, res) => {
      const newBid = req.body;
      const result = await bidsCollection.insertOne(newBid);
      res.send(result);
    });

    // bid delete api
    app.delete("/bids/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await bidsCollection.deleteOne(query);
      res.send(result);
    });

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } finally {
  }
}

run().catch(console.dir);

app.listen(port, () => {
  console.log(`smart server is running on port: ${port}`);
});

// client.connect()
//   .then(() => {
//        app.listen(port, () => {
//       console.log(`smart server is running now on port: , ${port}`);

//     })
//   })
// .catch(console.dir)
