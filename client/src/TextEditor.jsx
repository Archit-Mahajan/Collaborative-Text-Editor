import { useCallback, useEffect, useState } from "react";
import Quill from "quill";
import "quill/dist/quill.snow.css";
import { io } from "socket.io-client";
import { useParams } from "react-router-dom";

const SAVE_INTERVAL_MS = 2000;
const TOOLBAR_OPTIONS = [
  [{ header: [1, 2, 3, 4, 5, 6, false] }],
  [{ font: [] }],
  [{ list: "ordered" }, { list: "bullet" }],
  ["bold", "italic", "underline"],
  [{ color: [] }, { background: [] }],
  [{ script: "sub" }, { script: "super" }],
  [{ align: [] }],
  ["image", "blockquote", "code-block"],
  ["clean"],
];

export default function TextEditor() {
  const { id: documentId } = useParams();
  const [socket, setSocket] = useState(null);
  const [quill, setQuill] = useState(null);
  const [aiSuggestion, setAiSuggestion] = useState("");
  const [isShowingSuggestion, setIsShowingSuggestion] = useState(false);
  const [suggestionPosition, setSuggestionPosition] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);

  // Setup socket connection
  useEffect(() => {
    const s = io("http://localhost:3001", { 
      transports: ["websocket", "polling"], // Add polling as fallback
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 10000 // Add explicit timeout
    });

    s.on("connect", () => {
      console.log("Connected to server");
      setError(null); // Clear any existing errors on successful connection
    });

    s.on("connect_error", (err) => {
      console.error("Connection error:", err);
      setError("Failed to connect to server. Please check if the server is running at http://localhost:3001");
    });

    s.on("error", (err) => {
      console.error("Socket error:", err);
      setError(`Socket error: ${err.message || "Unknown error"}`);
    });

    setSocket(s);

    return () => {
      s.disconnect();
    };
  }, []);

  // Load document
  useEffect(() => {
    if (!socket || !quill) return;

    socket.once("load-document", (document) => {
      quill.setContents(document);
      quill.enable();
    });

    socket.emit("get-document", documentId);
  }, [socket, quill, documentId]);

  // Auto-save document
  useEffect(() => {
    if (!socket || !quill) return;

    const interval = setInterval(() => {
      socket.emit("save-document", quill.getContents());
    }, SAVE_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [socket, quill]);

  // Receive changes from other users
  useEffect(() => {
    if (!socket || !quill) return;

    const handler = (delta) => quill.updateContents(delta);
    socket.on("receive-changes", handler);

    return () => socket.off("receive-changes", handler);
  }, [socket, quill]);

  // Reset suggestion state
  const resetSuggestion = useCallback(() => {
    setAiSuggestion("");
    setIsShowingSuggestion(false);
    setSuggestionPosition(null);
    setError(null);
  }, []);

  // Accept suggestion
  const acceptSuggestion = useCallback(() => {
    if (quill && aiSuggestion && isShowingSuggestion && suggestionPosition !== null) {
      quill.insertText(suggestionPosition, aiSuggestion, 'user');
      resetSuggestion();
    }
  }, [quill, aiSuggestion, isShowingSuggestion, suggestionPosition, resetSuggestion]);

  // Function to get AI suggestion from server - Updated to handle the new response format
  const getAiSuggestion = useCallback(async (text) => {
    if (!socket || isProcessing) return;
    
    // Require at least 10 characters to trigger a suggestion
    if (text.trim().length < 10) {
      return;
    }

    console.log("Requesting AI suggestion for text:", text.substring(0, 50) + "...");
    setIsProcessing(true);
    setError(null);

    // Add a timeout to handle cases where the server doesn't respond
    const timeoutId = setTimeout(() => {
      if (isProcessing) {
        console.error("AI suggestion request timed out");
        setError("Request timed out. Please try again.");
        setIsProcessing(false);
      }
    }, 15000);
    
    try {
      socket.emit("get-ai-suggestion", text, (response) => {
        clearTimeout(timeoutId);
        
        if (response?.success) {
          console.log("Received AI suggestion:", response.suggestion);
          
          if (response.suggestion && response.suggestion.trim() !== "") {
            setAiSuggestion(response.suggestion);
            setIsShowingSuggestion(true);
            
            const selection = quill.getSelection();
            if (selection) {
              setSuggestionPosition(selection.index);
            } else {
              // If no selection, use the end of the document
              setSuggestionPosition(quill.getLength() - 1);
            }
          } else {
            console.log("Empty suggestion received");
            setError("No suggestion available at this time.");
          }
        } else {
          console.error("Error from server:", response?.error);
          setError(response?.error || "Failed to get AI suggestion");
        }
        
        setIsProcessing(false);
      });
    } catch (error) {
      clearTimeout(timeoutId);
      console.error("Error getting AI suggestion:", error);
      setError("Failed to get AI suggestion: " + (error.message || "Unknown error"));
      setIsProcessing(false);
    }
  }, [socket, isProcessing, quill]);

  // Handle key commands
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Tab' && isShowingSuggestion) {
      e.preventDefault();
      acceptSuggestion();
    }
    
    if (e.key === 'Escape' && isShowingSuggestion) {
      e.preventDefault();
      resetSuggestion();
    }
  }, [isShowingSuggestion, acceptSuggestion, resetSuggestion]);

  // Manual trigger for debugging
  const triggerSuggestion = useCallback(() => {
    if (!quill) return;
    const text = quill.getText();
    getAiSuggestion(text);
  }, [quill, getAiSuggestion]);

  // Handle text changes and emit to server
  useEffect(() => {
    if (!socket || !quill) return;

    let debounceTimer = null;

    const handler = (delta, oldDelta, source) => {
      if (source !== "user") return;
      
      if (isShowingSuggestion) {
        resetSuggestion();
      }
      
      socket.emit("send-changes", delta);
      
      // Clear previous timer and set a new one
      if (debounceTimer) clearTimeout(debounceTimer);
      
      debounceTimer = setTimeout(() => {
        const text = quill.getText();
        getAiSuggestion(text);
      }, 1000);
    };
    
    quill.on("text-change", handler);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      quill.off("text-change", handler);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [socket, quill, isShowingSuggestion, resetSuggestion, getAiSuggestion, handleKeyDown]);

  // Setup the editor
  const wrapperRef = useCallback((wrapper) => {
    if (!wrapper) return;

    wrapper.innerHTML = "";
    const editor = document.createElement("div");
    wrapper.append(editor);

    const q = new Quill(editor, {
      theme: "snow",
      modules: { toolbar: TOOLBAR_OPTIONS },
    });

    q.disable();
    q.setText("Loading...");
    setQuill(q);
  }, []);

  return (
    <div className="editor-container">
      <div className="container" ref={wrapperRef}></div>
      
      {/* Debug Controls */}
      <div className="debug-controls">
        <button onClick={triggerSuggestion} disabled={isProcessing}>
          {isProcessing ? "Processing..." : "Trigger AI Suggestion Manually"}
        </button>
        <div className="status">
          Status: {socket ? (socket.connected ? "Connected" : "Disconnected") : "Initializing..."} 
          {isProcessing ? " - Processing suggestion..." : " - Ready"}
        </div>
        {error && <div className="error">{error}</div>}
      </div>

      {/* Connection Indicator */}
      <div className={`connection-indicator ${socket?.connected ? 'connected' : 'disconnected'}`}>
        {socket?.connected ? "✓ Connected to server" : "✗ Disconnected from server"}
      </div>

      {/* AI Suggestion UI */}
      {isShowingSuggestion && (
        <div className="ai-suggestion">
          <div className="suggestion-text">
            <span className="suggestion-prefix">AI Suggestion: </span>
            <span className="suggestion-content">{aiSuggestion}</span>
          </div>
          <div className="suggestion-actions">
            <button onClick={acceptSuggestion}>Accept (Tab)</button>
            <button onClick={resetSuggestion}>Dismiss (Esc)</button>
          </div>
        </div>
      )}
      
      <style>{`
        .editor-container {
          position: relative;
          display: flex;
          flex-direction: column;
          height: 100%;
        }
        .debug-controls {
          margin-top: 10px;
          padding: 10px;
          border: 1px solid #ddd;
          border-radius: 4px;
          background-color: #f9f9f9;
        }
        .debug-controls button {
          padding: 8px 16px;
          background-color: #4285f4;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          margin-bottom: 8px;
        }
        .debug-controls button:disabled {
          background-color: #a9a9a9;
          cursor: not-allowed;
        }
        .status {
          margin-bottom: 8px;
          font-size: 14px;
        }
        .error {
          color: #d93025;
          font-size: 14px;
          margin-top: 8px;
        }
        .connection-indicator {
          padding: 5px 10px;
          margin: 5px 0;
          border-radius: 4px;
          font-size: 14px;
          text-align: center;
        }
        .connection-indicator.connected {
          background-color: #e6f4ea;
          color: #137333;
        }
        .connection-indicator.disconnected {
          background-color: #fce8e6;
          color: #c5221f;
        }
        .ai-suggestion {
          position: fixed;
          bottom: 20px;
          left: 20px;
          background-color: #f0f8ff;
          border: 1px solid #add8e6;
          border-radius: 4px;
          padding: 10px;
          box-shadow: 0 2px 5px rgba(0,0,0,0.1);
          max-width: 80%;
          z-index: 1000;
        }
        .suggestion-text {
          margin-bottom: 10px;
        }
        .suggestion-prefix {
          font-weight: bold;
          color: #4285f4;
        }
        .suggestion-content {
          font-style: italic;
        }
        .suggestion-actions {
          display: flex;
          gap: 10px;
        }
        .suggestion-actions button {
          padding: 5px 10px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        }
        .suggestion-actions button:first-child {
          background-color: #4285f4;
          color: white;
        }
        .suggestion-actions button:last-child {
          background-color: #f1f3f4;
          color: #5f6368;
        }
      `}</style>
    </div>
  );
}