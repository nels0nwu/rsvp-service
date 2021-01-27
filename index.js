require("dotenv").config();
const express = require("express");
const cors = require("cors");
const monk = require("monk");
const csv = require("csv-parser");
const fs = require("fs");
const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const mongoUrl = process.env.MONGO_URL || "localhost:27017/rsvp";
const db = monk(mongoUrl);
db.then(() => {
  console.log("Connected correctly to server");
});

const rsvp = db.get("rsvp");
rsvp.createIndex("group_id", { unique: true });
rsvp.createIndex({ group_id: 1, "guests.id": 1 }, { unique: true });

// index for searchable guest names. Case-insensitive collation allows for case-insensitive search
rsvp.createIndex("guests.name", {
  collation: { locale: "en", strength: 2 },
});

rsvp
  .update({}, { $set: { "guests.$[].infile": false } }, { multi: true })
  .then(() => {
    // Add guests
    const getlistFilename = "guests.csv";
    fs.createReadStream(getlistFilename)
      .on("error", function (err) {
        console.log(`Could not find csv ${getlistFilename}`);
      })
      .pipe(csv())
      .on("data", (row) => {
        // Try updating existing records
        rsvp
          .update(
            {
              group_id: parseInt(row.GuestGroup),
              "guests.id": parseInt(row.GuestId),
            },
            {
              $set: {
                "guests.$.name": row.GuestName,
                "guests.$.infile": true,
              },
            }
          )
          .then((result) => {
            if (result.n === 0) {
              // No update. New guest to add!
              console.log(`New guest: ${row.GuestName}`);
              rsvp.update(
                {
                  group_id: parseInt(row.GuestGroup),
                },
                {
                  $push: {
                    guests: {
                      id: parseInt(row.GuestId),
                      name: row.GuestName,
                      infile: true,
                    },
                  },
                },
                { upsert: true }
              );
            }
          });
      })
      .on("end", function () {
        rsvp
          .update(
            // Remove records from database that don't exist in the text file
            {},
            {
              $pull: { guests: { infile: false } },
            },
            { multi: true }
          )
          .then((result) => {
            if (result.nModified > 0) {
              console.log(`Removed guests`);
            }
          })
          .then(() => {
            // Delete empty groups
            rsvp.remove({ guests: { $exists: true, $size: 0 } });
          })
          .then(() => {
            // Delete infile field
            rsvp.update(
              {},
              { $unset: { "guests.$[].infile": "" } },
              { multi: true }
            );
          });
      });
  });

app.get("/", (req, res) => {
  res.json({
    message: "Hello world 😁😁",
  });
});

// Search for a group by guest name, eg. /findguests?name=nelson%20wu
app.get("/findguests", (req, res) => {
  if (!req.query.name) {
    res.status(400).send("Name parameter required");
    return;
  }

  rsvp
    .findOne(
      { "guests.name": req.query.name },
      { collation: { locale: "en", strength: 2 } }
    )
    .then((group) => res.json(group));
});

// submit rsvp
app.post("/submitrsvp", (req, res) => {
  rsvp
    .update(
      {
        group_id: parseInt(req.body.GroupId),
      },
      {
        $set: {
          message: req.body.Message,
        },
      }
    )
    .then(() => {
      req.body.GuestRsvps.forEach((guest) => {
        rsvp.update(
          {
            group_id: parseInt(req.body.GroupId),
            "guests.id": parseInt(guest.Id),
          },
          {
            $set: {
              "guests.$.attending": !!guest.Attending,
            },
          }
        );
      });
    });
});

app.listen(port, () => {
  console.log(`Listening on http://localhost:${port}`);
  console.log(`Connecting to mongo db: ${mongoUrl}`);
});
