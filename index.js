const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const admin = require('firebase-admin');

const app = express();
const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
  connectTimeoutMS: 10000,
  socketTimeoutMS: 10000,
});

// Firebase initialization
const decoded = Buffer.from(process.env.FIREBASE_SERVICE_KEY, 'base64').toString('utf8');
const serviceAccount = JSON.parse(decoded);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// Middleware
app.use(cors());
app.use(express.json());

// Firebase token verification middleware
const verifyFireBaseToken = async (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).send({ message: 'unauthorized access' });
  }
  const token = authorization.split(' ')[1];
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.token_email = decoded.email;
    next();
  } catch (error) {
    console.error('Token verification error:', error.message);
    return res.status(401).send({ message: 'unauthorized access' });
  }
};

// MongoDB connection helper
async function connectToMongo() {
  try {
    if (!client.topology || !client.topology.isConnected()) {
      await client.connect();
      console.log('Connected to MongoDB');
    }
    return client.db('smart_db');
  } catch (error) {
    console.error('MongoDB connection error:', error.message);
    throw error;
  }
}

// Routes
app.get('/', (req, res) => {
  res.send('Smart server is running');
});

// USERS APIs
app.post('/users', async (req, res) => {
  try {
    const db = await connectToMongo();
    const usersCollection = db.collection('users');
    const newUser = req.body;
    const email = req.body.email;
    if (!email) {
      return res.status(400).send({ message: 'Email is required' });
    }
    const query = { email };
    const existingUser = await usersCollection.findOne(query);
    if (existingUser) {
      return res.send({ message: 'user already exists. do not need to insert again' });
    }
    const result = await usersCollection.insertOne(newUser);
    res.send(result);
  } catch (error) {
    console.error('Error in /users:', error.message);
    res.status(500).send({ message: 'Internal server error' });
  }
});

// PRODUCTS APIs
app.get('/products', async (req, res) => {
  try {
    const db = await connectToMongo();
    const productsCollection = db.collection('products');
    const email = req.query.email;
    const query = email ? { email } : {};
    const cursor = productsCollection.find(query);
    const result = await cursor.toArray();
    res.send(result);
  } catch (error) {
    console.error('Error in /products:', error.message);
    res.status(500).send({ message: 'Internal server error' });
  }
});

app.get('/latest-products', async (req, res) => {
  try {
    const db = await connectToMongo();
    const productsCollection = db.collection('products');
    const cursor = productsCollection.find().sort({ created_at: -1 }).limit(6);
    const result = await cursor.toArray();
    res.send(result);
  } catch (error) {
    console.error('Error in /latest-products:', error.message);
    res.status(500).send({ message: 'Internal server error' });
  }
});

app.get('/products/:id', async (req, res) => {
  try {
    const id = req.params.id;
    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: 'Invalid product ID' });
    }
    const db = await connectToMongo();
    const productsCollection = db.collection('products');
    const query = { _id: new ObjectId(id) };
    const result = await productsCollection.findOne(query);
    res.send(result || { message: 'Product not found' });
  } catch (error) {
    console.error('Error in /products/:id:', error.message);
    res.status(500).send({ message: 'Internal server error' });
  }
});

app.post('/products', verifyFireBaseToken, async (req, res) => {
  try {
    const db = await connectToMongo();
    const productsCollection = db.collection('products');
    const newProduct = req.body;
    const result = await productsCollection.insertOne(newProduct);
    res.send(result);
  } catch (error) {
    console.error('Error in /products POST:', error.message);
    res.status(500).send({ message: 'Internal server error' });
  }
});

app.patch('/products/:id', async (req, res) => {
  try {
    const id = req.params.id;
    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: 'Invalid product ID' });
    }
    const db = await connectToMongo();
    const productsCollection = db.collection('products');
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
  } catch (error) {
    console.error('Error in /products/:id PATCH:', error.message);
    res.status(500).send({ message: 'Internal server error' });
  }
});

app.delete('/products/:id', async (req, res) => {
  try {
    const id = req.params.id;
    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: 'Invalid product ID' });
    }
    const db = await connectToMongo();
    const productsCollection = db.collection('products');
    const query = { _id: new ObjectId(id) };
    const result = await productsCollection.deleteOne(query);
    res.send(result);
  } catch (error) {
    console.error('Error in /products/:id DELETE:', error.message);
    res.status(500).send({ message: 'Internal server error' });
  }
});

// BIDS APIs
app.get('/bids', verifyFireBaseToken, async (req, res) => {
  try {
    const db = await connectToMongo();
    const bidsCollection = db.collection('bids');
    const email = req.query.email;
    const query = {};
    if (email) {
      query.buyer_email = email;
      if (email !== req.token_email) {
        return res.status(403).send({ message: 'forbidden access' });
      }
    }
    const cursor = bidsCollection.find(query);
    const result = await cursor.toArray();
    res.send(result);
  } catch (error) {
    console.error('Error in /bids:', error.message);
    res.status(500).send({ message: 'Internal server error' });
  }
});

app.get('/products/bids/:productId', async (req, res) => {
  try {
    const db = await connectToMongo();
    const bidsCollection = db.collection('bids');
    const productId = req.params.productId;
    const query = { product: productId };
    const cursor = bidsCollection.find(query).sort({ bid_price: -1 });
    const result = await cursor.toArray();
    res.send(result);
  } catch (error) {
    console.error('Error in /products/bids/:productId:', error.message);
    res.status(500).send({ message: 'Internal server error' });
  }
});

app.post('/bids', async (req, res) => {
  try {
    const db = await connectToMongo();
    const bidsCollection = db.collection('bids');
    const newBid = req.body;
    const result = await bidsCollection.insertOne(newBid);
    res.send(result);
  } catch (error) {
    console.error('Error in /bids POST:', error.message);
    res.status(500).send({ message: 'Internal server error' });
  }
});

app.delete('/bids/:id', async (req, res) => {
  try {
    const id = req.params.id;
    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: 'Invalid bid ID' });
    }
    const db = await connectToMongo();
    const bidsCollection = db.collection('bids');
    const query = { _id: new ObjectId(id) };
    const result = await bidsCollection.deleteOne(query);
    res.send(result);
  } catch (error) {
    console.error('Error in /bids/:id DELETE:', error.message);
    res.status(500).send({ message: 'Internal server error' });
  }
});

// Export for Vercel
module.exports = app;