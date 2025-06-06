# Using LazyPrompt

This guide will walk you through the steps to run and use LazyPrompt.

## Running LazyPrompt

### Quick Start

Run LazyPrompt using our convenient start script:

```bash
chmod +x start.sh
./start.sh
```

This will install dependencies, set up the database, and start the development server.

### Access the Application

Once running, access LazyPrompt at:

**[http://localhost:3000](http://localhost:3000)**

## Test Account

For development purposes, you can use the following test account:

- **Name**: Test User
- **Email**: test@example.com

## Features

### Marketplace

Browse AI prompts by visiting:
**[http://localhost:3000/marketplace](http://localhost:3000/marketplace)**

### Dashboard

View your purchased and created prompts:
**[http://localhost:3000/dashboard](http://localhost:3000/dashboard)**

### Create Prompts

Create and sell your own prompts:
**[http://localhost:3000/create](http://localhost:3000/create)**

## Troubleshooting

### Common Issues

1. **Port already in use**
   
   If port 3000 is already in use, you can modify the port in `apps/web/package.json`:
   ```json
   "dev": "next dev -p 3001"
   ```

2. **Database errors**
   
   Reset the database:
   ```bash
   cd packages/database
   npx prisma migrate reset
   ```

3. **Missing dependencies**
   
   Run the install script again:
   ```bash
   ./install-deps.sh
   ```

### Need Help?

If you need further assistance, please open an issue or contact the team. 