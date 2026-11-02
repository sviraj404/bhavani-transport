
require("dotenv").config();

const express = require("express");
const path = require("path");
const session = require("express-session");
const MongoStore = require("connect-mongo").default;
const bcrypt = require("bcryptjs");
const { MongoClient } = require("mongodb");
const { randomUUID } = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.set("trust proxy", 1);

const FLEET = {
  road: ["RD-01", "RD-02", "RD-03", "RD-04", "RD-05", "RD-06"],
  water: ["WT-01", "WT-02"]
};

let bookingsCollection;

function requireStaff(req, res, next) {
  if (!req.session.staff) {
    return res.status(401).json({ error: "Staff login required." });
  }
  next();
}

function used(mode, bookings) {
  return bookings.filter(
    b => b.mode === mode && b.status === "scheduled"
  ).length;
}

function getAvailableVehicle(mode, bookings) {
  const assigned = bookings
    .filter(b => b.mode === mode && b.status === "scheduled")
    .map(b => b.vehicle);

  return FLEET[mode].find(v => !assigned.includes(v)) || null;
}

function makeSuggestion({ cargo, weight, urgency, preferredMode }, bookings) {
  let mode;
  let reason;

  if (preferredMode !== "any") {
    mode = preferredMode;
    reason = `Customer preferred ${mode} transport.`;
  } else if (urgency === "Urgent" || cargo === "Perishables") {
    mode = "road";
    reason = "Road transport is suggested for urgent or perishable cargo.";
  } else if (weight >= 20 || cargo === "Bulk / heavy cargo") {
    mode = "water";
    reason = "Water transport is suggested for heavy cargo.";
  } else {
    mode = "road";
    reason = "Road transport is suitable for this shipment.";
  }

  const days = mode === "road"
    ? (urgency === "Urgent" ? 1 : 2)
    : (urgency === "Urgent" ? 4 : 6);

  const vehicle = getAvailableVehicle(mode, bookings);

  return {
    mode,
    days,
    vehicle,
    reason,
    available: Boolean(vehicle)
  };
}

