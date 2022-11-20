const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const port = process.env.PORT || 5000;
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json());

app.get('/', async (req, res) => {
    res.send("Doctors portal server is running");
})

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.hlzaati.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

/* API Naming Convention
    * app.get('/bookings')
    * app.get('/bookings/:id')
    * app.post('/bookings')
    * app.patch('/bookings/:id')
    * app.delete('/bookings/:id')
*/

const verifyJWT = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send("Unauthorized Access");
    }
    const token = authHeader.split(' ')[1];

    jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: 'Forbidden Access' });
        }
        req.decoded = decoded;
        next();
    })
}

async function run() {
    try {

        const appointmentOptionsCollection = client.db('doctorsPortal').collection('appointmentOptions');
        const bookingsCollection = client.db('doctorsPortal').collection('bookings');
        const usersCollection = client.db('doctorsPortal').collection('users');
        const doctorsCollection = client.db('doctorsPortal').collection('doctors');

        //NOTE: make sure you use verifyAdmin after verifyJWT
        const verifyAdmin = async (req, res, next) => {
            const decodedEmail = req.decoded.email;
            const query = { email: decodedEmail };
            const user = await usersCollection.findOne(query);
            if (user?.role !== 'admin') {
                return res.status(403).send({ message: 'Forbidden Access' });
            }
            next();
        }

        app.get('/appointmentOptions', async (req, res) => {
            const date = req.query.date;
            const query = {};
            const options = await appointmentOptionsCollection.find(query).toArray();

            //get the bookings of the provided date
            const bookingQuery = { appointmentDate: date };
            const alreadyBooked = await bookingsCollection.find(bookingQuery).toArray();

            //code carefully
            options.forEach(option => {
                const optionBooked = alreadyBooked.filter(book => book.treatment === option.name);
                const bookedSlots = optionBooked.map(book => book.slot);
                const remainingSlots = option.slots.filter(slot => !bookedSlots.includes(slot));
                option.slots = remainingSlots;
            })
            res.send(options);
        });

        //get data just treatment name
        app.get('/appointmentSpecialty', async (req, res) => {
            const query = {};
            const result = await appointmentOptionsCollection.find(query).project({ name: 1 }).toArray();
            res.send(result);
        })

        //get specific bookings for a user
        app.get('/bookings', verifyJWT, async (req, res) => {
            const email = req.query.email;
            const decodedEmail = req.decoded.email;

            if (email !== decodedEmail) {
                return res.status(403).send({ message: 'Forbidden Access' });
            }

            const query = { email: email };
            const bookings = await bookingsCollection.find(query).toArray();
            res.send(bookings);
        });

        app.post('/bookings', async (req, res) => {
            const booking = req.body;
            const query = {
                appointmentDate: booking.appointmentDate,
                email: booking.email,
                treatment: booking.treatment,
            }
            const alreadyBooked = await bookingsCollection.find(query).toArray();
            if (alreadyBooked.length) {
                const message = `You already have a booking on ${booking.appointmentDate}`;
                return res.send({ acknowledged: false, message });
            }

            const result = await bookingsCollection.insertOne(booking);
            res.send(result);
        });

        //JSON WEB TOKEN
        app.get('/jwt', async (req, res) => {
            const email = req.query.email;
            const query = { email: email };
            const user = await usersCollection.findOne(query);
            if (user) {
                const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, { expiresIn: '1h' });
                return res.send({ accessToken: token });
            }
            res.status(403).send({ accessToken: '' });
        });

        //users info get from db
        app.get('/users', async (req, res) => {
            const query = {};
            const user = await usersCollection.find(query).toArray();
            res.send(user);
        })

        //users info save in db
        app.post('/users', async (req, res) => {
            const user = req.body;
            const result = await usersCollection.insertOne(user);
            res.send(result);
        });

        //check the user if admin role
        app.get('/users/admin/:email', verifyJWT, async (req, res) => {

            const decodedEmail = req.decoded.email;
            // const email = req.params.email;
            const query = { email: decodedEmail };
            const user = await usersCollection.findOne(query);
            res.send({ isAdmin: user?.role === 'admin' });
        })

        //update users to admin
        app.put('/users/admin/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = ({ _id: ObjectId(id) });
            const options = { upsert: true };
            const updateDoc = {
                $set: {
                    role: 'admin',
                }
            }
            const result = await usersCollection.updateOne(filter, updateDoc, options);
            res.send(result);
        });

        //get doctor info in db
        app.get('/doctors', verifyJWT, verifyAdmin, async (req, res) => {
            const query = {};
            const doctors = await doctorsCollection.find(query).toArray();
            res.send(doctors);
        });

        //save doctor info in db
        app.post('/doctors', verifyJWT, verifyAdmin, async (req, res) => {
            const info = req.body;
            const result = await doctorsCollection.insertOne(info);
            res.send(result);
        });

        //delete doctor info in db
        app.delete('/doctors/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: ObjectId(id) };
            const result = await doctorsCollection.deleteOne(filter);
            res.send(result);
        })

    }
    finally {

    }
}
run().catch(console.dir);


app.listen(port, () => {
    console.log(`Doctors portal server is running on ${port}`);
})

