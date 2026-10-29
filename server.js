```js
// backend/server.js
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const supabase = require("./supabase");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "20kb" }));

// Health check
app.get("/", (req, res) => {
  res.json({ message: "Hostel Complaint Portal API is running" });
});

// Get all complaints
app.get("/api/complaints", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("complaints")
      .select(
        "id, student_name, room_number, title, category, description, status, created_at"
      )
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Supabase fetch error:", error.message);
      return res.status(500).json({
        message: "Unable to fetch complaints",
      });
    }

    return res.json(data);
  } catch (error) {
    console.error("Server error:", error.message);
    return res.status(500).json({
      message: "Internal server error",
    });
  }
});

// Submit a new complaint
app.post("/api/complaints", async (req, res) => {
  try {
    const {
      student_name,
      room_number,
      title,
      category,
      description,
    } = req.body || {};

    // Validate required fields
    const fields = {
      student_name,
      room_number,
      title,
      category,
      description,
    };

    for (const [field, value] of Object.entries(fields)) {
      if (typeof value !== "string" || !value.trim()) {
        return res.status(400).json({
          message: `${field} is required and must be text`,
        });
      }
    }

    // Limit input lengths
    const limits = {
      student_name: 100,
      room_number: 30,
      title: 150,
      category: 60,
      description: 3000,
    };

    for (const [field, maxLength] of Object.entries(limits)) {
      if (fields[field].trim().length > maxLength) {
        return res.status(400).json({
          message: `${field} must be ${maxLength} characters or fewer`,
        });
      }
    }

    const complaint = {
      student_name: student_name.trim(),
      room_number: room_number.trim(),
      title: title.trim(),
      category: category.trim(),
      description: description.trim(),
      status: "Pending",
    };

    const { data, error } = await supabase
      .from("complaints")
      .insert([complaint])
      .select(
        "id, student_name, room_number, title, category, description, status, created_at"
      )
      .single();

    if (error) {
      console.error("Supabase insert error:", error.message);
      return res.status(500).json({
        message: "Unable to submit complaint",
      });
    }

    return res.status(201).json({
      message: "Complaint submitted successfully",
      complaint: data,
    });
  } catch (error) {
    console.error("Server error:", error.message);
    return res.status(500).json({
      message: "Internal server error",
    });
  }
});

// Handle invalid JSON
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && "body" in err) {
    return res.status(400).json({ message: "Invalid JSON request body" });
  }

  console.error("Unhandled error:", err.message);
  return res.status(500).json({ message: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`Hostel Complaint Portal API running at http://localhost:${PORT}`);
});
```