async function startServer() {
  if (
    !process.env.MONGODB_URI ||
    !process.env.DB_NAME ||
    !process.env.SESSION_SECRET ||
    !process.env.STAFF_USERNAME ||
    !process.env.STAFF_PASSWORD_HASH
  ) {
    throw new Error("Please check that all required variables are set in .env");
  }

  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();

  const db = client.db(process.env.DB_NAME);
  bookingsCollection = db.collection("bookings");

  console.log("Connected to MongoDB successfully.");

  app.use(session({
    name: "bhavani.staff.sid",
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ client }),
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 8
    }
  }));

  app.get("/api/health", (req, res) => {
    res.json({ status: "Backend is running" });
  });

  // Staff login
  app.post("/api/auth/login", async (req, res) => {
    const { username, password } = req.body || {};

    if (
      username !== process.env.STAFF_USERNAME ||
      typeof password !== "string" ||
      !await bcrypt.compare(password, process.env.STAFF_PASSWORD_HASH)
    ) {
      return res.status(401).json({ error: "Invalid username or password." });
    }

    req.session.regenerate(err => {
      if (err) {
        return res.status(500).json({ error: "Could not start staff session." });
      }

      req.session.staff = { username };
      res.json({ message: "Staff login successful." });
    });
  });

  app.get("/api/auth/me", (req, res) => {
    if (!req.session.staff) {
      return res.status(401).json({ authenticated: false });
    }

    res.json({
      authenticated: true,
      username: req.session.staff.username
    });
  });

  app.post("/api/auth/logout", requireStaff, (req, res) => {
    req.session.destroy(err => {
      if (err) {
        return res.status(500).json({ error: "Could not log out." });
      }

      res.clearCookie("bhavani.staff.sid");
      res.json({ message: "Logged out successfully." });
    });
  });

  // Public scheduling suggestion
  app.post("/api/suggest", async (req, res) => {
    const { cargo, weight, urgency, preferredMode } = req.body || {};

    if (
      !cargo ||
      !["Urgent", "Normal"].includes(urgency) ||
      !Number.isFinite(Number(weight)) ||
      Number(weight) < 1 ||
      Number(weight) > 500 ||
      !["any", "road", "water"].includes(preferredMode)
    ) {
      return res.status(400).json({ error: "Please enter valid booking details." });
    }

    const bookings = await bookingsCollection.find({}).toArray();

    res.json(makeSuggestion({
      cargo,
      weight: Number(weight),
      urgency,
      preferredMode
    }, bookings));
  });

  // Public customer booking
  app.post("/api/bookings", async (req, res) => {
    const { cargo, weight, urgency, from, to, preferredMode } = req.body || {};

    if (
      !cargo ||
      !["Urgent", "Normal"].includes(urgency) ||
      !from?.trim() ||
      !to?.trim() ||
      from.trim().toLowerCase() === to.trim().toLowerCase() ||
      !Number.isFinite(Number(weight)) ||
      Number(weight) < 1 ||
      Number(weight) > 500 ||
      !["any", "road", "water"].includes(preferredMode)
    ) {
      return res.status(400).json({
        error: "Enter valid cargo, weight, pickup and drop details."
      });
    }

    const bookings = await bookingsCollection.find({}).toArray();

    const suggestion = makeSuggestion({
      cargo,
      weight: Number(weight),
      urgency,
      preferredMode
    }, bookings);

    if (!suggestion.available) {
      return res.status(409).json({
        error: "No vehicles are currently available for this transport mode."
      });
    }

    const booking = {
      id: "BT-" + randomUUID().slice(0, 8).toUpperCase(),
      cargo,
      weight: Number(weight),
      urgency,
      route: `${from.trim()} → ${to.trim()}`,
      mode: suggestion.mode,
      days: suggestion.days,
      vehicle: suggestion.vehicle,
      reason: suggestion.reason,
      status: "requested",
      createdAt: new Date().toISOString()
    };

    await bookingsCollection.insertOne(booking);

    res.status(201).json(booking);
  });

  // Staff-only dashboard data
  app.get("/api/dashboard", requireStaff, async (req, res) => {
    const bookings = await bookingsCollection
      .find({})
      .sort({ createdAt: -1 })
      .toArray();

    res.json({
      bookings,
      fleet: {
        road: {
          total: FLEET.road.length,
          available: FLEET.road.length - used("road", bookings)
        },
        water: {
          total: FLEET.water.length,
          available: FLEET.water.length - used("water", bookings)
        }
      }
    });
  });

  // Staff-only booking review
  app.patch("/api/bookings/:id", requireStaff, async (req, res) => {
    const { status } = req.body || {};

    if (!["scheduled", "rejected"].includes(status)) {
      return res.status(400).json({ error: "Invalid booking status." });
    }

    const booking = await bookingsCollection.findOne({ id: req.params.id });

    if (!booking) {
      return res.status(404).json({ error: "Booking not found." });
    }

    if (booking.status !== "requested") {
      return res.status(400).json({ error: "This booking has already been reviewed." });
    }

    if (status === "scheduled") {
      const bookings = await bookingsCollection.find({}).toArray();
      const vehicle = getAvailableVehicle(booking.mode, bookings);

      if (!vehicle) {
        return res.status(409).json({
          error: "No vehicles are currently available for this mode."
        });
      }

      booking.vehicle = vehicle;
    }

    await bookingsCollection.updateOne(
      { id: req.params.id, status: "requested" },
      {
        $set: {
          status,
          vehicle: booking.vehicle
        }
      }
    );

    res.json({ ...booking, status });
  });

  app.listen(PORT, () => {
    console.log(`Bhavani Transport running at http://localhost:${PORT}`);
  });
}

startServer().catch(error => {
  console.error("Server startup failed:", error.message);
  process.exit(1);
});
