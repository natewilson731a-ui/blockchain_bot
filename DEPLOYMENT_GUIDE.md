# 🚀 Block Vote - Free Deployment Guide

A comprehensive guide to deploy your decentralized voting system for free testing and public access.

## 📋 Overview

This guide provides multiple free deployment options for your Block Vote project:
- **Frontend**: React app with Chakra UI
- **Backend**: Node.js/Express server with SQLite
- **Blockchain**: Smart contracts (using testnets)
- **Database**: SQLite (included) or free PostgreSQL

## 🌐 Deployment Options

### Option 1: Full Stack Deployment (Recommended)
**Frontend**: Vercel | **Backend**: Railway/Render | **Blockchain**: Polygon Mumbai Testnet

### Option 2: All-in-One Deployment
**Full Stack**: Railway or Render

### Option 3: Separate Services
**Frontend**: Netlify | **Backend**: Heroku/Railway | **Blockchain**: Sepolia Testnet

---

## 🚀 Option 1: Full Stack Deployment (Recommended)

### Step 1: Prepare Your Code

1. **Update package.json scripts** (root directory):
```json
{
  "scripts": {
    "start": "node server/index.js",
    "build": "cd client && npm run build",
    "install-client": "cd client && npm install",
    "install-server": "cd server && npm install",
    "postinstall": "npm run install-client && npm run install-server"
  }
}
```

2. **Create production configuration files**:

Create `client/.env.production`:
```env
REACT_APP_API_URL=https://your-backend-url.railway.app
REACT_APP_NETWORK_ID=80001
REACT_APP_NETWORK_NAME=Polygon Mumbai
REACT_APP_RPC_URL=https://rpc-mumbai.maticvigil.com
```

Create `server/.env.production`:
```env
PORT=8080
NODE_ENV=production
EMAIL_USER=your-gmail@gmail.com
EMAIL_PASS=your-app-specific-password
JWT_SECRET=your-super-secret-jwt-key-min-32-chars
DATABASE_URL=postgres://username:password@host:5432/database
CORS_ORIGIN=https://your-frontend-url.vercel.app
```

### Step 2: Deploy Backend to Railway

