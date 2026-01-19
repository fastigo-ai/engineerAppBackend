# Basic Node.js Backend

This project is a basic Node.js backend with a layered architecture:
- **Model**: In-memory representation of items
- **Repository**: Data access logic
- **Service**: Business logic
- **Controller**: Express routes
- **Config**: Configuration settings
- **Middleware**: Example logger middleware

## How to Run

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the server:
   ```bash
   npm start
   ```
3. The API will be available at `http://localhost:3000/`

## Endpoints
- `GET /items` - List all items
- `GET /items/:id` - Get item by ID
- `POST /items` - Create new item
- `PUT /items/:id` - Update item
- `DELETE /items/:id` - Delete item
