const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const { createServer } = require("http");
const { Server } = require("socket.io");
const Document = require("./document");
const axios = require("axios");
require("dotenv").config();

const app = express();
app.use(cors());

const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173", // Vite uses 5173 by default
    methods: ["GET", "POST"],
  },
});

// Log API key availability
console.log("AI_API_KEY available:", !!process.env.AI_API_KEY);
console.log("Loaded AI_API_KEY:", process.env.AI_API_KEY ? "Present" : "Missing");

// Test route to check if server is running
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log("Connected to MongoDB"))
.catch(err => console.error("MongoDB connection error:", err));

const defaultValue = "";

// Function to get text correction suggestions
async function getAiSuggestion(text) {
  // For testing, if no API key is provided, return a mock suggestion.
  if (!process.env.AI_API_KEY) {
    console.warn("No API key provided, returning default suggestion");
    return "This is a default suggestion because no API key was provided.";
  }

  console.log("Getting AI suggestion for text:", text.substring(0, 50) + "...");
  
  try {
    const apiKey = process.env.AI_API_KEY;
    // Updated endpoint using the current Gemini Pro model (using gemini-1.5-pro-002)
    const endpoint = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-pro-002:generateContent?key=${apiKey}`;
    
    const requestBody = {
      contents: [
        {
          parts: [
            {
              text: `Correct all spelling and grammatical errors in the following text, but preserve the meaning and style completely. Return only the corrected text without explanations or comments:\n\n${text}`
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.1, // Lower temperature for more accurate corrections
        maxOutputTokens: 200,
        topP: 0.95,
        topK: 40
      }
    };
    
    console.log("Sending request to Gemini API endpoint...");
    
    const response = await axios.post(endpoint, requestBody, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 10000 // 10 seconds timeout
    });
    
    console.log("Received response from Gemini API");
    
    if (response.data && 
        response.data.candidates && 
        response.data.candidates[0] && 
        response.data.candidates[0].content && 
        response.data.candidates[0].content.parts && 
        response.data.candidates[0].content.parts[0] && 
        response.data.candidates[0].content.parts[0].text) {
      const suggestion = response.data.candidates[0].content.parts[0].text.trim();
      console.log("Extracted suggestion:", suggestion);
      return suggestion;
    } else {
      console.error("Unexpected API response structure:", JSON.stringify(response.data));
      throw new Error("Unexpected API response structure");
    }
  } catch (error) {
    console.error("Error calling Gemini API:", error.message);
    if (error.response) {
      console.error("API error details:", JSON.stringify(error.response.data));
    }
    
    // Try alternative model if the first one fails with a 404
    if (error.response && error.response.status === 404) {
      try {
        return await getAiSuggestionAlternative(text);
      } catch (altError) {
        console.error("Alternative API also failed:", altError.message);
        // For testing, return a default suggestion
        return "This is a fallback suggestion after alternative API failure.";
      }
    }
    
    // For any other error, return a fallback suggestion (for testing)
    return "This is a fallback suggestion due to an error calling the API.";
  }
}

// Alternative API endpoint for older Gemini versions
async function getAiSuggestionAlternative(text) {
  console.log("Trying alternative Gemini API endpoint...");
  
  try {
    const apiKey = process.env.AI_API_KEY;
    const endpoint = `https://generativelanguage.googleapis.com/v1/models/gemini-1.0-pro:generateContent?key=${apiKey}`;
    const requestBody = {
      contents: [
        {
          parts: [
            {
              text: `Correct all spelling and grammatical errors in the following text, but preserve the meaning and style completely. Return only the corrected text without explanations or comments:\n\n${text}`
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.1, // Lower temperature for more accurate corrections
        maxOutputTokens: 200,
        topP: 0.95,
        topK: 40
      }
    };
    
    const response = await axios.post(endpoint, requestBody, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
    
    if (response.data && 
        response.data.candidates && 
        response.data.candidates[0] && 
        response.data.candidates[0].content && 
        response.data.candidates[0].content.parts && 
        response.data.candidates[0].content.parts[0] && 
        response.data.candidates[0].content.parts[0].text) {
      return response.data.candidates[0].content.parts[0].text.trim();
    } else {
      throw new Error("Unexpected API response structure");
    }
  } catch (error) {
    console.error("Alternative API call failed:", error.message);
    throw error;
  }
}
//socket conncetion
io.on("connection", socket => {
  console.log("A user connected:", socket.id);

  socket.on("get-document", async (documentId) => {
    try {
      const document = await findOrCreateDocument(documentId);
      socket.join(documentId);
      socket.emit("load-document", document.data);

      socket.on("send-changes", (delta) => {
        socket.broadcast.to(documentId).emit("receive-changes", delta);
      });

      socket.on("save-document", async (data) => {
        await Document.findByIdAndUpdate(documentId, { data });
      });
    } catch (err) {
      console.error("Error handling document:", err);
      socket.emit("error", "Failed to load document");
    }
  });


  // Keep the original suggestion handler for backward compatibility
  socket.on("get-ai-suggestion", async (text, callback) => {
    console.log("Received AI suggestion request from client");
    try {
      const suggestion = await getAiSuggestion(text);
      console.log("Sending AI suggestion back to client");
      callback({ success: true, suggestion });
    } catch (err) {
      console.error("AI suggestion error:", err);
      callback({
        success: false,
        error: err.message || "Failed to get AI suggestion"
      });
    }
  });
});
//Document Helper
async function findOrCreateDocument(id) {
  if (id == null) return null;
  
  try {
    const document = await Document.findById(id);
    if (document) return document;
    
    return await Document.create({ _id: id, data: defaultValue });
  } catch (err) {
    console.error("Error finding/creating document:", err);
    throw err;
  }
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));