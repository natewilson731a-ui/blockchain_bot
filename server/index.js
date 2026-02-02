const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const nodemailer = require('nodemailer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Sequelize, DataTypes, Op } = require('sequelize');
const { Web3 } = require('web3');
const VotingSystem = require('./VotingSystem.json');
const fs = require('fs');
const path = require('path');

dotenv.config();

// Store for active election timers
const activeElectionTimers = new Map();

// Function to automatically end election when time expires
const scheduleElectionEnd = (electionId, endTime) => {
  const now = new Date();
  const timeUntilEnd = endTime - now;
  
  if (timeUntilEnd <= 0) {
    console.log(`Election ${electionId} should have already ended`);
    return;
  }
  
  console.log(`Scheduling election ${electionId} to end in ${Math.round(timeUntilEnd / 1000 / 60)} minutes`);
  
  // Clear any existing timer for this election
  if (activeElectionTimers.has(electionId)) {
    clearTimeout(activeElectionTimers.get(electionId));
  }
  
  const timerId = setTimeout(async () => {
    try {
      console.log(`Auto-ending election ${electionId} due to time expiration`);
      await autoEndElection(electionId);
      activeElectionTimers.delete(electionId);
    } catch (error) {
      console.error(`Failed to auto-end election ${electionId}:`, error);
    }
  }, timeUntilEnd);
  
  activeElectionTimers.set(electionId, timerId);
};

// Function to automatically end an election
const autoEndElection = async (electionId) => {
  try {
    const election = await Election.findByPk(electionId);
    if (!election || election.status !== 'ACTIVE') {
      console.log(`Election ${electionId} is not active, skipping auto-end`);
      return;
    }
    
    console.log(`Auto-ending election: ${election.name} (ID: ${electionId})`);
    
    // MANDATORY blockchain election end (auto)
    let blockchainEnded = false;
    if (!election.blockchainElectionId) {
      console.error(`Cannot auto-end election ${electionId}: No blockchain election ID found`);
      return; // Skip auto-end if no blockchain election
    }
    
    const web3 = await initializeWeb3();
    const contract = await initializeContract(web3);
    
    await executeBlockchainTransaction(
      web3,
      contract,
      'endElection',
      [election.blockchainElectionId],
      {
        from: process.env.ADMIN_ETHEREUM_ADDRESS
      }
    );
    
    console.log(`Election ${electionId} ended successfully on blockchain (auto)`);
    blockchainEnded = true;
    
    // Update election status in database
    await election.update({
      status: 'ENDED',
      endedAt: new Date()
    });
    
    console.log(`Election ${electionId} auto-ended successfully in database`);
    
    // Broadcast the election end to connected clients (if you implement WebSocket later)
    // For now, clients will detect this through polling
    
  } catch (error) {
    console.error(`Error in auto-ending election ${electionId}:`, error);
  }
};

// Initialize express app
const app = express();
app.use(cors());
app.use(express.json());

// Database setup
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: './database.sqlite',
  logging: false // Disable logging
});

// Models
const Admin = sequelize.define('Admin', {
  username: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: false
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false
  }
});

const User = sequelize.define('User', {
  firstName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  lastName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  email: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: false
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false
  },
  cnic: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: true
  },
  otp: {
    type: DataTypes.STRING,
    allowNull: true
  },
  isVerified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  isVoter: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  voterStatus: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: 'not_registered'
  }
});

const PendingVoter = sequelize.define('PendingVoter', {
  cnic: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: false
  },
  walletAddress: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: false
  },
  isApproved: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: User,
      key: 'id'
    }
  }
});

const Contestant = sequelize.define('Contestant', {
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  age: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  cnic: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: false
  },
  qualification: {
    type: DataTypes.STRING,
    allowNull: false
  }
});

const Election = sequelize.define('Election', {
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: function() {
      return `Election #${Date.now()}`;
    }
  },
  status: {
    type: DataTypes.ENUM('CREATED', 'ACTIVE', 'ENDED'),
    allowNull: false,
    defaultValue: 'CREATED'
  },
  createdAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  startedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  endedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  scheduledEndTime: {
    type: DataTypes.DATE,
    allowNull: true
  },
  durationMinutes: {
    type: DataTypes.INTEGER,
    allowNull: true,
    validate: {
      min: 15,
      max: 1440 // 24 hours * 60 minutes
    }
  },
  totalVoters: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  blockchainElectionId: {
    type: DataTypes.INTEGER,
    allowNull: true
  }
});

// Add ElectionContestant model for many-to-many relationship
const ElectionContestant = sequelize.define('ElectionContestant', {
  voteCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  }
}, {
  indexes: [
    {
      unique: true,
      fields: ['ElectionId', 'ContestantId']
    }
  ]
});

// Add Votes model to track individual votes and prevent double voting
const Vote = sequelize.define('Vote', {
  voterCnic: {
    type: DataTypes.STRING,
    allowNull: false
  },
  electionId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  contestantId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  walletAddress: {
    type: DataTypes.STRING,
    allowNull: false
  }
}, {
  indexes: [
    {
      unique: true,
      fields: ['voterCnic', 'electionId']
    }
  ]
});

// Set up model associations
User.hasOne(PendingVoter, {
  foreignKey: 'userId',
  as: 'pendingVoter',
  onDelete: 'CASCADE'
});

PendingVoter.belongsTo(User, {
  foreignKey: 'userId',
  as: 'user'
});

// Set up many-to-many relationship between Election and Contestant
Election.belongsToMany(Contestant, { 
  through: ElectionContestant,
  onDelete: 'CASCADE',
  foreignKey: 'ElectionId',
  otherKey: 'ContestantId'
});

Contestant.belongsToMany(Election, { 
  through: ElectionContestant,
  onDelete: 'CASCADE',
  foreignKey: 'ContestantId',
  otherKey: 'ElectionId'
});

// Vote associations
Vote.belongsTo(Contestant, {
  foreignKey: 'contestantId',
  as: 'Contestant'
});
Vote.belongsTo(Election, {
  foreignKey: 'electionId',
  as: 'Election'
});

// Read and convert logo to base64
const logoPath = path.join(__dirname, '../client/src/assets/chain.PNG');
const logoBase64 = fs.readFileSync(logoPath, { encoding: 'base64' });

