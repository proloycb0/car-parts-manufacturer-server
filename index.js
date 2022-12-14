const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const app = express();
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const nodemailer = require('nodemailer');
const mg = require('nodemailer-mailgun-transport');
// middleware of cors and express

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.o4ve3pa.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send({ message: 'unAuthorized Access' });
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: 'forbidden access' })
        }
        req.decoded = decoded;
        next();
    });
}

const auth = {
    auth: {
        api_key: process.env.EMAIL_SECRET_KEY,
        domain: 'sandbox0c0f7608b00742d3a99098faa0f8a01d.mailgun.org'
    }
}

const nodemailerMailgun = nodemailer.createTransport(mg(auth));

function sendOrderEmail(orders) {
    const { userEmail, userName, product, price, orderQuantity } = orders;
  
    var email = {
      from: process.env.EMAIL_SENDER,
      to: userEmail,
      subject: `Your Order for ${product} is on ${orderQuantity} quantity price- $ ${price} is Confirmed`,
      text: `Your Order for ${product} is on ${orderQuantity} quantity price- $ ${price} is Confirmed`,
      html: `
        <div>
          <p> Hello ${userName}, </p>
          <h3>Your Order for ${product} is confirmed</h3>
          <p>Looking forward to seeing your quantity ${orderQuantity} price ${price}.</p>
          
          <h3>Our Address</h3>
          <p>Andor Killa Bandorban</p>
          <p>Bangladesh</p>
          <a href="https://proloycb.netlify.app/">unsubscribe</a>
        </div>
      `
    };
  
    nodemailerMailgun.sendMail(email, (err, info) => {
        if (err) {
            console.log(`Error: ${err}`);
        }
        else {
            console.log(`Response: ${info}`);
        }
    });
  
  }
async function run() {
    try {
        await client.connect();

        const partsCollection = client.db('carnoCarUser').collection('parts');
        const ordersCollection = client.db('carnoCarUser').collection('orders');
        const usersCollection = client.db('carnoCarUser').collection('users');
        const paymentCollection = client.db('carnoCarUser').collection('payments');
        const reviewsCollection = client.db('carnoCarUser').collection('review');
        const blogsCollection = client.db('carnoCarUser').collection('blogs');

        const verifyAdmin = async (req, res, next) => {
            const requester = req.decoded.email;
            const requesterAccount = await usersCollection.findOne({ email: requester });
            if (requesterAccount.role === 'admin') {
                next();
            }
            else {
                res.status(403).send({ message: 'forbidden access' })
            }
        }

        // parts api
        app.get('/parts', async (req, res) => {
            const result = await partsCollection.find().toArray();
            const parts = result.reverse();
            res.send(parts);
        })

        app.get('/parts/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const part = await partsCollection.findOne(query);
            res.send(part);
        });

        app.post('/parts', verifyJWT, verifyAdmin, async (req, res) => {
            const product = req.body;
            const result = await partsCollection.insertOne(product);
            res.send(result);
        });

        app.delete('/parts/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: ObjectId(id) };
            const result = await partsCollection.deleteOne(filter);
            res.send(result);
        });

        // user api

        app.get('/user', verifyJWT, async (req, res) => {
            const email = req.query.email;
            const decodedEmail = req.decoded.email;
            if (email === decodedEmail) {
                const query = { email: email };
                const users = await usersCollection.find(query).toArray();
                res.send(users);
            }
            else {
                res.status(403).send({ message: 'forbidden access' })
            }
        });

        app.get('/users', verifyJWT, verifyAdmin, async (req, res) => {
            const result = await usersCollection.find().toArray();
            res.send(result);
        });

        app.get('/admin/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;
            const user = await usersCollection.findOne({ email: email });
            const isAdmin = user.role === 'admin';
            res.send({ admin: isAdmin });
        })

        app.put('/user/admin/:email', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const filter = { email: email };
            const updateDoc = {
                $set: { role: 'admin' },
            };
            const result = await usersCollection.updateOne(filter, updateDoc);
            res.send(result);
        })

        app.put('/user/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const filter = { email: email };
            const options = { upsert: true };
            const updateDoc = {
                $set: user,
            };
            const result = await usersCollection.updateOne(filter, updateDoc, options);
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1d' });
            res.send({ result, token });
        });

        app.put('/user/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;
            const users = req.body;
            const filter = { email: email };
            const options = { upsert: true }
            const updateDoc = {
                $set: users
            }
            const result = await usersCollection.updateOne(filter, updateDoc, options);
            res.send(result);
        });

        app.delete('/user/:email', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const filter = { email: email };
            const result = await usersCollection.deleteOne(filter);
            res.send(result);
        });

        // orders api

        app.get('/order', verifyJWT, async (req, res) => {
            const userEmail = req.query.userEmail;
            const decodedEmail = req.decoded.email;
            if (userEmail === decodedEmail) {
                const query = { userEmail: userEmail };
                const orders = await ordersCollection.find(query).toArray();
                res.send(orders);
            }
        });

        app.get('/orders', verifyJWT, verifyAdmin, async (req, res) => {
            const result = await ordersCollection.find().toArray();
            res.send(result);
        })

        app.get('/orders/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const order = await ordersCollection.findOne(query);
            res.send(order)
        })

        app.post('/orders', async (req, res) => {
            const orders = req.body;
            const result = await ordersCollection.insertOne(orders);
            sendOrderEmail(orders);
            res.send(result);
        });

        app.put('/orders/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const payment = req.body;
            const filter = { _id: ObjectId(id) };
            const options = { upsert: true };
            const updateDoc = {
                $set: {
                    paid: true,
                    transactionId: payment.transactionId,
                    status: payment.status
                }
            }
            const result = await paymentCollection.insertOne(payment);
            const updatedOrders = await ordersCollection.updateOne(filter, updateDoc, options);
            res.send(updateDoc);
        });

        app.put('/order/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const payment = req.body;
            const filter = { _id: ObjectId(id) };
            const options = { upsert: true };
            const updateDoc = {
                $set: payment
            }
            const updateOrders = await ordersCollection.updateOne(filter, updateDoc, options);
            res.send(updateOrders);
        })

        app.delete('/orders/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: ObjectId(id) };
            const result = await ordersCollection.deleteOne(filter);
            res.send(result);
        });

        // payment api

        app.post('/create-payment-intent', verifyJWT, async (req, res) => {
            const service = req.body;
            const price = service.price;
            const amount = price * 100;
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card']
            });
            res.send({ clientSecret: paymentIntent.client_secret })
        });

        // review api

        app.get('/review', async (req, res) => {
            const result = await reviewsCollection.find().toArray();
            const review = result.reverse();
            res.send(review);
        });

        app.post('/review', verifyJWT, async (req, res) => {
            const reviews = req.body;
            const result = await reviewsCollection.insertOne(reviews);
            res.send(result);
        });

        // blogs api 

        app.get('/blogs', async (req, res) => {
            const result = await blogsCollection.find().toArray();
            res.send(result);
        });
    }
    finally { }
}

run().catch(console.dir);
app.get('/', (req, res) => {
    res.send('Hello from manufacturer website')
});

app.listen(port, () => {
    console.log(`CarnoCar app listening on port ${port}`)
});
