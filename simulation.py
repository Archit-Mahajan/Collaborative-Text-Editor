import numpy as np
import matplotlib.pyplot as plt
import matplotlib.animation as animation
from matplotlib.patches import FancyArrowPatch
import time

# Configuration
SERVER_POS = (0, 0)
CLIENT_POS = (3, 0)
GEMINI_API_POS = (-3, 0)

# Setup the figure 
plt.style.use('ggplot')
fig, ax = plt.subplots(figsize=(10, 6))
fig.suptitle('AI Text Correction Workflow', fontsize=16)

# Configure view
ax.set_xlim(-5, 5)
ax.set_ylim(-4, 4)
ax.set_title('Grammar Correction Process')
ax.set_aspect('equal')
ax.grid(True, linestyle='--', alpha=0.6)
ax.axis('off')  # Hide axes for cleaner look

# Initial document state - with spelling/grammar errors
document_with_errors = "The documant has severl errorrs in it. This sentense needs to be corected."
corrected_document = "The document has several errors in it. This sentence needs to be corrected."

# Animation state
current_step = 0
max_steps = 6  # Total number of steps in our sequence
message_plots = []
arrows = []

# Plot nodes
server_plot = ax.scatter(*SERVER_POS, s=200, color='blue', marker='s', zorder=5)
ai_plot = ax.scatter(*GEMINI_API_POS, s=180, color='purple', marker='h', zorder=5)
client_plot = ax.scatter(*CLIENT_POS, s=120, color='green', zorder=5)

# Add node labels
ax.text(SERVER_POS[0], SERVER_POS[1]-0.5, "Server", ha='center', fontsize=10, weight='bold')
ax.text(GEMINI_API_POS[0], GEMINI_API_POS[1]-0.5, "Gemini API", ha='center', fontsize=10, weight='bold')
ax.text(CLIENT_POS[0], CLIENT_POS[1]-0.5, "Client", ha='center', fontsize=10)

# Draw permanent connection lines
ax.plot([SERVER_POS[0], CLIENT_POS[0]], [SERVER_POS[1], CLIENT_POS[1]], 'k-', alpha=0.3, zorder=1)
ax.plot([SERVER_POS[0], GEMINI_API_POS[0]], [SERVER_POS[1], GEMINI_API_POS[1]], 'k-', alpha=0.3, zorder=1)

# Add text displays
original_text = ax.text(-4.5, 2.5, "", fontsize=11, va='top', ha='left', wrap=True)
corrected_text = ax.text(-4.5, -2.5, "", fontsize=11, va='top', ha='left', wrap=True)
status_text = ax.text(0, -3.5, "", fontsize=12, ha='center', weight='bold')

# Add legend
from matplotlib.lines import Line2D
legend_elements = [
    Line2D([0], [0], marker='s', color='w', markerfacecolor='blue', markersize=10, label='Server'),
    Line2D([0], [0], marker='o', color='w', markerfacecolor='green', markersize=10, label='Client'),
    Line2D([0], [0], marker='h', color='w', markerfacecolor='purple', markersize=10, label='Gemini API'),
    Line2D([0], [0], marker='o', color='yellow', markersize=8, label='Text Data'),
    Line2D([0], [0], marker='o', color='cyan', markersize=8, label='Correction Data')
]
ax.legend(handles=legend_elements, loc='upper right')

def clear_messages():
    """Clear all message indicators from previous frame"""
    global message_plots, arrows
    for plot in message_plots:
        if isinstance(plot, plt.Text):
            plot.set_text("")
        else:
            plot.remove()
    message_plots = []
    
    for arrow in arrows:
        arrow.remove()
    arrows = []

def add_message(start_pos, end_pos, color='yellow'):
    """Add a message indicator between two points"""
    # Create arrow
    arrow = FancyArrowPatch(start_pos, end_pos, arrowstyle='->', 
                            linewidth=2, color=color, 
                            connectionstyle="arc3,rad=.1", zorder=4)
    ax.add_patch(arrow)
    arrows.append(arrow)
    
    # Add moving dot along path
    mid_x = (start_pos[0] + end_pos[0]) / 2
    mid_y = (start_pos[1] + end_pos[1]) / 2
    # Add slight offset to the midpoint for the arc
    offset = 0.2
    if start_pos[0] < end_pos[0]:
        mid_y += offset
    else:
        mid_y -= offset
    
    dot = ax.scatter(mid_x, mid_y, s=50, color=color, zorder=5)
    message_plots.append(dot)

def update_status(text):
    """Update status text"""
    status_text.set_text(text)
    return status_text