// Email configuration
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Email Templates
const emailTemplates = {
  verification: (otp, firstName) => ({
    subject: 'Email Verification - Block Vote',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            margin: 0;
            padding: 0;
            background-color: #f7f7f7;
          }
          .container {
            max-width: 600px;
            margin: 20px auto;
            background-color: #ffffff;
            border-radius: 10px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            overflow: hidden;
          }
          .header {
            background: linear-gradient(135deg, #000033 0%, #000066 100%);
            color: white;
            padding: 30px 20px;
            text-align: center;
          }
          .header h1 {
            margin: 0;
            font-size: 28px;
            font-weight: 700;
            letter-spacing: 1px;
            color: #40E0FF;
          }
          .header .tagline {
            color: #ffffff;
            font-size: 14px;
            margin-top: 5px;
            letter-spacing: 1px;
          }
          .content {
            padding: 40px 30px;
            background-color: #ffffff;
          }
          .greeting {
            font-size: 20px;
            font-weight: 600;
            margin-bottom: 20px;
            color: #2c3e50;
          }
          .message {
            font-size: 16px;
            color: #444;
            margin-bottom: 30px;
          }
          .otp-container {
            background-color: #f8f9fa;
            border: 2px dashed #40E0FF;
            border-radius: 8px;
            padding: 20px;
            margin: 30px 0;
            text-align: center;
          }
          .otp {
            font-size: 36px;
            font-weight: bold;
            color: #0088cc;
            letter-spacing: 8px;
            margin: 10px 0;
            font-family: 'Courier New', monospace;
            background: linear-gradient(45deg, #40E0FF, #0088cc);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
          }
          .note {
            font-size: 14px;
            color: #666;
            background-color: #E8F7FF;
            padding: 15px;
            border-left: 4px solid #40E0FF;
            margin: 20px 0;
          }
          .footer {
            text-align: center;
            padding: 20px;
            background-color: #f8f9fa;
            border-top: 1px solid #eee;
          }
          .footer p {
            margin: 5px 0;
            font-size: 13px;
            color: #666;
          }
          .logo {
            width: 120px;
            height: auto;
            margin-bottom: 15px;
          }
          .social-links {
            margin-top: 20px;
          }
          .social-links a {
            color: #40E0FF;
            text-decoration: none;
            margin: 0 10px;
          }
          .divider {
            height: 1px;
            background-color: #eee;
            margin: 20px 0;
          }
          .blockchain-text {
            font-family: 'Courier New', monospace;
            color: #40E0FF;
            font-size: 12px;
            letter-spacing: 1px;
            margin-top: 5px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <img src="data:image/png;base64,${logoBase64}" alt="Block Vote Logo" class="logo">
            <h1>Block Vote</h1>
            <div class="tagline">DECENTRALIZED VOTING SYSTEM</div>
            <div class="blockchain-text">YOUR VOTE IS YOUR VOICE IN BLOCKCHAIN</div>
          </div>
          <div class="content">
            <div class="greeting">Hello ${firstName},</div>
            <div class="message">
              Thank you for choosing Block Vote for your secure voting needs. To ensure the security of your account, please verify your email address using the verification code below.
            </div>
            
            <div class="otp-container">
              <p style="margin: 0; color: #666;">Your Verification Code</p>
              <div class="otp">${otp}</div>
              <p style="margin: 5px 0 0; font-size: 13px; color: #666;">Valid for 10 minutes only</p>
            </div>

            <div class="note">
              <strong>Security Notice:</strong><br>
              • Never share this code with anyone<br>
              • Block Vote representatives will never ask for this code<br>
              • Make sure you're on the official Block Vote website
            </div>

            <div class="message">
              If you didn't request this verification code, please ignore this email or contact our support team if you have concerns.
            </div>

            <div class="divider"></div>

            <div style="text-align: center; color: #666;">
              <p>Need help? Contact our support team</p>
              <a href="mailto:support@blockvote.com" style="color: #40E0FF; text-decoration: none;">support@blockvote.com</a>
            </div>
          </div>
          
          <div class="footer">
            <div class="social-links">
              <a href="#">Twitter</a> • 
              <a href="#">LinkedIn</a> • 
              <a href="#">GitHub</a>
            </div>
            <p>© ${new Date().getFullYear()} Block Vote. All rights reserved.</p>
            <p style="font-size: 12px; color: #999;">
              This is an automated message. Please do not reply to this email.
            </p>
          </div>
        </div>
      </body>
      </html>
    `
  }),

  voterApproval: (firstName, lastName) => ({
    subject: 'Voter Registration Approved - Block Vote',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #0088cc; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
          .content { background-color: #f9f9f9; padding: 20px; border-radius: 0 0 5px 5px; }
          .status { font-size: 24px; font-weight: bold; text-align: center; color: #28a745; margin: 20px 0; }
          .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <img src="data:image/png;base64,${logoBase64}" alt="Block Vote Logo" class="logo">
            <h1>Block Vote</h1>
          </div>
          <div class="content">
            <p>Dear ${firstName} ${lastName},</p>
            <div class="status">✅ Your Voter Registration is Approved!</div>
            <p>We are pleased to inform you that your voter registration has been approved. You can now participate in the voting process when it begins.</p>
            <p>Important Information:</p>
            <ul>
              <li>Keep your wallet credentials secure</li>
              <li>Monitor the voting phase announcements</li>
              <li>Ensure your wallet has sufficient gas for voting transactions</li>
            </ul>
            <p>Best regards,<br>Block Vote Team</p>
          </div>
          <div class="footer">
            <p>This is an automated message, please do not reply to this email.</p>
            <p>© ${new Date().getFullYear()} Block Vote. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `
  }),

  voterRejection: (firstName, lastName) => ({
    subject: 'Voter Registration Status Update - Block Vote',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #0088cc; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
          .content { background-color: #f9f9f9; padding: 20px; border-radius: 0 0 5px 5px; }
          .status { font-size: 24px; font-weight: bold; text-align: center; color: #dc3545; margin: 20px 0; }
          .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <img src="data:image/png;base64,${logoBase64}" alt="Block Vote Logo" class="logo">
            <h1>Block Vote</h1>
          </div>
          <div class="content">
            <p>Dear ${firstName} ${lastName},</p>
            <div class="status">Your Voter Registration Requires Review</div>
            <p>We regret to inform you that your voter registration could not be approved at this time. This may be due to:</p>
            <ul>
              <li>Incomplete or incorrect information provided</li>
              <li>Verification issues with provided documents</li>
              <li>Technical issues with wallet address</li>
            </ul>
            <p>You may submit a new registration with updated information. If you believe this is an error, please contact our support team.</p>
            <p>Best regards,<br>Block Vote Team</p>
          </div>
          <div class="footer">
            <p>This is an automated message, please do not reply to this email.</p>
            <p>© ${new Date().getFullYear()} Block Vote. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `
  })
};

// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    req.userId = decoded.userId;
    req.adminId = decoded.adminId;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Middleware to verify admin token
const verifyAdminToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    if (!decoded.adminId) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    req.adminId = decoded.adminId;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Custom error classes for better error handling
class BlockchainError extends Error {
  constructor(message, code = 'BLOCKCHAIN_ERROR') {
    super(message);
    this.name = 'BlockchainError';
    this.code = code;
  }
}

class TransactionError extends BlockchainError {
  constructor(message) {
    super(message, 'TRANSACTION_ERROR');
  }
}

class NetworkError extends BlockchainError {
  constructor(message) {
    super(message, 'NETWORK_ERROR');
  }
}

// Blockchain transaction helper with retries
const executeBlockchainTransaction = async (web3, contract, method, params, options, maxRetries = 3) => {
  let lastError = null;
  
  // First, check if the method exists on the contract
  if (!contract.methods[method]) {
    throw new TransactionError(`Contract method '${method}' does not exist. Available methods: ${Object.keys(contract.methods).join(', ')}`);
  }

  // Check if the admin account has sufficient balance
  try {
    const balance = await web3.eth.getBalance(options.from);
    const balanceEth = web3.utils.fromWei(balance, 'ether');
    console.log(`Admin account balance: ${balanceEth} ETH`);
    
    if (parseFloat(balanceEth) < 0.1) {
      throw new TransactionError(`Insufficient ETH balance (${balanceEth} ETH). Please fund the admin account: ${options.from}`);
    }
  } catch (balanceError) {
    console.error('Error checking balance:', balanceError);
  }
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      console.log(`Attempting blockchain transaction: ${method} with params:`, params);
      console.log(`Params stringified:`, JSON.stringify(params));
      console.log(`Individual params:`, params.map((p, i) => `[${i}]: ${typeof p} = ${JSON.stringify(p)}`));
      
      // Estimate gas with buffer
      const gasEstimate = await contract.methods[method](...params).estimateGas(options);
      // Convert BigInt to Number for calculations
      const gasEstimateNum = typeof gasEstimate === 'bigint' ? Number(gasEstimate) : parseInt(gasEstimate.toString());
      const gasLimit = Math.ceil(gasEstimateNum * 1.2); // Add 20% buffer
      
      console.log(`Gas estimate: ${gasEstimate}, Gas limit: ${gasLimit}`);

      // Send transaction
      const result = await contract.methods[method](...params).send({
        ...options,
        gas: gasLimit
      });

      console.log(`Transaction successful: ${result.transactionHash}`);
      return result;
    } catch (error) {
      lastError = error;
      console.error(`Transaction attempt ${i + 1} failed:`, error.message);
      
      // Don't retry certain errors
      if (
        error.message.includes('User denied') ||
        error.message.includes('insufficient funds') ||
        error.message.includes('nonce too low') ||
        error.message.includes('does not exist') ||
        error.message.includes('revert')
      ) {
        throw new TransactionError(`Transaction failed: ${error.message}`);
      }

      if (i < maxRetries - 1) {
        console.log(`Retrying in ${(i + 1)} seconds...`);
        // Wait before retrying with exponential backoff
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
        continue;
      }
    }
  }

  throw new TransactionError(`Transaction failed after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`);
};

// Initialize Web3 with network validation
const initializeWeb3 = async () => {
  if (!process.env.ETHEREUM_NODE_URL) {
    throw new NetworkError('Ethereum node URL not configured');
  }

  try {
    const web3 = new Web3(process.env.ETHEREUM_NODE_URL);
    await web3.eth.net.isListening();
    return web3;
  } catch (error) {
    console.error('Web3 initialization error:', error);
    throw new NetworkError('Failed to connect to Ethereum network: ' + error.message);
  }
};

// Initialize contract with validation
const initializeContract = async (web3) => {
  if (!process.env.CONTRACT_ADDRESS) {
    throw new NetworkError('Contract address not configured');
  }

  try {
    // Validate that the contract address is properly formatted
    if (!web3.utils.isAddress(process.env.CONTRACT_ADDRESS)) {
      throw new NetworkError('Invalid contract address format');
    }

    // Create contract instance
    const contract = new web3.eth.Contract(
      VotingSystem.abi,
      process.env.CONTRACT_ADDRESS
    );

    // Test the contract by calling a simple view function
    try {
      await contract.methods.admin().call();
      console.log('Contract initialized successfully at:', process.env.CONTRACT_ADDRESS);
    } catch (contractError) {
      console.warn('Contract validation failed, but continuing:', contractError.message);
      // Continue anyway - the contract might not be deployed yet
    }

    return contract;
  } catch (error) {
    if (error instanceof BlockchainError) {
      throw error;
    }
    throw new BlockchainError('Failed to initialize contract: ' + error.message);
  }
};

// User Routes
app.post('/api/user/register', async (req, res) => {
  try {
    const { firstName, lastName, email, password, cnic } = req.body;
    
    // Check if user already exists
    const existingUser = await User.findOne({ 
      where: { 
        [Sequelize.Op.or]: [
          { email },
          { cnic }
        ]
      } 
    });
    
    if (existingUser) {
      if (existingUser.email === email) {
        return res.status(400).json({ error: 'Email already registered' });
      }
      if (existingUser.cnic === cnic) {
        return res.status(400).json({ error: 'CNIC already registered' });
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    await User.create({
      firstName,
      lastName,
      email,
      password: hashedPassword,
      cnic,
      otp
    });

    // Send OTP email with new template
    const template = emailTemplates.verification(otp, firstName);
    const mailOptions = {
      from: `"Block Vote" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: template.subject,
      html: template.html
    };

    await transporter.sendMail(mailOptions);
    res.status(201).json({ message: 'Registration initiated. Please verify your email.' });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/user/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    const user = await User.findOne({ where: { email } });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.otp !== otp) {
      return res.status(400).json({ error: 'Invalid verification code' });
    }

    await user.update({ isVerified: true, otp: null });
    res.json({ message: 'Email verified successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/user/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ where: { email } });

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!user.isVerified) {
      return res.status(401).json({ error: 'Please verify your email first' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );

    res.json({
      token,
      userId: user.id,
      isVoter: user.isVoter
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add token validation endpoint
app.get('/api/user/validate-token', verifyToken, async (req, res) => {
  try {
    const user = await User.findByPk(req.userId);
    if (!user) {
      return res.status(401).json({ valid: false });
    }
    res.json({ valid: true });
  } catch (error) {
    res.status(401).json({ valid: false });
  }
});

// Get user profile
app.get('/api/user/profile', verifyToken, async (req, res) => {
  try {
    const user = await User.findByPk(req.userId, {
      attributes: { exclude: ['password', 'otp'] },
      include: [{
        model: PendingVoter,
        as: 'pendingVoter',
        attributes: ['id', 'cnic', 'walletAddress', 'isApproved']
      }]
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({ error: error.message });
  }
});

// Voter registration for existing users
app.post('/api/voter/register', verifyToken, async (req, res) => {
  let pendingVoter = null;
  const { cnic, walletAddress } = req.body;
  const user = await User.findByPk(req.userId);

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  try {
    // STEP 1: MANDATORY blockchain voter registration submission
    let blockchainRegistered = false;
    try {
      const web3 = await initializeWeb3();
      const contract = await initializeContract(web3);
      
      // Check if registration phase is active
      const isRegistrationActive = await contract.methods.isRegistrationPhaseActive().call();
      if (!isRegistrationActive) {
        return res.status(400).json({ error: 'Voter registration phase is not active' });
      }
      
      // Submit voter registration to blockchain
      await executeBlockchainTransaction(
        web3,
        contract,
        'submitVoterRegistration',
        [cnic],
        {
          from: walletAddress
        }
      );
      
      console.log(`Voter ${cnic} registered successfully on blockchain`);
      blockchainRegistered = true;
    } catch (blockchainError) {
      console.error(`Blockchain registration failed for voter ${cnic}:`, blockchainError);
      return res.status(500).json({ 
        error: 'Failed to register voter on blockchain',
        details: blockchainError.message
      });
    }

    // STEP 2: Only if blockchain succeeds, create database record
    if (blockchainRegistered) {
      // Create new pending voter registration
      pendingVoter = await PendingVoter.create({
        userId: user.id,
        cnic,
        walletAddress,
        isApproved: false
      });

      // Update user status
      await user.update({
        voterStatus: 'pending'
      });

      console.log(`Voter ${cnic} registration completed in database`);
      res.status(201).json({ message: 'Voter registration submitted for approval on blockchain and database' });
    }
  } catch (error) {
    // If anything fails after creating pendingVoter, clean up
    if (pendingVoter) {
      await pendingVoter.destroy();
      await user.update({ voterStatus: 'not_registered' });
    }

    console.error('Registration error:', error);
    
    if (error instanceof BlockchainError) {
      res.status(500).json({ 
        error: 'Blockchain error during registration',
        details: error.message,
        code: error.code
      });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// Get voter status
app.get('/api/voter/status', verifyToken, async (req, res) => {
  try {
    const userId = req.userId;
    const user = await User.findByPk(userId, {
      include: [{
        model: PendingVoter,
        as: 'pendingVoter'
      }]
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get total approved voters count
    const totalVoters = await PendingVoter.count({
      where: { isApproved: true }
    });

    // Get current election to check if user has voted
    const currentElection = await Election.findOne({
      where: {
        status: 'ACTIVE'
      }
    });

    // For now, we'll get voting status from blockchain via the frontend
    // The hasVoted status will be determined by the blockchain contract
    let hasVoted = false; // This will be updated by blockchain calls in frontend

    // Return voter status information
    res.json({
      isRegistered: user.isVoter,
      isPending: user.pendingVoter && !user.pendingVoter.isApproved,
      isApproved: user.pendingVoter?.isApproved || false,
      voterStatus: user.voterStatus,
      registrationTime: user.pendingVoter?.createdAt || null,
      totalVoters,
      hasVoted
    });
  } catch (error) {
    console.error('Error fetching voter status:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get voter total approved count
app.get('/api/voter/total-approved', verifyToken, async (req, res) => {
  try {
    const count = await PendingVoter.count({
      where: {
        isApproved: true
      }
    });
    res.json({ count });
  } catch (error) {
    console.error('Error getting approved voters count:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get current user's voter information
app.get('/api/voter/me', verifyToken, async (req, res) => {
  try {
    const userId = req.userId;
    const user = await User.findByPk(userId, {
      include: [{
        model: PendingVoter,
        as: 'pendingVoter'
      }]
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!user.pendingVoter || !user.pendingVoter.isApproved) {
      return res.status(400).json({ error: 'User is not an approved voter' });
    }

    res.json({
      cnic: user.pendingVoter.cnic,
      walletAddress: user.pendingVoter.walletAddress,
      isApproved: user.pendingVoter.isApproved
    });
  } catch (error) {
    console.error('Error fetching voter info:', error);
    res.status(500).json({ error: error.message });
  }
});

// Cast vote in election - BACKEND ONLY (blockchain handled by frontend)
app.post('/api/election/vote', verifyToken, async (req, res) => {
  try {
    const { contestantId, voterCnic, walletAddress } = req.body;
    
    if (!contestantId || !voterCnic || !walletAddress) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Find active election using new schema
    const activeElection = await Election.findOne({
      where: {
        status: 'ACTIVE'
      }
    });

    if (!activeElection) {
      return res.status(400).json({ error: 'No active election found' });
    }

    // Verify voter is approved
    const voter = await PendingVoter.findOne({
      where: {
        cnic: voterCnic,
        walletAddress: walletAddress,
        isApproved: true
      }
    });

    if (!voter) {
      return res.status(400).json({ error: 'Voter not approved or not found' });
    }

    // Check if voter has already voted in this election
    const existingVote = await Vote.findOne({
      where: {
        voterCnic: voterCnic,
        electionId: activeElection.id
      }
    });

    if (existingVote) {
      return res.status(400).json({ error: 'You have already voted in this election' });
    }

    // Check if contestant is in the election
    const electionContestant = await ElectionContestant.findOne({
      where: {
        ElectionId: activeElection.id,
        ContestantId: contestantId
      }
    });

    if (!electionContestant) {
      return res.status(400).json({ error: 'Contestant not in current election' });
    }

    // NOTE: The frontend handles blockchain voting first, then calls this endpoint
    // This endpoint only handles the database side to ensure consistency
    
    // Use transaction to ensure atomicity
    await sequelize.transaction(async (t) => {
      // Record the vote to prevent double voting
      await Vote.create({
        voterCnic,
        electionId: activeElection.id,
        contestantId,
        walletAddress
      }, { transaction: t });

      // Update vote count in election-contestant relationship
      electionContestant.voteCount += 1;
      await electionContestant.save({ transaction: t });
    });

    console.log(`Vote recorded: Voter ${voterCnic} voted for contestant ${contestantId} in election ${activeElection.id}`);

    res.json({ 
      message: 'Vote cast successfully',
      contestantId,
      newVoteCount: electionContestant.voteCount,
      electionId: activeElection.id
    });
  } catch (error) {
    console.error('Error casting vote:', error);
    res.status(500).json({ error: error.message });
  }
});

// Admin Routes
app.post('/api/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const admin = await Admin.findOne({ where: { username } });
    
    if (!admin) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValidPassword = await bcrypt.compare(password, admin.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { adminId: admin.id },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );

    res.json({
      token,
      message: 'Login successful'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/pending-voters', verifyAdminToken, async (req, res) => {
  try {
    const voters = await PendingVoter.findAll({
      where: { isApproved: false },
      include: [{
        model: User,
        as: 'user',
        attributes: ['firstName', 'lastName', 'email']
      }]
    });
    res.json(voters);
  } catch (error) {
    console.error('Error fetching pending voters:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/approved-voters', verifyAdminToken, async (req, res) => {
  try {
    const voters = await PendingVoter.findAll({
      where: { isApproved: true },
      include: [{
        model: User,
        as: 'user',
        attributes: ['firstName', 'lastName', 'email']
      }]
    });
    res.json(voters);
  } catch (error) {
    console.error('Error fetching approved voters:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/approved-voters-count', verifyAdminToken, async (req, res) => {
  try {
    const count = await PendingVoter.count({
      where: { isApproved: true }
    });
    res.json({ count });
  } catch (error) {
    console.error('Error fetching approved voters count:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/approve-voter/:id', verifyAdminToken, async (req, res) => {
  try {
    const voter = await PendingVoter.findByPk(req.params.id, {
      include: [{
        model: User,
        as: 'user'
      }]
    });

    if (!voter) {
      return res.status(404).json({ error: 'Voter not found' });
    }

    // Check if the voter was already approved
    const wasAlreadyApproved = voter.isApproved;

    // STEP 1: MANDATORY blockchain voter approval
    let blockchainApproved = false;
    try {
      const web3 = await initializeWeb3();
      const contract = await initializeContract(web3);
      
      // Approve voter on blockchain
      await executeBlockchainTransaction(
        web3,
        contract,
        'approveVoter',
        [voter.cnic],
        {
          from: process.env.ADMIN_ETHEREUM_ADDRESS
        }
      );
      
      console.log(`Voter ${voter.cnic} approved successfully on blockchain`);
      blockchainApproved = true;
    } catch (blockchainError) {
      console.error(`Blockchain approval failed for voter ${voter.cnic}:`, blockchainError);
      return res.status(500).json({ 
        error: 'Failed to approve voter on blockchain',
        details: blockchainError.message
      });
    }

    // STEP 2: Only if blockchain succeeds, update database
    if (blockchainApproved) {
      await voter.update({ isApproved: true });
      await voter.user.update({ 
        isVoter: true,
        voterStatus: 'approved'
      });

      // Only update election counts if this is a new approval
      if (!wasAlreadyApproved) {
        // Update total voters count for active/pending elections
        const activeElections = await Election.findAll({
          where: {
            status: {
              [Op.in]: ['CREATED', 'ACTIVE'] // Update created and active elections
            }
          }
        });

        // Get new total approved voters count
        const approvedVotersCount = await PendingVoter.count({
          where: { isApproved: true }
        });

        // Update all active/pending elections with new total
        await Promise.all(activeElections.map(election =>
          election.update({ totalVoters: approvedVotersCount })
        ));
      }

      // Send approval email
      const template = emailTemplates.voterApproval(voter.user.firstName, voter.user.lastName);
      await transporter.sendMail({
        from: `"Block Vote" <${process.env.EMAIL_USER}>`,
        to: voter.user.email,
        subject: template.subject,
        html: template.html
      });

      console.log(`Voter ${voter.cnic} approved successfully in database`);
      res.json({ message: 'Voter approved successfully on blockchain and database' });
    }
  } catch (error) {
    console.error('Error approving voter:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/reject-voter/:id', verifyAdminToken, async (req, res) => {
  try {
    const voter = await PendingVoter.findByPk(req.params.id, {
      include: [{
        model: User,
        as: 'user'
      }]
    });

    if (!voter) {
      return res.status(404).json({ error: 'Voter not found' });
    }

    // Check if the voter was previously approved
    const wasApproved = voter.isApproved;

    // Send rejection email before deleting the record
    const template = emailTemplates.voterRejection(voter.user.firstName, voter.user.lastName);
    await transporter.sendMail({
      from: `"Block Vote" <${process.env.EMAIL_USER}>`,
      to: voter.user.email,
      subject: template.subject,
      html: template.html
    });

    // Update user status
    await voter.user.update({ 
      isVoter: false,
      voterStatus: 'not_registered'  // Reset to not_registered so they can register again
    });

    // Delete the voter registration completely
    await voter.destroy();

    if (wasApproved) {
      // Only update elections if the voter was previously approved
      // Update total voters count for active/pending elections
      const activeElections = await Election.findAll({
        where: {
          status: {
            [Op.in]: ['CREATED', 'ACTIVE'] // Update created and active elections
          }
        }
      });

      // Get new total approved voters count
      const approvedVotersCount = await PendingVoter.count({
        where: { isApproved: true }
      });

      // Update all active/pending elections with new total
      await Promise.all(activeElections.map(election =>
        election.update({ totalVoters: approvedVotersCount })
      ));
    }

    res.json({ message: 'Voter rejected successfully' });
  } catch (error) {
    console.error('Error rejecting voter:', error);
    res.status(500).json({ error: error.message });
  }
});

// Contestants Management Routes
app.get('/api/admin/contestants', verifyAdminToken, async (req, res) => {
  try {
    const contestants = await Contestant.findAll();
    res.json(contestants);
  } catch (error) {
    console.error('Error fetching contestants:', error);
    res.status(500).json({ error: 'Failed to fetch contestants' });
  }
});

app.post('/api/admin/contestants', verifyAdminToken, async (req, res) => {
  try {
    const { name, age, cnic, qualification } = req.body;

    // Validate input
    if (!name || !age || !cnic || !qualification) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Check if contestant with CNIC already exists
    const existingContestant = await Contestant.findOne({ where: { cnic } });
    if (existingContestant) {
      return res.status(400).json({ error: 'Contestant with this CNIC already exists' });
    }

    // Check if there's an active election
    const activeElection = await Election.findOne({
      where: {
        status: 'ACTIVE'
      }
    });

    if (activeElection) {
      return res.status(400).json({ error: 'Cannot add contestants while an election is active' });
    }

    // Create contestant in database
    const contestant = await Contestant.create({
      name,
      age,
      cnic,
      qualification
    });

    // Add contestant to blockchain
    try {
      const web3 = await initializeWeb3();
      const contract = await initializeContract(web3);
      
      console.log('Adding contestant to blockchain:', {
        id: contestant.id,
        name: contestant.name,
        age: contestant.age,
        cnic: contestant.cnic,
        qualification: contestant.qualification
      });
      
      await executeBlockchainTransaction(
        web3,
        contract,
        'addContestant',
        [contestant.name, contestant.age, contestant.cnic, contestant.qualification],
        {
          from: process.env.ADMIN_ETHEREUM_ADDRESS
        }
      );
      
      console.log('Contestant added successfully to blockchain');
    } catch (blockchainError) {
      console.error('Blockchain contestant creation failed:', blockchainError);
      
      // If blockchain fails, we should clean up the database contestant
      await contestant.destroy();
      
      throw new Error('Failed to add contestant to blockchain: ' + blockchainError.message);
    }

    // Log the creation
    console.log('Created contestant:', contestant.toJSON());

    res.status(201).json(contestant);
  } catch (error) {
    console.error('Error creating contestant:', error);
    res.status(500).json({ error: 'Failed to create contestant' });
  }
});

app.delete('/api/admin/contestants/:id', verifyAdminToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if contestant exists
    const contestant = await Contestant.findByPk(id);
    if (!contestant) {
      return res.status(404).json({ error: 'Contestant not found' });
    }

    // Check if contestant is part of any active election
    const activeElection = await Election.findOne({
      where: { status: 'ACTIVE' },
      include: [{
        model: Contestant,
        where: { id: id }
      }]
    });

    if (activeElection) {
      return res.status(400).json({ error: 'Cannot delete contestant who is part of an active election' });
    }

    // First clear election-contestant relationships for this contestant
    await ElectionContestant.destroy({ where: { ContestantId: id } });
    console.log(`Cleared election-contestant relationships for contestant ${id}`);

    // Then delete the contestant
    await contestant.destroy();
    console.log(`Deleted contestant ${id}: ${contestant.name}`);

    res.json({ message: 'Contestant deleted successfully' });
  } catch (error) {
    console.error('Error deleting contestant:', error);
    res.status(500).json({ error: 'Failed to delete contestant' });
  }
});

app.delete('/api/admin/contestants', verifyAdminToken, async (req, res) => {
  try {
    // Check if there's an active election
    const activeElection = await Election.findOne({
      where: {
        status: 'ACTIVE'
      }
    });

    if (activeElection) {
      return res.status(400).json({ error: 'Cannot clear contestants while an election is active' });
    }

    // First clear election-contestant relationships
    await ElectionContestant.destroy({ where: {} });
    console.log('Cleared election-contestant relationships');

    // Then clear all contestants
    await Contestant.destroy({ where: {} });
    console.log('Cleared all contestants');

    res.json({ message: 'All contestants cleared successfully' });
  } catch (error) {
    console.error('Error clearing contestants:', error);
    res.status(500).json({ error: 'Failed to clear contestants' });
  }
});

// Admin: Create new election
app.post('/api/admin/elections', verifyAdminToken, async (req, res) => {
  try {
    console.log('Creating new election with data:', req.body);
    const { name, contestantIds } = req.body;
    
    // Validate input data
    if (!contestantIds) {
      console.error('Missing required fields:', { name, contestantIds });
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Validate contestants
    if (!contestantIds || !Array.isArray(contestantIds) || contestantIds.length !== 2) {
      console.error('Invalid contestants:', { contestantIds });
      return res.status(400).json({ error: 'Exactly 2 contestants must be selected' });
    }

    // Verify contestants exist
    const contestants = await Contestant.findAll({
      where: {
        id: contestantIds
      }
    });

    if (contestants.length !== 2) {
      console.error('One or more contestants not found:', { contestantIds, found: contestants.length });
      return res.status(400).json({ error: 'One or more contestants not found' });
    }

    // Get count of approved voters
    const approvedVotersCount = await PendingVoter.count({
      where: { isApproved: true }
    });

    if (approvedVotersCount === 0) {
      console.error('No approved voters found');
      return res.status(400).json({ error: 'Cannot create election without approved voters' });
    }

    // Generate election name if not provided
    const electionName = name || `Election ${new Date().toLocaleDateString()} - ${contestants.map(c => c.name).join(' vs ')}`;

    console.log('Creating election with:', {
      name: electionName,
      approvedVotersCount,
      contestantIds
    });

    // Create election with CREATED status
    const election = await Election.create({
      name: electionName,
      status: 'CREATED',
      totalVoters: approvedVotersCount
    });

    console.log('Election created:', election.id);

    // Add contestants to election (check for existing associations first)
    await Promise.all(contestantIds.map(async contestantId => {
      try {
        // Check if association already exists
        const existingAssociation = await ElectionContestant.findOne({
          where: {
            ElectionId: election.id,
            ContestantId: contestantId
          }
        });

        if (!existingAssociation) {
          await ElectionContestant.create({
            ElectionId: election.id,
            ContestantId: contestantId,
            voteCount: 0
          });
        } else {
          console.log(`Contestant ${contestantId} already associated with election ${election.id}`);
        }
      } catch (error) {
        console.error('Error adding contestant to election:', {
          electionId: election.id,
          contestantId,
          error: error.message
        });
        throw error;
      }
    }));

    console.log('Contestants added to election');

    // MANDATORY: Create election on blockchain during creation step
    let blockchainElectionId = null;
    
    const web3 = await initializeWeb3();
    const contract = await initializeContract(web3);
    
    console.log('Creating election on blockchain with contestants:', contestantIds);
    
    // Ensure contestant IDs are properly formatted as integers
    const formattedContestantIds = contestantIds.map(id => parseInt(id));
    console.log('Formatted contestant IDs:', formattedContestantIds);
    console.log('Type check - Array.isArray:', Array.isArray(formattedContestantIds));
    console.log('Type check - Individual types:', formattedContestantIds.map(id => typeof id));
    
          // SOLUTION: Use the newly deployed contract with simplified 1-parameter function
      console.log('Using newly deployed contract with simplified createElection...');
      
      try {
        console.log('Calling createElection with contestantIds:', formattedContestantIds);
        
        // Estimate gas 
        const gasEstimate = await contract.methods.createElection(formattedContestantIds).estimateGas({
          from: process.env.ADMIN_ETHEREUM_ADDRESS
        });
        
        console.log('Gas estimate successful:', gasEstimate);
        
        // Send transaction
        const result = await contract.methods.createElection(formattedContestantIds).send({
          from: process.env.ADMIN_ETHEREUM_ADDRESS,
          gas: Math.ceil(Number(gasEstimate) * 1.2)
        });
        
        console.log('Transaction successful with new contract:', result.transactionHash);
        
      } catch (newContractError) {
        console.error('New contract call failed:', newContractError.message);
        
        // If blockchain fails, clean up database election
        await election.destroy();
        await ElectionContestant.destroy({ where: { ElectionId: election.id } });
        
        throw new Error(`Failed to call new deployed contract: ${newContractError.message}`);
      }
    
    // Get the new blockchain election ID
    const currentElectionId = await contract.methods.currentElectionId().call();
    blockchainElectionId = parseInt(currentElectionId);
    
    // Update election with blockchain ID
    await election.update({
      blockchainElectionId: blockchainElectionId
    });
    
    console.log('Election created on blockchain with ID:', blockchainElectionId);

    // Fetch the complete election data with contestants
    const completeElection = await Election.findOne({
      where: { id: election.id },
      include: [{
        model: Contestant,
        through: { attributes: ['voteCount'] }
      }]
    });

    if (!completeElection) {
      throw new Error('Failed to fetch created election');
    }

    console.log('Sending response with complete election data');
    res.status(201).json({
      ...completeElection.toJSON(),
      blockchainElectionId,
      message: 'Election created successfully on both database and blockchain. Ready to start with MetaMask.'
    });
  } catch (error) {
    console.error('Error creating election:', error);
    res.status(500).json({ 
      error: 'Failed to create election',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Admin: Start election
app.post('/api/admin/elections/:id/start', verifyAdminToken, async (req, res) => {
  try {
    const electionId = parseInt(req.params.id);
    const { durationMinutes } = req.body;
    
    console.log('Starting election:', electionId, 'Duration:', durationMinutes, 'minutes');

    // Validate duration
    if (!durationMinutes || durationMinutes < 15 || durationMinutes > 1440) {
      return res.status(400).json({ 
        error: 'Duration must be between 15 minutes and 1440 minutes (24 hours)' 
      });
    }

    // Find election
    const election = await Election.findByPk(electionId);
    if (!election) {
      return res.status(404).json({ error: 'Election not found' });
    }

    if (election.status !== 'CREATED') {
      return res.status(400).json({ error: 'Election is not in CREATED state' });
    }

    // Get contestants for this election for blockchain creation
    const electionContestants = await ElectionContestant.findAll({
      where: { ElectionId: electionId }
    });
    const contestantIds = electionContestants.map(ec => ec.ContestantId);

        // MANDATORY blockchain election start (election should already be created)
    let blockchainStarted = false;
    let blockchainElectionId = election.blockchainElectionId;
    
    if (!blockchainElectionId) {
      return res.status(400).json({ 
        error: 'Cannot start election: No blockchain election ID found. Election must be created on blockchain first.' 
      });
    }
    
    const web3 = await initializeWeb3();
    const contract = await initializeContract(web3);
    
    // Start the already-created election on blockchain
    console.log('Starting election on blockchain:', blockchainElectionId);
    
    await executeBlockchainTransaction(
      web3,
      contract,
      'startElection',
      [blockchainElectionId],
      {
        from: process.env.ADMIN_ETHEREUM_ADDRESS
      }
    );
    
    console.log('Election started successfully on blockchain');
    blockchainStarted = true;

    // Calculate scheduled end time
    const startTime = new Date();
    const scheduledEndTime = new Date(startTime.getTime() + (durationMinutes * 60 * 1000));
    
    // Update election status in database
    await election.update({
      status: 'ACTIVE',
      startedAt: startTime,
      scheduledEndTime: scheduledEndTime,
      durationMinutes: durationMinutes
    });
    
    // Schedule automatic election end
    scheduleElectionEnd(electionId, scheduledEndTime);
    console.log(`Election ${electionId} scheduled to end at:`, scheduledEndTime.toISOString());

    const updatedElection = await Election.findOne({
      where: { id: electionId },
      include: [{
        model: Contestant,
        through: { attributes: ['voteCount'] }
      }]
    });

    console.log('Election started successfully');
    res.json({
      ...updatedElection.toJSON(),
      blockchainStarted,
      message: 'Election started successfully on both database and blockchain'
    });
  } catch (error) {
    console.error('Error starting election:', error);
    res.status(500).json({ error: error.message });
  }
});

// Admin: End election
app.post('/api/admin/elections/:id/end', verifyAdminToken, async (req, res) => {
  try {
    const electionId = parseInt(req.params.id);
    console.log('Ending election:', electionId);

    // Find election
    const election = await Election.findByPk(electionId);
    if (!election) {
      return res.status(404).json({ error: 'Election not found' });
    }

    if (election.status !== 'ACTIVE') {
      return res.status(400).json({ error: 'Election is not active' });
    }

    // MANDATORY blockchain election end
    let blockchainEnded = false;
    if (!election.blockchainElectionId) {
      return res.status(400).json({ 
        error: 'Cannot end election: No blockchain election ID found. Election must exist on blockchain.' 
      });
    }
    
    const web3 = await initializeWeb3();
    const contract = await initializeContract(web3);
    
    console.log('Ending election on blockchain:', election.blockchainElectionId);
    
    await executeBlockchainTransaction(
      web3,
      contract,
      'endElection',
      [election.blockchainElectionId],
      {
        from: process.env.ADMIN_ETHEREUM_ADDRESS
      }
    );
    
    console.log('Election ended successfully on blockchain');
    blockchainEnded = true;

    // Clear any scheduled timer for this election
    if (activeElectionTimers.has(electionId)) {
      clearTimeout(activeElectionTimers.get(electionId));
      activeElectionTimers.delete(electionId);
      console.log(`Cleared scheduled timer for election ${electionId}`);
    }
    
    // Update election status in database
    await election.update({
      status: 'ENDED',
      endedAt: new Date()
    });

    const updatedElection = await Election.findOne({
      where: { id: electionId },
      include: [{
        model: Contestant,
        through: { attributes: ['voteCount'] }
      }]
    });

    console.log('Election ended successfully');
    res.json({
      ...updatedElection.toJSON(),
      blockchainEnded,
      message: 'Election ended successfully on both database and blockchain'
    });
  } catch (error) {
    console.error('Error ending election:', error);
    res.status(500).json({ error: error.message });
  }
});

// Admin: Get all elections with contestants and vote counts
app.get('/api/admin/elections', verifyAdminToken, async (req, res) => {
  try {
    const elections = await Election.findAll({
      include: [{
        model: Contestant,
        through: { attributes: ['voteCount'] }
      }],
      order: [['createdAt', 'DESC']]
    });

    // Transform the data to include proper status
    const transformedElections = elections.map(election => {
      // Sort contestants by vote count in descending order
      const sortedContestants = election.Contestants.sort((a, b) => 
        b.ElectionContestant.voteCount - a.ElectionContestant.voteCount
      );

      // Determine the winner
      let winner = null;
      if (sortedContestants.length >= 2 && election.status === 'ENDED') {
        const firstPlace = sortedContestants[0];
        const secondPlace = sortedContestants[1];
        
        if (firstPlace.ElectionContestant.voteCount === secondPlace.ElectionContestant.voteCount) {
          winner = 'Draw';
        } else if (firstPlace.ElectionContestant.voteCount > secondPlace.ElectionContestant.voteCount) {
          winner = `${firstPlace.name} (${firstPlace.ElectionContestant.voteCount} votes)`;
        }
      }
      
      const totalVotes = election.Contestants.reduce((sum, contestant) => 
        sum + contestant.ElectionContestant.voteCount, 0);

      return {
        id: election.id,
        name: election.name,
        status: election.status,
        createdAt: election.createdAt,
        startedAt: election.startedAt,
        endedAt: election.endedAt,
        scheduledEndTime: election.scheduledEndTime,
        durationMinutes: election.durationMinutes,
        contestants: sortedContestants.map(contestant => ({
          id: contestant.id,
          name: contestant.name,
          voteCount: contestant.ElectionContestant.voteCount
        })),
        totalVotes: totalVotes,
        totalVoters: election.totalVoters,
        winner: winner
      };
    });

    res.json(transformedElections);
  } catch (error) {
    console.error('Error fetching elections:', error);
    res.status(500).json({ error: error.message });
  }
});



// Admin: Get completed elections with results
app.get('/api/admin/election-results', verifyAdminToken, async (req, res) => {
  try {
    console.log('Fetching completed elections...');
    const completedElections = await Election.findAll({
      where: {
        endedAt: {
          [Op.not]: null  // Only get elections that have ended
        }
      },
      include: [{
        model: Contestant,
        through: { attributes: ['voteCount'] }
      }],
      order: [['endedAt', 'DESC']]  // Most recent first
    });

    console.log(`Found ${completedElections.length} completed elections`);

    // Transform and enrich the data
    const enrichedResults = completedElections.map(election => {
      const totalVotes = election.Contestants.reduce(
        (sum, contestant) => sum + (contestant.ElectionContestant.voteCount || 0), 
        0
      );

      // Sort contestants by vote count
      const sortedContestants = [...election.Contestants].sort(
        (a, b) => (b.ElectionContestant.voteCount || 0) - (a.ElectionContestant.voteCount || 0)
      );

      // Initialize winner with a default value
      let winner = {
        status: 'draw',
        contestant: null
      };

      // Calculate winner only if there are contestants
      if (sortedContestants.length > 0) {
        const firstPlace = sortedContestants[0];
        
        if (sortedContestants.length === 1 || 
            (sortedContestants.length >= 2 && 
             (firstPlace.ElectionContestant.voteCount || 0) > (sortedContestants[1].ElectionContestant.voteCount || 0))) {
          winner = {
            status: 'decided',
            contestant: {
              id: firstPlace.id,
              name: firstPlace.name,
              voteCount: firstPlace.ElectionContestant.voteCount || 0,
              percentage: totalVotes > 0 
                ? ((firstPlace.ElectionContestant.voteCount || 0) / totalVotes * 100).toFixed(2)
                : '0.00'
            }
          };
        }
      }

      // Calculate turnout
      const turnoutPercentage = election.totalVoters > 0 
        ? (totalVotes / election.totalVoters * 100).toFixed(2)
        : '0.00';

      const result = {
        id: election.id,
        name: election.name,
        status: election.status,
        createdAt: election.createdAt,
        startedAt: election.startedAt,
        endedAt: election.endedAt,
        scheduledEndTime: election.scheduledEndTime,
        durationMinutes: election.durationMinutes,
        totalVoters: election.totalVoters || 0,
        totalVotes: totalVotes || 0,
        turnoutPercentage,
        winner,
        contestants: sortedContestants.map(contestant => ({
          id: contestant.id,
          name: contestant.name,
          voteCount: contestant.ElectionContestant.voteCount || 0,
          percentage: totalVotes > 0 
            ? ((contestant.ElectionContestant.voteCount || 0) / totalVotes * 100).toFixed(2)
            : '0.00'
        }))
      };

      console.log(`Processed election ${election.id}:`, result);
      return result;
    });

    res.json(enrichedResults);
  } catch (error) {
    console.error('Error fetching election results:', error);
    res.status(500).json({ error: error.message });
  }
});

// Admin: Get detailed results for a specific election
app.get('/api/admin/election-results/:id', verifyAdminToken, async (req, res) => {
  try {
    const election = await Election.findOne({
      where: { 
        id: req.params.id,
        endedAt: {
          [Op.not]: null  // Only get elections that have ended
        }
      },
      include: [{
        model: Contestant,
        through: { attributes: ['voteCount'] }
      }]
    });

    if (!election) {
      return res.status(404).json({ error: 'Election not found or not completed' });
    }

    // Get vote timeline data from blockchain
    const web3 = new Web3(process.env.ETHEREUM_NODE_URL);
    const contract = new web3.eth.Contract(VotingSystem.abi, process.env.CONTRACT_ADDRESS);
    
    // Calculate detailed statistics
    const totalVotes = election.Contestants.reduce(
      (sum, contestant) => sum + contestant.ElectionContestant.voteCount, 
      0
    );

    const sortedContestants = [...election.Contestants].sort(
      (a, b) => b.ElectionContestant.voteCount - a.ElectionContestant.voteCount
    );

    const detailedResults = {
      id: election.id,
      name: election.name,
      status: election.status,
      createdAt: election.createdAt,
      startedAt: election.startedAt,
      endedAt: election.endedAt,
      scheduledEndTime: election.scheduledEndTime,
      durationMinutes: election.durationMinutes,
      statistics: {
        totalVoters: election.totalVoters,
        totalVotes,
        turnoutPercentage: (totalVotes / election.totalVoters * 100).toFixed(2),
        averageVotesPerHour: election.startedAt && election.endedAt ? totalVotes / 
          (Math.max(1, Math.ceil((new Date(election.endedAt) - new Date(election.startedAt)) / (1000 * 60 * 60)))) : 0
      },
      contestants: sortedContestants.map(contestant => ({
        id: contestant.id,
        name: contestant.name,
        voteCount: contestant.ElectionContestant.voteCount,
        percentage: (contestant.ElectionContestant.voteCount / totalVotes * 100).toFixed(2)
      }))
    };

    res.json(detailedResults);
  } catch (error) {
    console.error('Error fetching detailed election results:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get current active election
app.get('/api/election/current', async (req, res) => {
  try {
    const election = await Election.findOne({
      where: {
        status: 'ACTIVE'
      },
      include: [{
        model: Contestant,
        through: { attributes: ['voteCount'] }
      }]
    });

    if (!election) {
      return res.status(404).json({ error: 'No active election found' });
    }

    res.json({
      id: election.id,
      name: election.name,
      status: election.status,
      startedAt: election.startedAt,
      scheduledEndTime: election.scheduledEndTime,
      durationMinutes: election.durationMinutes,
      isActive: election.status === 'ACTIVE',
      contestants: election.Contestants.map(contestant => ({
        id: contestant.id,
        name: contestant.name,
        voteCount: contestant.ElectionContestant.voteCount
      })),
      totalVoters: election.totalVoters
    });
  } catch (error) {
    console.error('Error fetching current election:', error);
    res.status(500).json({ error: error.message });
  }
});

// Public: Get completed elections with results (for users)
app.get('/api/election/completed', async (req, res) => {
  try {
    console.log('Fetching completed elections for user...');
    const completedElections = await Election.findAll({
      where: {
        endedAt: {
          [Op.not]: null  // Only get elections that have ended
        }
      },
      include: [{
        model: Contestant,
        through: { attributes: ['voteCount'] }
      }],
      order: [['endedAt', 'DESC']]  // Most recent first
    });

    console.log(`Found ${completedElections.length} completed elections for user`);

    // Transform and enrich the data
    const enrichedResults = completedElections.map(election => {
      const totalVotes = election.Contestants.reduce(
        (sum, contestant) => sum + (contestant.ElectionContestant.voteCount || 0), 
        0
      );

      // Sort contestants by vote count
      const sortedContestants = [...election.Contestants].sort(
        (a, b) => (b.ElectionContestant.voteCount || 0) - (a.ElectionContestant.voteCount || 0)
      );

      // Initialize winner with a default value
      let winner = {
        status: 'draw',
        contestant: null
      };

      // Calculate winner only if there are contestants
      if (sortedContestants.length > 0) {
        const firstPlace = sortedContestants[0];
        
        if (sortedContestants.length === 1 || 
            (sortedContestants.length >= 2 && 
             (firstPlace.ElectionContestant.voteCount || 0) > (sortedContestants[1].ElectionContestant.voteCount || 0))) {
          winner = {
            status: 'decided',
            contestant: {
              id: firstPlace.id,
              name: firstPlace.name,
              voteCount: firstPlace.ElectionContestant.voteCount || 0,
              percentage: totalVotes > 0 
                ? ((firstPlace.ElectionContestant.voteCount || 0) / totalVotes * 100).toFixed(2)
                : '0.00'
            }
          };
        }
      }

      // Calculate turnout
      const turnoutPercentage = election.totalVoters > 0 
        ? (totalVotes / election.totalVoters * 100).toFixed(2)
        : '0.00';

      const result = {
        id: election.id,
        name: election.name,
        status: election.status,
        createdAt: election.createdAt,
        startedAt: election.startedAt,
        endedAt: election.endedAt,
        scheduledEndTime: election.scheduledEndTime,
        durationMinutes: election.durationMinutes,
        totalVoters: election.totalVoters || 0,
        totalVotes: totalVotes || 0,
        turnoutPercentage,
        winner,
        contestants: sortedContestants.map(contestant => ({
          id: contestant.id,
          name: contestant.name,
          voteCount: contestant.ElectionContestant.voteCount || 0,
          percentage: totalVotes > 0 
            ? ((contestant.ElectionContestant.voteCount || 0) / totalVotes * 100).toFixed(2)
            : '0.00'
        }))
      };

      console.log(`Processed election ${election.id} for user:`, result);
      return result;
    });

    res.json(enrichedResults);
  } catch (error) {
    console.error('Error fetching completed elections for user:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get election status (alias for current election)
app.get('/api/election/status', async (req, res) => {
  try {
    const election = await Election.findOne({
      where: {
        status: 'ACTIVE'
      },
      include: [{
        model: Contestant,
        through: { attributes: ['voteCount'] }
      }]
    });

    if (!election) {
      return res.status(404).json({ error: 'No active election found' });
    }

    res.json({
      id: election.id,
      name: election.name,
      status: election.status,
      startedAt: election.startedAt,
      scheduledEndTime: election.scheduledEndTime,
      durationMinutes: election.durationMinutes,
      isActive: election.status === 'ACTIVE',
      contestants: election.Contestants.map(contestant => ({
        id: contestant.id,
        name: contestant.name,
        voteCount: contestant.ElectionContestant.voteCount
      })),
      totalVoters: election.totalVoters
    });
  } catch (error) {
    console.error('Error fetching election status:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get current election phase
app.get('/api/election/phase', async (req, res) => {
  try {
    const contract = await getContract();
    const currentElectionId = await contract.methods.currentElectionId().call();
    
    if (!currentElectionId || currentElectionId === '0') {
      return res.json({ phase: 'registration' });
    }

    const election = await contract.methods.elections(currentElectionId).call();
    const now = Math.floor(Date.now() / 1000);

    if (!election.isActive) {
      return res.json({ phase: 'registration' });
    }

    if (now < parseInt(election.startTime)) {
      return res.json({ phase: 'registration' });
    }

    if (now > parseInt(election.endTime)) {
      return res.json({ phase: 'result' });
    }

    return res.json({ phase: 'voting' });
  } catch (error) {
    console.error('Error getting election phase:', error);
    res.status(500).json({ error: 'Failed to get election phase' });
  }
});

// Get voting details for current or specific election (public endpoint)
app.get('/api/election/voting-details/:electionId?', async (req, res) => {
  try {
    let electionId = req.params.electionId;
    
    // If no electionId provided, get current active election
    if (!electionId) {
      const activeElection = await Election.findOne({
        where: { status: 'ACTIVE' }
      });
      
      if (!activeElection) {
        return res.status(404).json({ error: 'No active election found' });
      }
      
      electionId = activeElection.id;
    }

    // Get all votes for this election with contestant details
    const votes = await Vote.findAll({
      where: { electionId: electionId },
      include: [
        {
          model: Contestant,
          as: 'Contestant',
          attributes: ['id', 'name']
        }
      ],
      order: [['createdAt', 'DESC']] // Most recent votes first
    });

    // Transform the data to include voter CNIC, wallet address, and contestant info
    const votingDetails = votes.map(vote => ({
      voterCnic: vote.voterCnic,
      walletAddress: vote.walletAddress,
      contestantId: vote.contestantId,
      contestantName: vote.Contestant ? vote.Contestant.name : 'Unknown',
      voteTime: vote.createdAt
    }));

    res.json({
      electionId: electionId,
      totalVotes: votingDetails.length,
      votingDetails: votingDetails
    });
  } catch (error) {
    console.error('Error fetching voting details:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all contestants (public endpoint)
app.get('/api/contestants', async (req, res) => {
  try {
    const contestants = await Contestant.findAll({
      order: [['createdAt', 'ASC']]
    });
    res.json(contestants);
  } catch (error) {
    console.error('Error fetching contestants:', error);
    res.status(500).json({ error: error.message });
  }
});

// Debug endpoints for contestant management
app.get('/api/debug/contestants', async (req, res) => {
  try {
    // Check active elections
    const activeElection = await Election.findOne({
      where: {
        status: 'ACTIVE'
      }
    });
    
    console.log('Active election status:', activeElection ? 'Found active election' : 'No active election');

    // Get all contestants
    const contestants = await Contestant.findAll();
    console.log('Current contestants in database:', contestants.map(c => ({
      id: c.id,
      name: c.name,
      cnic: c.cnic
    })));

    // Get election-contestant relationships
    const electionContestants = await ElectionContestant.findAll();
    console.log('Current election-contestant relationships:', electionContestants);

    res.json({
      activeElection: activeElection,
      contestants: contestants,
      electionContestants: electionContestants
    });
  } catch (error) {
    console.error('Error checking contestants:', error);
    res.status(500).json({ error: error.message });
  }
});

// Debug endpoint for election synchronization
app.get('/api/debug/election-sync', async (req, res) => {
  try {
    // Check database elections
    const dbElections = await Election.findAll({
      include: [{
        model: Contestant,
        through: { attributes: ['voteCount'] }
      }]
    });

    // Check blockchain election
    let blockchainElection = null;
    try {
      const contract = await getContract();
      const currentElectionId = await contract.methods.currentElectionId().call();
      if (currentElectionId && currentElectionId !== '0') {
        blockchainElection = await contract.methods.elections(currentElectionId).call();
      }
    } catch (blockchainError) {
      console.error('Blockchain error:', blockchainError);
    }

    res.json({
      database: {
        elections: dbElections,
        count: dbElections.length
      },
      blockchain: {
        currentElectionId: blockchainElection ? blockchainElection.id : null,
        election: blockchainElection
      }
    });
  } catch (error) {
    console.error('Error checking election sync:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/debug/clear-contestants', async (req, res) => {
  try {
    console.log('Starting force clear of contestants...');
    
    // First clear election-contestant relationships with force
    await ElectionContestant.destroy({ 
      where: {},
      force: true,
      truncate: true
    });
    console.log('Cleared election-contestant relationships');
    
    // Then clear contestants with force
    await Contestant.destroy({ 
      where: {},
      force: true,
      truncate: true
    });
    console.log('Cleared all contestants');

    // Reset the auto-increment counter
    await sequelize.query('DELETE FROM sqlite_sequence WHERE name = "Contestants"');
    console.log('Reset auto-increment counter');
    
    // Verify the deletion
    const remainingContestants = await Contestant.findAll();
    console.log('Remaining contestants after clear:', remainingContestants);
    
    res.json({ 
      message: 'Successfully cleared all contestants and relationships',
      remainingCount: remainingContestants.length
    });
  } catch (error) {
    console.error('Error clearing contestants:', error);
    res.status(500).json({ error: error.message });
  }
});

// Initialize database
const initializeDatabase = async () => {
  try {
    // Enable foreign key support
    await sequelize.query('PRAGMA foreign_keys = ON');

    // First, try to authenticate the connection
    await sequelize.authenticate();
    console.log('Database connection established successfully.');

    // Force reset database to fix constraint issues
    console.log('Resetting database to fix schema conflicts...');
    
    // Drop all tables and recreate them with correct constraints
    await sequelize.drop();
    await sequelize.sync({ force: true });
    
    console.log('Database schema reset successfully with correct constraints');

    // Create default admin account if it doesn't exist
    const adminExists = await Admin.findOne({ where: { username: 'admin' } });
    if (!adminExists) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await Admin.create({
        username: 'admin',
        password: hashedPassword
      });
      console.log('Default admin account created');
    }

    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
    
    // If all else fails, delete the database file and start fresh
    try {
      const fs = require('fs');
      const path = require('path');
      const dbPath = path.join(__dirname, 'database.sqlite');
      
      if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
        console.log('Deleted corrupted database file');
        
        // Try initialization one more time
        await sequelize.sync({ force: true });
        
        // Create default admin account
        const hashedPassword = await bcrypt.hash('admin123', 10);
        await Admin.create({
          username: 'admin',
          password: hashedPassword
        });
        
        console.log('Database recreated successfully');
      }
    } catch (resetError) {
      console.error('Failed to reset database:', resetError);
    }
  }
};

// Initialize blockchain registration phase
const initializeBlockchainRegistration = async () => {
  try {
    console.log('Initializing blockchain registration phase...');
    
    const web3 = await initializeWeb3();
    const contract = await initializeContract(web3);
    
    // Check if registration phase is active
    const isRegistrationActive = await contract.methods.isRegistrationPhaseActive().call();
    console.log('Registration phase active:', isRegistrationActive);
    
    if (!isRegistrationActive) {
      console.log('Registration phase is not active. Starting registration phase...');
      await executeBlockchainTransaction(
        web3,
        contract,
        'startRegistrationPhase',
        [],
        {
          from: process.env.ADMIN_ETHEREUM_ADDRESS
        }
      );
      console.log('✅ Registration phase started successfully');
    } else {
      console.log('✅ Registration phase is already active');
    }
  } catch (error) {
    console.error('❌ Failed to initialize blockchain registration phase:', error.message);
    console.log('⚠️  Continuing without blockchain integration. Registration will work via database only.');
  }
};

// Function to restore election timers on server restart
const restoreElectionTimers = async () => {
  try {
    const activeElections = await Election.findAll({
      where: { 
        status: 'ACTIVE',
        scheduledEndTime: {
          [Op.gt]: new Date() // Only elections that haven't expired yet
        }
      }
    });

    console.log(`Found ${activeElections.length} active elections to restore timers for`);

    for (const election of activeElections) {
      if (election.scheduledEndTime) {
        scheduleElectionEnd(election.id, new Date(election.scheduledEndTime));
      }
    }
  } catch (error) {
    console.error('Error restoring election timers:', error);
  }
};

// Initialize the database and blockchain
const initializeServer = async () => {
  await initializeDatabase();
  await initializeBlockchainRegistration();
  await restoreElectionTimers();
};

// Initialize server
initializeServer();

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log('⏰ Election timers restored');
}); 