1. **Sign up at [Railway.app](https://railway.app)** (free with GitHub)

2. **Create new project**:
   - Click "New Project"
   - Choose "Deploy from GitHub repo"
   - Select your repository

3. **Configure deployment**:
   - Set root directory to `server`
   - Add environment variables from `.env.production`
   - Railway will auto-detect Node.js

4. **Database setup**:
   - Add PostgreSQL plugin (or keep SQLite for simplicity)
   - Railway provides free PostgreSQL with 1GB storage

5. **Update server code for production**:

Create `server/config/database.js`:
```javascript
const { Sequelize } = require('sequelize');

let sequelize;

if (process.env.DATABASE_URL) {
  // Production with PostgreSQL
  sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false
      }
    }
  });
} else {
  // Development with SQLite
  sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: './database.sqlite'
  });
}

module.exports = sequelize;
```

### Step 3: Deploy Frontend to Vercel

1. **Sign up at [Vercel.com](https://vercel.com)** (free with GitHub)

2. **Deploy**:
   - Import your GitHub repository
   - Set build command: `cd client && npm run build`
   - Set output directory: `client/build`
   - Add environment variables from `client/.env.production`

3. **Configure build settings**:
   - Framework Preset: Create React App
   - Root Directory: `client`

### Step 4: Setup Blockchain Network

1. **Get free RPC endpoints**:
   - **Polygon Mumbai**: https://rpc-mumbai.maticvigil.com
   - **Sepolia**: https://sepolia.infura.io/v3/YOUR-PROJECT-ID (free Infura account)

2. **Deploy smart contracts to testnet**:

Update `contracts/truffle-config.js`:
```javascript
require('dotenv').config();

module.exports = {
  networks: {
    mumbai: {
      provider: () => new HDWalletProvider(
        process.env.MNEMONIC,
        "https://rpc-mumbai.maticvigil.com"
      ),
      network_id: 80001,
      confirmations: 2,
      timeoutBlocks: 200,
      skipDryRun: true
    }
  }
};
```

3. **Deploy contracts**:
```bash
cd contracts
npx truffle migrate --network mumbai
```

---

## 🚀 Option 2: All-in-One Railway Deployment

### Step 1: Prepare Monorepo Structure

Create `Dockerfile` in root:
```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY client/package*.json ./client/
COPY server/package*.json ./server/

# Install dependencies
RUN npm install
RUN cd client && npm install
RUN cd server && npm install

# Copy source code
COPY . .

# Build frontend
RUN cd client && npm run build

# Expose port
EXPOSE 8080

# Start server with static file serving
CMD ["npm", "start"]
```

Update `server/index.js` to serve static files:
```javascript
// Add after other middleware
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/build')));
  
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/build', 'index.html'));
  });
}
```

### Step 2: Deploy to Railway

1. Connect GitHub repository
2. Set environment variables
3. Deploy automatically

---

## 🚀 Option 3: Netlify + Heroku

### Frontend (Netlify)

1. **Build command**: `cd client && npm run build`
2. **Publish directory**: `client/build`
3. **Environment variables**: Add React environment variables

### Backend (Heroku)

1. **Create Procfile** in server directory:
```
web: node index.js
```

2. **Deploy**:
```bash
cd server
heroku create your-app-name
git subtree push --prefix server heroku main
```

---

## 🔧 Essential Configuration Changes

### 1. Update CORS Configuration

In `server/index.js`:
```javascript
const corsOptions = {
  origin: process.env.NODE_ENV === 'production' 
    ? process.env.CORS_ORIGIN 
    : 'http://localhost:3000',
  credentials: true
};

app.use(cors(corsOptions));
```

### 2. Update Frontend API Calls

Create `client/src/config/api.js`:
```javascript
export const API_BASE_URL = process.env.NODE_ENV === 'production'
  ? process.env.REACT_APP_API_URL
  : 'http://localhost:5000';
```

### 3. Environment Variables Setup

**Required Environment Variables**:

**Backend**:
- `PORT=8080`
- `NODE_ENV=production`
- `EMAIL_USER=your-gmail@gmail.com`
- `EMAIL_PASS=your-app-password`
- `JWT_SECRET=your-secret-key`
- `CORS_ORIGIN=https://your-frontend-domain.com`

**Frontend**:
- `REACT_APP_API_URL=https://your-backend-domain.com`
- `REACT_APP_NETWORK_ID=80001`
- `REACT_APP_RPC_URL=https://rpc-mumbai.maticvigil.com`

---

## 🧪 Testing Your Deployment

### 1. Get Test Tokens
- **Polygon Mumbai**: https://faucet.polygon.technology/
- **Sepolia**: https://sepoliafaucet.com/

### 2. Test Application Flow
1. Admin registration/login
2. Create election
3. User registration with email OTP
4. Vote casting with MetaMask
5. Results viewing

### 3. Share with Users
- Frontend URL: `https://your-app.vercel.app`
- Network: Polygon Mumbai Testnet
- Required: MetaMask extension

---

## 💰 Cost Breakdown (All Free Tiers)

| Service | Free Tier Limits | Perfect For |
|---------|------------------|-------------|
| **Vercel** | 100GB bandwidth, Unlimited deploys | Frontend hosting |
| **Railway** | $5 credit monthly, 500GB bandwidth | Backend + Database |
| **Render** | 750 hours/month, 1GB RAM | Alternative backend |
| **Netlify** | 100GB bandwidth, 300 build minutes | Alternative frontend |
| **Polygon Mumbai** | Free testnet | Smart contracts |

## 🔗 Quick Start Commands

```bash
# 1. Prepare for deployment
git add .
git commit -m "Prepare for deployment"
git push origin main

# 2. Deploy contracts to testnet
cd contracts
npx truffle migrate --network mumbai

# 3. Update contract addresses in frontend
# Copy deployed addresses to client/src/config/contracts.js

# 4. Deploy to platforms
# Follow platform-specific steps above
```

## 📞 Support & Sharing

After deployment, share these details with users:

**Application URL**: `https://your-app-name.vercel.app`
**Network**: Polygon Mumbai Testnet  
**Requirements**: MetaMask browser extension  
**Test Tokens**: Get free from Polygon faucet  

**Admin Access**: Use the admin panel to:
- Approve voter registrations
- Create elections
- Add contestants
- Monitor voting process

## 🛠️ Troubleshooting

### Common Issues:
1. **CORS errors**: Check CORS_ORIGIN environment variable
2. **Database connection**: Verify DATABASE_URL format
3. **MetaMask network**: Ensure users are on correct testnet
4. **Email sending**: Verify Gmail app password setup
5. **Build failures**: Check Node.js version compatibility

### Debug Steps:
1. Check deployment logs in platform dashboard
2. Verify all environment variables are set
3. Test API endpoints directly
4. Check browser console for frontend errors

---

## 🎉 Congratulations!

Your Block Vote application is now live and accessible to anyone with an internet connection and MetaMask! Users can test the complete voting experience on the blockchain without any cost.

**Security Note**: This is for testing purposes. For production voting, implement additional security measures and use Ethereum mainnet. 