def animate(i):
    """Animation function to progress through our sequence"""
    global current_step
    
    # Only proceed if we haven't completed all steps
    if current_step >= max_steps:
        return []

    # Clear previous messages
    clear_messages()
    
    # Update simulation based on current step
    if current_step == 0:
        # Client typing text with errors
        char_count = int(len(document_with_errors)*(i%15)/15)
        original_text.set_text(f"Original Text:\n\n{document_with_errors[:char_count]}")
        update_status("Client typing text with errors...")
        
        # Highlight client when typing
        highlight = ax.scatter(*CLIENT_POS, s=200, color='yellow', alpha=0.3, zorder=3)
        message_plots.append(highlight)
        
        if i % 15 == 14:  # Proceed to next step after showing full text
            current_step += 1
    
    elif current_step == 1:
        # Full original text displayed
        original_text.set_text(f"Original Text:\n\n{document_with_errors}")
        update_status("Client sends text to server")
        
        # Client sends document to server
        add_message(CLIENT_POS, SERVER_POS, 'yellow')
        
        if i % 5 == 4:  # Wait a few frames before proceeding
            current_step += 1
    
    elif current_step == 2:
        # Server processes and sends to API
        original_text.set_text(f"Original Text:\n\n{document_with_errors}")
        update_status("Server processing text and requesting AI assistance")
        
        # Server processes and sends to API
        highlight = ax.scatter(*SERVER_POS, s=250, color='yellow', alpha=0.3, zorder=3)
        message_plots.append(highlight)
        add_message(SERVER_POS, GEMINI_API_POS, 'yellow')
        
        if i % 5 == 4:
            current_step += 1
    
    elif current_step == 3:
        # API processes text
        original_text.set_text(f"Original Text:\n\n{document_with_errors}")
        update_status("Gemini API analyzing text...")
        
        # API processing
        highlight = ax.scatter(*GEMINI_API_POS, s=250, color='purple', alpha=0.5, zorder=3)
        message_plots.append(highlight)
        
        # Start showing the corrected text gradually
        char_count = int(len(corrected_document)*(i%10)/10)
        if char_count > 0:
            corrected_text.set_text(f"Corrected Text:\n\n{corrected_document[:char_count]}")
        
        if i % 10 == 9:
            current_step += 1
    
    elif current_step == 4:
        # API returns correction to server
        original_text.set_text(f"Original Text:\n\n{document_with_errors}")
        corrected_text.set_text(f"Corrected Text:\n\n{corrected_document}")
        update_status("Gemini API sends correction to server")
        
        # API returns correction to server
        add_message(GEMINI_API_POS, SERVER_POS, 'cyan')
        
        if i % 5 == 4:
            current_step += 1
    
    elif current_step == 5:
        # Server sends correction to client
        original_text.set_text(f"Original Text:\n\n{document_with_errors}")
        corrected_text.set_text(f"Corrected Text:\n\n{corrected_document}")
        update_status("Server sends correction to client")
        
        # Server sends correction to client
        highlight = ax.scatter(*SERVER_POS, s=250, color='cyan', alpha=0.3, zorder=3)
        message_plots.append(highlight)
        add_message(SERVER_POS, CLIENT_POS, 'cyan')
        
        if i % 5 == 4:
            current_step += 1
    
    # Return all updated artists
    return message_plots + [original_text, corrected_text, status_text]

# Create animation with a specific number of frames and slower speed
ani = animation.FuncAnimation(fig, animate, frames=100, interval=300, blit=True)

# Create summary scatterplot visualization
def create_summary_scatterplot():
    """Create a summary scatterplot showing the data flow and correction rate"""
    plt.figure(figsize=(10, 6))
    
    # Create data points for the sequence
    steps = np.arange(6)
    
    # Network data points 
    client_activity = np.array([1, 1, 0, 0, 0, 1])
    server_activity = np.array([0, 0, 1, 0, 1, 0])
    api_activity = np.array([0, 0, 0, 1, 1, 0])
    
    # Error correction data
    error_words = 3  # Words with errors in original
    total_words = len(document_with_errors.split())
    correction_progress = np.array([0, 0, 0, 0.5, 1, 1]) * error_words
    
    # Plot data flow between components
    plt.scatter(steps, client_activity*3, s=100, label="Client Activity", alpha=0.7)
    plt.scatter(steps, server_activity*2, s=100, label="Server Activity", alpha=0.7)
    plt.scatter(steps, api_activity*1, s=100, label="Gemini API Activity", alpha=0.7)
    
    # Plot error correction rate
    plt.plot(steps, correction_progress, 'r--', label="Errors Corrected", linewidth=2)
    
    # Add stepwise labels
    process_steps = ["Client\nTyping", "Send to\nServer", "Server to\nAPI", 
                     "API\nProcessing", "Send\nCorrection", "Display\nSuggestion"]
    
    # Configure plot
    plt.xticks(steps, process_steps, rotation=45, ha='right')
    plt.yticks([1, 2, 3], ["Gemini API", "Server", "Client"])
    plt.grid(True, alpha=0.3, linestyle='--')
    
    # Add second y-axis for error correction
    ax2 = plt.gca().twinx()
    ax2.set_ylabel("Errors Corrected")
    ax2.set_ylim(0, error_words + 0.5)
    
    plt.title("AI Text Correction Process Flow")
    plt.tight_layout()
    plt.legend(loc="upper left")
    
    # Add annotation about system components
    components_text = """
    System Components:
    • Real-time communication channel
    • Document storage
    • Text editor interface
    • AI correction integration
    • Edit synchronization
    """

# Display the simulation
plt.tight_layout(rect=[0, 0, 1, 0.95])  # Make room for title
plt.show()

# Generate summary scatterplot
create_summary_scatterplot()