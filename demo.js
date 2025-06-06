const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;

// HTML template for the demo
const demoHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>LazyPrompt Demo</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
        }
        header {
            background-color: #3b82f6;
            color: white;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 30px;
        }
        h1 { margin: 0; }
        .nav {
            display: flex;
            gap: 20px;
            margin-top: 15px;
        }
        .nav a {
            color: white;
            text-decoration: none;
            padding: 5px 10px;
            border-radius: 5px;
            transition: background-color 0.2s;
        }
        .nav a:hover {
            background-color: rgba(255, 255, 255, 0.2);
        }
        .features {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .feature-card {
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            padding: 20px;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
        }
        .marketplace {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .prompt-card {
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            padding: 20px;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
        }
        .prompt-card h3 {
            margin-top: 0;
        }
        .price {
            font-weight: bold;
            color: #059669;
        }
        .button {
            display: inline-block;
            background-color: #3b82f6;
            color: white;
            padding: 8px 16px;
            border-radius: 5px;
            text-decoration: none;
            margin-top: 10px;
        }
        .category {
            display: inline-block;
            background-color: #dbeafe;
            color: #1e40af;
            padding: 2px 8px;
            border-radius: 100px;
            font-size: 14px;
            margin-bottom: 10px;
        }
        footer {
            margin-top: 50px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
            text-align: center;
            color: #6b7280;
        }
    </style>
</head>
<body>
    <header>
        <h1>LazyPrompt</h1>
        <p>A marketplace for AI prompts to help you get the most out of ChatGPT, Claude, and other AI assistants.</p>
        <div class="nav">
            <a href="#">Home</a>
            <a href="#">Marketplace</a>
            <a href="#">Dashboard</a>
            <a href="#">Create Prompt</a>
        </div>
    </header>

    <section>
        <h2>Features</h2>
        <div class="features">
            <div class="feature-card">
                <h3>Discover Quality Prompts</h3>
                <p>Browse through hundreds of prompts created by experts, categorized for easy discovery.</p>
            </div>
            <div class="feature-card">
                <h3>Sell Your Expertise</h3>
                <p>Create and sell your own prompts, turning your knowledge into a source of income.</p>
            </div>
            <div class="feature-card">
                <h3>Save Time</h3>
                <p>Stop wasting time crafting the perfect prompt - use proven templates from our marketplace.</p>
            </div>
        </div>
    </section>

    <section>
        <h2>Popular Prompts</h2>
        <div class="marketplace">
            <div class="prompt-card">
                <span class="category">Writing</span>
                <h3>SEO Blog Post Generator</h3>
                <p>Generate high-quality blog posts optimized for search engines with just a few keywords.</p>
                <p class="price">$4.99</p>
                <a href="#" class="button">View Details</a>
            </div>
            <div class="prompt-card">
                <span class="category">Programming</span>
                <h3>Python Code Refactor Assistant</h3>
                <p>AI prompt that helps refactor Python code for better readability and performance.</p>
                <p class="price">$9.99</p>
                <a href="#" class="button">View Details</a>
            </div>
            <div class="prompt-card">
                <span class="category">Marketing</span>
                <h3>Marketing Email Generator</h3>
                <p>Create compelling marketing emails that convert with this specialized prompt.</p>
                <p class="price">$5.99</p>
                <a href="#" class="button">View Details</a>
            </div>
        </div>
    </section>

    <footer>
        <p>&copy; 2024 LazyPrompt. All rights reserved.</p>
    </footer>
</body>
</html>
`;

// Create HTTP server
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(demoHTML);
});

server.listen(PORT, () => {
  console.log(`
==================================================
🚀 LazyPrompt Demo Server Running!
==================================================

📱 View the demo at: http://localhost:${PORT}

This is a simplified demo of the LazyPrompt interface.
In the full application, you would have:

- User authentication
- Prompt marketplace with search and filtering
- User dashboard to manage prompts
- Ability to create and sell your own prompts

Press Ctrl+C to stop the server.
==================================================
`);
}); 